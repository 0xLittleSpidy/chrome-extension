# Helper - Chrome Extension (Manifest V3)

A Chrome extension for dynamic text replacement, snippet clipboard storage, and domain management.

---

## Features

1. **Dynamic Text Field Replacer**:
   - Detects standard `<textarea>` elements, text-based `<input>` elements, and `contenteditable` elements.
   - Automatically detects and tracks dynamically added fields using `MutationObserver`.
   - User-configurable replacement rules: add, edit, or delete any find-and-replace rule.
   - Default rules included out-of-the-box (`"is"` -> `"was"`, `"are"` -> `"were"`).
   - Case preservation: `"Is"` -> `"Was"`, `"IS"` -> `"WAS"`, `"Are"` -> `"Were"`, `"ARE"` -> `"WERE"`.
   - Whole-word matching: prevents matching inside substrings (e.g., does not replace inside "island" or "area").
   - Click any highlighted mark to perform instant replacement with native framework event dispatching.

2. **Frequently Used Text Snippets & Clipboard Context Menu**:
   - Manage reusable text snippets in the dedicated Settings configuration center (`settings/settings.html`).
   - Each snippet contains a **Heading** and **Description**.
   - Accessible from the browser right-click context menu under **Saved Snippets**.
   - Clicking a snippet heading automatically copies the description to the system clipboard via an isolated offscreen document.
   - Instant visual notification confirms copy status.

3. **Dedicated Configuration Center (`settings/settings.html`)**:
   - **Whitelist Management**: Add and delete permitted website domains.
   - **Saved Snippets**: Add, edit, test copy, and delete saved snippet items.
   - **Replacer Rules**: Add, edit, and delete dynamic replacement rules with whole-word and case-preservation options.
   - **Import & Export**: Backup or restore configuration to/from a single portable JSON file (`helper-backup.json`) to easily transfer settings between machines or users.

4. **Per-Site Replacer and Storage Switches in Popup**:
   - Whitelist status: Allow or remove current domain.
   - **Replacer Switch**: Temporarily pause or resume text replacement on a whitelisted site without deleting it from the whitelist.
   - **Storage Switch**: Temporarily pause or resume snippet and storage integration on a specific site.
   - Quick navigation button to open the full Settings center.

---

## Project Structure

```
chrome_extension/
├── manifest.json              # Manifest V3 specification
├── background.js              # Background service worker (badge, context menus, offscreen copy)
├── CHROMEWEBSTORE.md          # Chrome Web Store listing metadata & privacy justifications
├── GEMINI.md                  # Project rules and guidelines (no emoji rule)
├── package.json               # Test script configuration
├── diagnostic.js              # Diagnostic snippet to inspect compatibility on private sites
├── icons/                     # Extension icons (16px, 48px, 128px PNG)
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── lib/
│   ├── storage-manager.js     # Storage abstraction & JSON import/export
│   ├── text-scanner.js        # Dynamic rule compiler & sentence text scanner
│   └── allowlist-utils.js     # URL matching & pattern normalization utilities
├── offscreen/
│   ├── offscreen.html         # Offscreen document for clipboard operations
│   └── offscreen.js           # Clipboard writer implementation
├── settings/
│   ├── settings.html          # Configuration center (Whitelist, Snippets, Rules, Import/Export)
│   ├── settings.css           # Styling for settings hub
│   └── settings.js            # Controller for CRUD operations & file export/import
├── popup/
│   ├── popup.html             # Popup user interface with active-site switches
│   ├── popup.css              # Styling for popup
│   └── popup.js               # Popup controller & per-site toggle handlers
├── content/
│   ├── content.js             # DOM scanner, Shadow DOM overlay manager & click handler
│   └── content.css            # Highlight & overlay styles inside Shadow DOM
├── test/
│   ├── unit.test.js           # Unit tests for text scanner, rules, and storage manager
│   ├── popup.test.js          # Popup structure & integrity verification
│   ├── settings.test.js       # Settings page elements & structure verification
│   └── integration.test.js    # Automated end-to-end CDP test in headless Chrome
└── test-page.html             # Interactive HTML test suite
```

---

## How to Install in Google Chrome

1. Open Google Chrome.
2. Navigate to `chrome://extensions/`.
3. In the top-right corner, turn on **Developer mode**.
4. In the top-left corner, click **Load unpacked**.
5. Select this folder (`/home/littlespidy/myextra/chrome_extension`).
6. The **Helper** extension will appear in your toolbar.

---

## Running Automated Tests

Run the full automated test suite:
```bash
npm test
```
Or run individual test modules:
```bash
npm run test:unit
npm run test:popup
npm run test:settings
npm run test:integration
```
