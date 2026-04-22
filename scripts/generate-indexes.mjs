import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appStoreRoot = path.resolve(__dirname, "..");
const appsDirectory = path.join(appStoreRoot, "apps");
const categoriesDirectory = path.join(appStoreRoot, "categories");
const developersDirectory = path.join(appStoreRoot, "developers");
const rootIndexPath = path.join(appStoreRoot, "index.json");
const checkMode = process.argv.includes("--check");

const appFiles = (await readdir(appsDirectory))
  .filter((fileName) => fileName.endsWith(".json"))
  .sort();

const appDefinitions = [];
const seenSlugs = new Set();

for (const fileName of appFiles) {
  const filePath = path.join(appsDirectory, fileName);
  const appDefinition = JSON.parse(await readFile(filePath, "utf8"));

  validateAppDefinition(appDefinition, fileName);

  if (seenSlugs.has(appDefinition.slug)) {
    throw new Error(`Duplicate app slug found: ${appDefinition.slug}`);
  }

  seenSlugs.add(appDefinition.slug);
  appDefinitions.push({
    fileName,
    definition: appDefinition,
  });
}

const categoryIndexes = new Map();
const developerIndexes = new Map();

for (const { fileName, definition } of appDefinitions) {
  const summary = buildSummary(fileName, definition);

  for (const category of definition.categories) {
    const existing = categoryIndexes.get(category.slug) ?? {
      slug: category.slug,
      title: category.name,
      description: category.description,
      apps: [],
    };
    existing.apps.push(summary);
    categoryIndexes.set(category.slug, existing);
  }

  const developer = definition.developer;
  const existingDeveloper = developerIndexes.get(developer.slug) ?? {
    slug: developer.slug,
    title: developer.name,
    description: developer.description,
    apps: [],
  };
  existingDeveloper.apps.push(summary);
  developerIndexes.set(developer.slug, existingDeveloper);
}

const rootIndex = {
  schemaVersion: 1,
  featuredApps: appDefinitions
    .filter(({ definition }) => definition.featured)
    .map(({ fileName, definition }) => buildSummary(fileName, definition)),
  categories: Array.from(categoryIndexes.values())
    .sort((left, right) => left.title.localeCompare(right.title))
    .map((categoryIndex) => ({
      slug: categoryIndex.slug,
      name: categoryIndex.title,
      description: categoryIndex.description,
      appCount: categoryIndex.apps.length,
      url: `./categories/${categoryIndex.slug}.json`,
    })),
  developers: Array.from(developerIndexes.values())
    .sort((left, right) => left.title.localeCompare(right.title))
    .map((developerIndex) => ({
      slug: developerIndex.slug,
      name: developerIndex.title,
      description: developerIndex.description,
      appCount: developerIndex.apps.length,
      url: `./developers/${developerIndex.slug}.json`,
    })),
};

const outputs = new Map();
outputs.set(rootIndexPath, stringify(rootIndex));

for (const categoryIndex of Array.from(categoryIndexes.values()).sort((left, right) =>
  left.title.localeCompare(right.title),
)) {
  outputs.set(
    path.join(categoriesDirectory, `${categoryIndex.slug}.json`),
    stringify({
      schemaVersion: 1,
      slug: categoryIndex.slug,
      title: categoryIndex.title,
      description: categoryIndex.description,
      apps: categoryIndex.apps.map((app) => ({
        ...app,
        appUrl: `../apps/${path.basename(app.appUrl)}`,
        iconUrl: app.iconUrl
          ? `../${app.iconUrl.replace(/^\.\//, "")}`
          : undefined,
      })),
    }),
  );
}

for (const developerIndex of Array.from(developerIndexes.values()).sort((left, right) =>
  left.title.localeCompare(right.title),
)) {
  outputs.set(
    path.join(developersDirectory, `${developerIndex.slug}.json`),
    stringify({
      schemaVersion: 1,
      slug: developerIndex.slug,
      title: developerIndex.title,
      description: developerIndex.description,
      apps: developerIndex.apps.map((app) => ({
        ...app,
        appUrl: `../apps/${path.basename(app.appUrl)}`,
        iconUrl: app.iconUrl
          ? `../${app.iconUrl.replace(/^\.\//, "")}`
          : undefined,
      })),
    }),
  );
}

if (checkMode) {
  const driftedFiles = [];

  for (const [outputPath, expectedContent] of outputs) {
    let currentContent = null;
    try {
      currentContent = await readFile(outputPath, "utf8");
    } catch {
      currentContent = null;
    }

    if (currentContent !== expectedContent) {
      driftedFiles.push(path.relative(appStoreRoot, outputPath));
    }
  }

  if (driftedFiles.length > 0) {
    throw new Error(
      `Generated AppStore indexes are out of date: ${driftedFiles.join(", ")}`,
    );
  }

  process.exit(0);
}

await mkdir(categoriesDirectory, { recursive: true });
await mkdir(developersDirectory, { recursive: true });

for (const [outputPath, content] of outputs) {
  await writeFile(outputPath, content);
}

function validateAppDefinition(appDefinition, fileName) {
  const requiredFields = [
    "slug",
    "name",
    "description",
    "developer",
    "categories",
    "baseConfig",
    "source",
    "standardConfigurations",
    "rawSetup",
  ];

  for (const field of requiredFields) {
    if (!(field in appDefinition)) {
      throw new Error(`${fileName} is missing required field: ${field}`);
    }
  }

  if (!Array.isArray(appDefinition.categories) || appDefinition.categories.length === 0) {
    throw new Error(`${fileName} must declare at least one category.`);
  }

  if (!appDefinition.developer.slug || !appDefinition.developer.name) {
    throw new Error(`${fileName} has an invalid developer definition.`);
  }

  if (
    !appDefinition.baseConfig?.url ||
    !appDefinition.baseConfig?.name ||
    !appDefinition.baseConfig?.plug
  ) {
    throw new Error(`${fileName} must declare a valid baseConfig.`);
  }

  if (!Array.isArray(appDefinition.standardConfigurations)) {
    throw new Error(`${fileName} must declare standardConfigurations as an array.`);
  }

  for (const configuration of appDefinition.standardConfigurations) {
    validateSetup(configuration, fileName, true);
  }

  validateSetup(appDefinition.rawSetup, fileName, false);
}

function validateSetup(setup, fileName, requireMetadata) {
  if (requireMetadata && (!setup.id || !setup.title)) {
    throw new Error(
      `${fileName} standardConfigurations entries must include both id and title.`,
    );
  }

  if (setup?.environments) {
    for (const key of ["mandatory", "defaults", "optional"]) {
      const fields = setup.environments[key];
      if (fields && !Array.isArray(fields)) {
        throw new Error(`${fileName} has invalid environment fields for ${key}.`);
      }
    }
  }
}

function buildSummary(fileName, definition) {
  return {
    slug: definition.slug,
    name: definition.name,
    description: definition.description,
    featured: definition.featured,
    iconUrl: definition.iconUrl
      ? resolveAssetPathFromApp(fileName, definition.iconUrl, ".")
      : undefined,
    appUrl: `./apps/${fileName}`,
    developer: definition.developer,
    categories: definition.categories,
    standardConfigurations: definition.standardConfigurations.map(
      ({ id, title, description }) => ({
        id,
        title,
        description,
      }),
    ),
  };
}

function stringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function resolveAssetPathFromApp(fileName, assetPath, fromDirectory) {
  const resolvedPath = path.posix.normalize(
    path.posix.join(path.posix.dirname(`apps/${fileName}`), assetPath),
  );
  const relativePath = path.posix.relative(fromDirectory, resolvedPath);
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}