const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AllowlistUtils = require('../lib/allowlist-utils');

console.log('--- TESTING POPUP LOGIC & HTML INTEGRITY ---');

// 1. Verify popup.html contains all required elements
const popupHtml = fs.readFileSync(path.join(__dirname, '../popup/popup.html'), 'utf8');

const requiredIds = [
  'site-status-badge',
  'site-status-text',
  'current-site-host',
  'toggle-current-site-btn',
  'toggle-current-site-label',
  'add-form',
  'custom-domain-input',
  'add-domain-btn',
  'add-feedback',
  'allowlist-container',
  'allowlist-count',
  'empty-state'
];

for (const id of requiredIds) {
  assert(popupHtml.includes(`id="${id}"`), `popup.html must contain id="${id}"`);
}
console.log('[PASS] All essential popup elements present in HTML structure');

// 2. Verify AllowlistUtils site identifier logic
assert.strictEqual(AllowlistUtils.getSiteIdentifier('https://example.com/some/path'), 'example.com');
assert.strictEqual(AllowlistUtils.getSiteIdentifier('http://localhost:3000/app'), 'localhost:3000');
assert.strictEqual(AllowlistUtils.getSiteIdentifier('file:///home/user/test.html'), 'local-files');

// 3. Verify pattern normalization for user input
assert.strictEqual(AllowlistUtils.normalizePattern('  https://My-Site.Com/path/to/page  '), 'my-site.com');
assert.strictEqual(AllowlistUtils.normalizePattern('HTTP://LOCALHOST:8080/'), 'localhost:8080');
assert.strictEqual(AllowlistUtils.normalizePattern('*.Google.com'), '*.google.com');

console.log('[PASS] AllowlistUtils normalization and site identification verified');
console.log('[PASS] POPUP LOGIC TESTS PASSED!');
