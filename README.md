# CARE AppStore

This directory is a temporary, extraction-friendly App Store repository for CARE plugins.

The App Store is served as static JSON. CARE points to the root index file through `REACT_APP_STORE_INDEX_URL` and uses that index to show featured apps and browse apps by category or developer.

## How It Works

- Every published app is defined by one canonical JSON file in `apps/`.
- Contributors open a pull request that adds or updates exactly those app definition files.
- Generated indexes are written to the AppStore root and browse directories:
  - `index.json` for featured apps, categories, and developers
  - `categories/*.json` for category browse pages
  - `developers/*.json` for developer browse pages
- CARE uses the generated indexes for discovery and fetches the canonical app JSON when an installation flow starts.

## Directory Layout

```text
AppStore/
  apps/                 Canonical app definition JSON files
  categories/           Generated category browse indexes
  developers/           Generated developer browse indexes
  schema/               JSON schema for app definitions
  scripts/              Generator and validation scripts
  index.json            Generated root index referenced by CARE
```

## Contributor Flow

1. Add or update a JSON file in `apps/`.
2. Keep the file aligned with `schema/app.schema.json`.
3. Run `npm run appstore:generate` from the repository root.
4. Commit the canonical app JSON and the generated indexes.
5. Open a pull request.

On pull requests, CI validates that the indexes are up to date. On merge, GitHub Actions regenerate the indexes and commit them back if they changed.

## App Definition Contract

Each app definition contains:

- app metadata: slug, name, description, featured flag
- developer metadata: slug, name, optional URL/description
- category memberships: one or more category objects
- base config: `url`, `name`, and `plug` for the frontend plug
- source metadata: repository and optional app base URL metadata
- one or more standard configurations: config overlays plus mandatory/default/optional/custom environment groups
- one or more standard configurations: config overlays, an optional dedicated app base URL field, plus mandatory/default/optional/custom environment groups
- one raw setup template: fallback configuration for manual editing
- optional health check metadata: API URL and expected success status for pre-enable verification

Environment fields default into `meta.config.<key>`. A setup-level `appBaseUrl` field is treated specially: CARE computes `meta.url` as `${appBaseUrl}/assets/remoteEntry.js` instead of storing `appBaseUrl` as an environment value. Environment fields can still override any target path such as `meta.url` explicitly when needed. Health checks can interpolate environment values using placeholders like `{{apiBaseUrl}}`.

## Local Preview

Generate indexes:

```bash
npm run appstore:generate
```

Serve the directory locally:

```bash
cd AppStore
npx serve .
```

Example root index URL for CARE:

```bash
REACT_APP_STORE_INDEX_URL=http://localhost:3000/index.json
```

## Extraction Later

This directory intentionally avoids assumptions about the surrounding repository. It can be moved into a separate GitHub repository later and served unchanged from GitHub Pages or any other static host.
