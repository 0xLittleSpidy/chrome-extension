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
  'nav-shortcuts',
  'nav-header-cleaner',
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
  'snippet-category',
  'snippet-add-category-btn',
  'snippet-category-actions-btn',
  'category-actions-menu',
  'action-rename-category-btn',
  'action-delete-category-btn',
  'modal-rename-category',
  'modal-delete-category',
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
  'header-console-count',
  'clear-header-console-btn',
  'console-test-input',
  'console-test-clean-btn',
  'header-console-terminal',
  // Global
  'toast',
  // Theme & Sidebar Actions
  'theme-toggle-btn',
  'sidebar-import-btn',
  'sidebar-export-btn',
  'sidebar-import-input',
  // Markdown & Multi-Answer
  'snippet-markdown-preview',
  'snippet-answers-nav',
  'snippet-add-answer-btn'
];

for (const id of requiredSettingsIds) {
  assert(settingsHtml.includes(`id="${id}"`), `settings.html must contain id="${id}"`);
}

// Verify removed elements are absent
assert(!settingsHtml.includes('id="tab-blacklist"'), 'tab-blacklist must be removed');
assert(!settingsHtml.includes('id="nav-blacklist"'), 'nav-blacklist must be removed');
assert(!settingsHtml.includes('id="storage-setup-banner"'), 'storage-setup-banner must be removed');
assert(!settingsHtml.includes('id="tab-import-export"'), 'tab-import-export must be removed');
assert(!settingsHtml.includes('id="nav-file-sync"'), 'nav-file-sync must be removed');
assert(!settingsHtml.includes('id="settings-sync-indicator"'), 'settings-sync-indicator must be removed');

// Verify renamed headers and sections
assert(settingsHtml.includes('Add Exact URL'), 'Must contain "Add Exact URL"');
assert(settingsHtml.includes('Approved URLs'), 'Must contain "Approved URLs"');
assert(settingsHtml.includes('<h2 class="section-title">Snippets</h2>'), 'Must contain renamed "Snippets" heading');
assert(settingsHtml.includes('<h2 class="section-title">Replacer Rules</h2>'), 'Must contain renamed "Replacer Rules" heading');
assert(settingsHtml.includes('<h2 class="section-title">Shortcuts</h2>'), 'Must contain renamed "Shortcuts" heading');
assert(settingsHtml.includes('<span class="form-label">Options</span>'), 'Must contain renamed "Options" label');

// Verify dark theme is configured by default
assert(settingsHtml.includes('data-theme="dark"'), 'settings.html must default to data-theme="dark"');

console.log('[PASS] All essential settings elements present in settings.html');
console.log('[PASS] Default dark theme verified in settings.html');
console.log('[PASS] SETTINGS PAGE INTEGRITY TEST PASSED!');
