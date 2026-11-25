# API Doc OpenAPI Extractor

A Manifest V3 Chrome Extension that crawls open API documentation pages, extracts embedded OpenAPI fragments, merges them into a unified OpenAPI 3.0.1 specification, displays all discovered endpoints in a Side Panel GUI, and exports the specification as JSON or YAML.

## Features

- **One-Click Crawl**: Open any API documentation page and click **Crawl Page** from the Side Panel.
- **Same-Origin Scoped Discovery**: Automatically suggests a path scope prefix from the active tab URL and crawls linked documentation pages (with `.md` companion fallback).
- **OpenAPI 3.0.1 Merging**: Extracts OpenAPI JSON fragments from Markdown or HTML code blocks, deduplicates tags/servers/schemas, and sorts paths and schemas alphabetically.
- **Interactive Endpoint Viewer**: Search by path/summary/tag and filter by HTTP method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
- **Export Options**: Download the unified specification as `.json` or `.yaml`, or copy JSON to clipboard.

## Installation in Google Chrome

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select `/home/littlespidy/myextra/chrome-extensions/openapi-extractor`.
5. Click the extension toolbar icon on any API documentation page to open the Side Panel.

## Testing

```bash
npm test
```

Runs:
- `npm run test:unit`: Unit tests for fragment extraction, link discovery, spec merging, and YAML serialization.
- `npm run qa`: Live Chromium browser QA that loads the unpacked extension, crawls a local mock API documentation site, verifies extracted endpoints in the Side Panel UI, and tests filtering and exports.
