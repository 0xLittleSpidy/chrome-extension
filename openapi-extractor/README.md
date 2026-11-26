# API Doc OpenAPI Extractor

A Manifest V3 Chrome Extension that crawls open API documentation pages, extracts embedded OpenAPI fragments, merges them into a unified OpenAPI 3.0.1 specification, displays all discovered endpoints in a Side Panel GUI, and exports the specification as JSON or YAML.

## Features

- **One-Click Crawl**: Open any API documentation page and click **Crawl Page** from the Side Panel.
- **Same-Origin Scoped Discovery**: Automatically suggests a path scope prefix from the active tab URL and crawls linked documentation pages (with `.md` companion fallback).
- **OpenAPI 3.0.1 Merging**: Extracts OpenAPI JSON fragments from Markdown or HTML code blocks, deduplicates tags/servers/schemas, and sorts paths and schemas alphabetically.
- **Interactive Endpoint Viewer**: Search by path/summary/tag and filter by HTTP method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
- **Export Options**: Download the unified specification as `.json` or `.yaml`, or copy JSON to clipboard.

## Supported Hosted API Documentation Sites

The extension holds host permissions for all `http://*/*` and `https://*/*` endpoints. It is not limited to specific domains, but rather by the structure and rendering format of the target site.

### 1. Fully Supported Out-of-the-Box

- **Static Site Generators (SSGs) and Documentation Frameworks**:
  - Docusaurus
  - VitePress and VuePress
  - MkDocs and Material for MkDocs
  - Nextra, Hugo, Jekyll, Sphinx, Astro Starlight
  - Documentation hosted on GitHub Pages, GitLab Pages, and Read the Docs
- **Redoc and Spec-Embedding Documentation**:
  - Redoc standalone deployments and Redocly-hosted sites embedding the specification in `<script id="swagger-data" type="application/json">` or `<script type="application/json">`.
- **Direct OpenAPI / Swagger Specifications**:
  - Direct HTTP endpoints serving OpenAPI/Swagger JSON specifications (for example, `/openapi.json`, `/swagger.json`, `/v3/api-docs`).
- **Developer Portals and Internal Documentation**:
  - Custom internal portals, Spotify Backstage TechDocs, or wikis displaying OpenAPI fragments inside HTML `<pre><code>` or Markdown code blocks.

### 2. Conditionally Supported

- **Modern Single-Page Application (SPA) Portals** (e.g. Mintlify, Fern, ReadMe.com, GitBook):
  - Supported when pages are Server-Side Rendered (SSR) with embedded code blocks, or when the site serves companion markdown files (`.md` or `/index.md`).
  - Purely client-side rendered SPAs without SSR or companion markdown files return empty HTML shells to background fetch requests.

### 3. Current Limitations

- **Standard Swagger UI (`/swagger-ui/`)**: Swagger UI initializes via client-side JavaScript (`SwaggerUIBundle`) and renders interactive elements without embedding raw `<pre><code>` JSON fragments.
- **YAML-Only Code Fences**: The current extractor targets JSON syntax within Markdown fences and HTML elements; YAML-only code fences are not yet extracted.

## How Discovery and Extraction Works

1. **Active Tab Seed**: When a crawl begins, the extension takes a DOM snapshot of the active tab to extract client-rendered links and initial OpenAPI fragments.
2. **Same-Origin Path Crawl**: Follows all discovered links matching the same origin and path prefix (for example, `/docs/`).
3. **Fragment Parsing**: Scans HTML `<pre>`, `<code>`, and `<script>` elements as well as Markdown ````json ```` blocks for valid OpenAPI objects with a `paths` dictionary. HTML entities are unescaped and trailing commas sanitized.
4. **Companion Markdown Fallback**: If an HTML documentation page does not contain inline fragments, the crawler automatically queries `${url}.md` or `${url}index.md`.
5. **Spec Merging**: Merges all discovered paths, deduplicates tags and servers, selects the most detailed component schemas, and produces a valid OpenAPI 3.0.1 specification.

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
