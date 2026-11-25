/**
 * OpenAPI fragment extractor, link discovery, and spec merger.
 * Mirrors the extraction and merging behavior of the Python OpenAPI extractor
 * while supporting live HTML/Markdown API documentation pages.
 */

export const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'delete',
  'patch',
  'options',
  'head',
  'trace'
];

const IGNORED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.css', '.js', '.mjs', '.map', '.woff', '.woff2', '.ttf', '.eot',
  '.pdf', '.zip', '.tar', '.gz', '.mp4', '.webm', '.mp3'
]);

/**
 * Decode common HTML entities found inside syntax-highlighted code blocks.
 * @param {string} str
 * @returns {string}
 */
export function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Parse JSON with trailing-comma sanitization fallback.
 * @param {string} raw
 * @returns {object|null}
 */
export function tryParseJsonWithSanitize(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const sanitized = trimmed.replace(/,\s*([\]\}])/g, '$1');
    try {
      return JSON.parse(sanitized);
    } catch {
      return null;
    }
  }
}

function isValidOpenApiFragment(obj) {
  return Boolean(
    obj &&
    typeof obj === 'object' &&
    !Array.isArray(obj) &&
    obj.paths &&
    typeof obj.paths === 'object' &&
    !Array.isArray(obj.paths) &&
    Object.keys(obj.paths).length > 0
  );
}

/**
 * Extract all valid OpenAPI JSON fragments from Markdown or HTML content.
 * @param {string} content
 * @returns {object[]}
 */
export function extractOpenApiFragments(content) {
  if (!content || typeof content !== 'string') return [];

  const candidates = [];

  // 1. Markdown fenced JSON code blocks (e.g. ````json GET /path \n {...} \n ````)
  const mdJsonRegex = /```+(?:json)?[^\n]*\n(\{[\s\S]*?\})\n```+/g;
  for (const match of content.matchAll(mdJsonRegex)) {
    candidates.push(match[1]);
  }

  // 2. HTML <pre> / <code> / <script type="application/json"> blocks
  const htmlCodeRegex = /<(?:pre|code|script)[^>]*>([\s\S]*?)<\/(?:pre|code|script)>/gi;
  for (const match of content.matchAll(htmlCodeRegex)) {
    const inner = match[1];
    if (!inner.includes('"paths"') && !inner.includes('&quot;paths&quot;') && !inner.includes('"openapi"') && !inner.includes('&quot;openapi&quot;')) {
      continue;
    }
    const stripped = decodeHtmlEntities(inner.replace(/<[^>]+>/g, ''));
    const braceStart = stripped.indexOf('{');
    const braceEnd = stripped.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) {
      candidates.push(stripped.slice(braceStart, braceEnd + 1));
    }
  }

  // 3. Direct JSON document fallback
  const trimmed = content.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    candidates.push(trimmed);
  }

  const fragments = [];
  const seenSignatures = new Set();

  for (const raw of candidates) {
    const parsed = tryParseJsonWithSanitize(raw);
    if (!isValidOpenApiFragment(parsed)) continue;

    const sig = JSON.stringify(Object.keys(parsed.paths).sort());
    const fullSig = `${sig}:${Object.values(parsed.paths).map(p => Object.keys(p || {}).sort().join(',')).join('|')}`;
    if (!seenSignatures.has(fullSig)) {
      seenSignatures.add(fullSig);
      fragments.push(parsed);
    }
  }

  return fragments;
}

/**
 * Suggest a default crawl path prefix from a starting URL.
 * @param {string} urlString
 * @returns {string}
 */
export function suggestPathPrefix(urlString) {
  try {
    const parsed = new URL(urlString);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return '/';
    return `/${segments[0]}/`;
  } catch {
    return '/';
  }
}

/**
 * Normalize a URL by stripping its hash fragment.
 * Returns null for non-http(s) or invalid URLs.
 * @param {string} rawUrl
 * @param {string} baseUrl
 * @returns {string|null}
 */
