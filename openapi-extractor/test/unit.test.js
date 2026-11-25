import assert from 'node:assert/strict';
import {
  extractOpenApiFragments,
  extractLinksFromHtml,
  mergeOpenApiSpecs,
  suggestPathPrefix,
  isCrawlableUrl
} from '../lib/extractor.js';
import { toYaml } from '../lib/yaml.js';

// 1. Markdown fenced JSON block with method/path header & trailing comma
const mdContent = [
  '# Get Token',
  '````json GET /api/v1/tokens/{id}',
  '{',
  '  "openapi": "3.0.1",',
  '  "paths": {',
  '    "/api/v1/tokens/{id}": {',
  '      "get": {',
  '        "summary": "Get token by ID",',
  '        "tags": ["Tokens"],',
  '      }',
  '    }',
  '  },',
  '}',
  '````'
].join('\n');

const mdFragments = extractOpenApiFragments(mdContent);
assert.equal(mdFragments.length, 1);
assert.ok(mdFragments[0].paths['/api/v1/tokens/{id}'].get);

// 2. HTML <pre><code> block with syntax-highlighting spans & HTML entities
const htmlContent = `
<html><body>
  <pre><code><span class="p">{</span>
    &quot;openapi&quot;: &quot;3.0.1&quot;,
    &quot;paths&quot;: {
      &quot;/api/v1/users&quot;: {
        &quot;post&quot;: {
          &quot;summary&quot;: &quot;Create user&quot;,
          &quot;tags&quot;: [&quot;Users&quot;]
        }
      }
    },
    &quot;components&quot;: {
      &quot;schemas&quot;: {
        &quot;User&quot;: { &quot;type&quot;: &quot;object&quot;, &quot;properties&quot;: { &quot;id&quot;: { &quot;type&quot;: &quot;string&quot; }, &quot;name&quot;: { &quot;type&quot;: &quot;string&quot; } } }
      }
    }
  }</code></pre>
</body></html>
`;

const htmlFragments = extractOpenApiFragments(htmlContent);
assert.equal(htmlFragments.length, 1);
assert.equal(htmlFragments[0].paths['/api/v1/users'].post.summary, 'Create user');

// 3. Link discovery & path prefix filtering
const navHtml = `
<nav>
  <a href="/docs/users">Users</a>
  <a href="/docs/tokens#section">Tokens</a>
  <a href="/blog/news">Blog</a>
  <a href="https://external.example.com/docs/other">External</a>
  <a href="/docs/logo.png">Logo</a>
</nav>
`;
const links = extractLinksFromHtml(navHtml, 'https://api.example.com/docs/index.html', {
  origin: 'https://api.example.com',
  pathPrefix: '/docs/'
});
assert.deepEqual(links, [
  'https://api.example.com/docs/users',
  'https://api.example.com/docs/tokens'
]);

assert.equal(suggestPathPrefix('https://api.example.com/apidocs/v1/intro'), '/apidocs/');
assert.equal(isCrawlableUrl('https://api.example.com/apidocs/test', 'https://api.example.com', '/apidocs/'), true);
assert.equal(isCrawlableUrl('https://api.example.com/other/test', 'https://api.example.com', '/apidocs/'), false);

// 4. Merging specs & schema property preference
const smallerSchemaFrag = {
  paths: { '/b': { get: { summary: 'B' } } },
  components: { schemas: { User: { type: 'object', properties: { id: { type: 'string' } } } } }
};
const merged = mergeOpenApiSpecs(
  [
    { fragment: smallerSchemaFrag, sourceUrl: 'https://api.example.com/docs/b' },
    { fragment: htmlFragments[0], sourceUrl: 'https://api.example.com/docs/users' },
    { fragment: mdFragments[0], sourceUrl: 'https://api.example.com/docs/tokens' }
  ],
  { title: 'Example API', origin: 'https://api.example.com' }
);

assert.equal(merged.spec.openapi, '3.0.1');
assert.equal(merged.spec.info.title, 'Example API');
assert.equal(merged.stats.totalPaths, 3);
assert.equal(merged.stats.totalOperations, 3);
assert.equal(merged.stats.totalSchemas, 1);
assert.equal(Object.keys(merged.spec.components.schemas.User.properties).length, 2);
assert.deepEqual(Object.keys(merged.spec.paths), ['/api/v1/tokens/{id}', '/api/v1/users', '/b']);
assert.equal(merged.endpoints.length, 3);

// 5. YAML serialization
const yamlOut = toYaml(merged.spec);
assert.ok(yamlOut.includes('openapi: "3.0.1"') || yamlOut.includes('openapi: 3.0.1'));
assert.ok(yamlOut.includes('"/api/v1/users":'));
assert.ok(yamlOut.includes('summary: Create user'));

console.log('All unit tests passed.');
