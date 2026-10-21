const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- TESTING SETTINGS PAGE INTEGRITY ---');

const settingsHtml = fs.readFileSync(path.join(__dirname, '../settings/settings.html'), 'utf8');

const requiredSettingsIds = [
  // Navigation
  'nav-whitelist',
  'nav-snippets',
  'nav-rules',
  'nav-import-export',
  // Whitelist Tab
  'tab-whitelist',
  'add-whitelist-form',
  'whitelist-input',
  'whitelist-list',
  'whitelist-count',
  'whitelist-empty',
  // Snippets Tab
  'tab-snippets',
  'snippet-form',
  'snippet-id',
  'snippet-heading',
  'snippet-description',
  'snippet-submit-btn',
  'snippet-cancel-btn',
  'snippets-list',
  'snippets-count',
  'snippets-empty',
  // Rules Tab
  'tab-rules',
  'rule-form',
  'rule-id',
  'rule-find',
  'rule-replace',
  'rule-whole-word',
  'rule-match-case',
  'rule-submit-btn',
  'rule-cancel-btn',
  'rules-list',
  'rules-count',
  'rules-empty',
  // Import/Export Tab
  'tab-import-export',
  'export-json-btn',
  'import-file-input',
  'import-preview',
  'import-preview-text',
  'import-confirm-btn',
  // Global
  'toast'
];

for (const id of requiredSettingsIds) {
  assert(settingsHtml.includes(`id="${id}"`), `settings.html must contain id="${id}"`);
}

console.log('[PASS] All essential settings elements present in settings.html');
console.log('[PASS] SETTINGS PAGE INTEGRITY TEST PASSED!');