export function normalizeCrawlUrl(rawUrl, baseUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('mailto:') || trimmed.startsWith('javascript:')) {
    return null;
  }
  try {
    const url = new URL(trimmed, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Check whether a URL is eligible for crawling under the given origin and prefix.
 * @param {string} urlString
 * @param {string} targetOrigin
 * @param {string} pathPrefix
 * @returns {boolean}
 */
export function isCrawlableUrl(urlString, targetOrigin, pathPrefix = '/') {
  try {
    const url = new URL(urlString);
    if (url.origin !== targetOrigin) return false;

    const lowerPath = url.pathname.toLowerCase();
    for (const ext of IGNORED_EXTENSIONS) {
      if (lowerPath.endsWith(ext)) return false;
    }

    if (pathPrefix && pathPrefix !== '/') {
      const normalizedPrefix = pathPrefix.startsWith('/') ? pathPrefix : `/${pathPrefix}`;
      const prefixWithoutTrailing = normalizedPrefix.endsWith('/')
        ? normalizedPrefix.slice(0, -1)
        : normalizedPrefix;
      if (!url.pathname.startsWith(normalizedPrefix) && url.pathname !== prefixWithoutTrailing) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Extract same-origin crawlable links from raw HTML.
 * @param {string} html
 * @param {string} baseUrl
 * @param {{ origin?: string, pathPrefix?: string }} [options]
 * @returns {string[]}
 */
export function extractLinksFromHtml(html, baseUrl, options = {}) {
  if (!html || typeof html !== 'string') return [];

  let origin = options.origin;
  if (!origin) {
    try {
      origin = new URL(baseUrl).origin;
    } catch {
      return [];
    }
  }
  const pathPrefix = options.pathPrefix ?? '/';

  const hrefRegex = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  const seen = new Set();
  const links = [];

  for (const match of html.matchAll(hrefRegex)) {
    const rawHref = match[1] ?? match[2] ?? match[3];
    const normalized = normalizeCrawlUrl(decodeHtmlEntities(rawHref), baseUrl);
    if (!normalized || seen.has(normalized)) continue;
    if (isCrawlableUrl(normalized, origin, pathPrefix)) {
      seen.add(normalized);
      links.push(normalized);
    }
  }

  return links;
}

/**
 * Merge extracted OpenAPI fragments into a unified OpenAPI 3.0.1 specification
 * and produce a flat list of discovered endpoints and summary statistics.
 * @param {Array<{ fragment: object, sourceUrl?: string }>} entries
 * @param {{ title?: string, version?: string, origin?: string }} [meta]
 * @returns {{ spec: object, endpoints: object[], stats: object }}
 */
export function mergeOpenApiSpecs(entries, meta = {}) {
  const firstFrag = entries[0]?.fragment;
  const defaultTitle = meta.title || firstFrag?.info?.title || 'Extracted API Documentation';
  const defaultVersion = meta.version || firstFrag?.info?.version || 'v1';

  const merged = {
    openapi: '3.0.1',
    info: {
      title: defaultTitle,
      version: defaultVersion,
      description: 'API documentation extracted from crawled documentation pages.'
    },
    servers: [],
    tags: [],
    paths: {},
    components: {
      securitySchemes: {},
      schemas: {}
    }
  };

  const tagsMap = new Map();
  const serverSignatures = new Set();
  const endpoints = [];
  const seenEndpointKeys = new Set();

  for (const entry of entries) {
    const frag = entry.fragment || entry;
    const sourceUrl = entry.sourceUrl || '';
    if (!frag || typeof frag !== 'object') continue;

    // Longest info description wins (matches Python logic)
    if (frag.info?.description && frag.info.description.length > merged.info.description.length) {
      merged.info.description = frag.info.description;
    }

    // Merge servers
    if (Array.isArray(frag.servers)) {
      for (const s of frag.servers) {
        if (!s || typeof s !== 'object') continue;
        const sig = JSON.stringify(s);
        if (!serverSignatures.has(sig)) {
          serverSignatures.add(sig);
          merged.servers.push(s);
        }
      }
    }

    // Merge tags
    if (Array.isArray(frag.tags)) {
      for (const t of frag.tags) {
        const name = t?.name;
        if (!name) continue;
        const existing = tagsMap.get(name);
        if (!existing || (t.description && !existing.description)) {
          tagsMap.set(name, t);
        }
      }
    }

    // Merge paths
    if (frag.paths && typeof frag.paths === 'object') {
      for (const [pathKey, pathItem] of Object.entries(frag.paths)) {
        if (!pathItem || typeof pathItem !== 'object' || Array.isArray(pathItem)) continue;
        if (!merged.paths[pathKey]) {
          merged.paths[pathKey] = {};
        }

        for (const [methodKey, methodVal] of Object.entries(pathItem)) {
          if (methodKey.startsWith('x-')) {
            merged.paths[pathKey][methodKey] = methodVal;
            continue;
          }
          const lowerMethod = methodKey.toLowerCase();
          if (HTTP_METHODS.includes(lowerMethod)) {
            merged.paths[pathKey][lowerMethod] = methodVal;

            const endpointKey = `${lowerMethod}:${pathKey}`;
            if (!seenEndpointKeys.has(endpointKey)) {
              seenEndpointKeys.add(endpointKey);
              endpoints.push({
                method: lowerMethod.toUpperCase(),
                path: pathKey,
                summary: methodVal?.summary || methodVal?.description || '',
                operationId: methodVal?.operationId || '',
                tags: Array.isArray(methodVal?.tags) ? methodVal.tags : [],
                sourceUrl
              });
            }
          } else if (['summary', 'description', 'servers', 'parameters'].includes(methodKey)) {
            if (!(methodKey in merged.paths[pathKey])) {
              merged.paths[pathKey][methodKey] = methodVal;
            }
          }
        }
      }
    }

    // Merge components
    const comp = frag.components || {};
    if (comp.schemas && typeof comp.schemas === 'object') {
      for (const [schemaName, schemaDef] of Object.entries(comp.schemas)) {
        if (!(schemaName in merged.components.schemas)) {
          merged.components.schemas[schemaName] = schemaDef;
        } else {
          const existingProps = Object.keys(merged.components.schemas[schemaName]?.properties || {}).length;
          const newProps = Object.keys(schemaDef?.properties || {}).length;
          if (newProps > existingProps) {
            merged.components.schemas[schemaName] = schemaDef;
          }
        }
      }
    }

    if (comp.securitySchemes && typeof comp.securitySchemes === 'object') {
      for (const [secName, secDef] of Object.entries(comp.securitySchemes)) {
        if (!(secName in merged.components.securitySchemes)) {
          merged.components.securitySchemes[secName] = secDef;
        }
      }
    }
  }

  if (merged.servers.length === 0 && meta.origin) {
    merged.servers.push({
      url: meta.origin,
      description: 'Primary server'
    });
  }

  // Sort tags, paths, and schemas alphabetically (matches Python logic)
  merged.tags = [...tagsMap.keys()].sort().map((k) => tagsMap.get(k));

  const sortedPaths = {};
  for (const k of Object.keys(merged.paths).sort()) {
    sortedPaths[k] = merged.paths[k];
  }
  merged.paths = sortedPaths;

  const sortedSchemas = {};
  for (const k of Object.keys(merged.components.schemas).sort()) {
    sortedSchemas[k] = merged.components.schemas[k];
  }
  merged.components.schemas = sortedSchemas;

  // Sort endpoints by path then method
  endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  // Compute summary stats
  const methodCounts = {};
  let totalOperations = 0;
  for (const methods of Object.values(merged.paths)) {
    for (const m of Object.keys(methods)) {
      if (HTTP_METHODS.includes(m)) {
        totalOperations += 1;
        methodCounts[m.toUpperCase()] = (methodCounts[m.toUpperCase()] || 0) + 1;
      }
    }
  }

  const stats = {
    totalPaths: Object.keys(merged.paths).length,
    totalOperations,
    totalSchemas: Object.keys(merged.components.schemas).length,
    totalTags: merged.tags.length,
    methodCounts
  };

  return { spec: merged, endpoints, stats };
}
