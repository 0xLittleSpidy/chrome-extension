const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- TESTING SETTINGS PAGE INTEGRITY ---');

const settingsHtml = fs.readFileSync(path.join(__dirname, '../settings/settings.html'), 'utf8');

const requiredSettingsIds = [
  // Navigation
  'nav-whitelist',
  'nav-blacklist',
  'nav-snippets',
  'nav-rules',
  'nav-shortcuts',
  'nav-header-cleaner',
  'nav-import-export',
  // Whitelist Tab
  'tab-whitelist',
  'add-whitelist-form',
  'whitelist-input',
  'whitelist-list',
  'whitelist-count',
  'whitelist-empty',
  // Blacklist Tab
  'tab-blacklist',
  'add-blacklist-form',
  'blacklist-input',
  'blacklist-list',
  'blacklist-count',
  'blacklist-empty',
  // Snippets Tab
  'tab-snippets',
  'snippet-form',
  'snippet-id',
  'snippet-heading',
  'snippet-category',
  'snippet-add-category-btn',
  'settings-category-filter',
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
  // Shortcuts Tab
  'tab-shortcuts',
  'shortcut-form',
  'shortcut-name',
  'shortcut-keys',
  'shortcut-submit-btn',
  'shortcuts-list',
  'shortcuts-count',
  // Header Cleaner Tab
  'tab-header-cleaner',
  'header-cleaner-form',
  'header-pattern-input',
  'reset-headers-btn',
  'header-cleaner-list',
  // Import/Export Tab
  'tab-import-export',
  'export-json-btn',
  'import-file-input',
  'import-preview',
  'import-preview-text',
  'import-confirm-btn',
  // Sidebar Import/Export
  'sidebar-import-btn',
  'sidebar-export-btn',
  // Global
  'toast',
  'settings-sync-indicator',
  // Theme & File Persistence
  'theme-toggle-btn',
  'storage-setup-banner',
  'banner-store-file-btn',
  'banner-select-file-btn',
  // Markdown & Multi-Answer
  'snippet-markdown-preview',
  'snippet-answers-nav',
  'snippet-add-answer-btn'
];

for (const id of requiredSettingsIds) {
  assert(settingsHtml.includes(`id="${id}"`), `settings.html must contain id="${id}"`);
}

// Verify dark theme is configured by default
assert(settingsHtml.includes('data-theme="dark"'), 'settings.html must default to data-theme="dark"');

// Verify dedicated file sync page exists
const syncHtmlPath = path.join(__dirname, '../sync/sync.html');
assert(fs.existsSync(syncHtmlPath), 'sync/sync.html must exist as a dedicated sync page');

console.log('[PASS] All essential settings elements present in settings.html');
console.log('[PASS] Default dark theme verified in settings.html');
console.log('[PASS] Dedicated sync page verified');
console.log('[PASS] SETTINGS PAGE INTEGRITY TEST PASSED!');
