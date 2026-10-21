# Helper Chrome Extension Workspace

This repository houses the **Helper** browser productivity extension.

---

## Directory Structure

```
chrome_extension/
├── helper/                    # Complete extension source code and tests
│   ├── manifest.json          # Manifest V3 specification
│   ├── background.js          # Background service worker (badge, context menus, offscreen copy)
│   ├── content/               # Content script and Shadow DOM highlight overlay
│   ├── popup/                 # Streamlined popup UI with active-site switches
│   ├── settings/              # Settings hub (Whitelist, Snippets, Rules, Import/Export)
│   ├── lib/                   # Storage manager, text scanner, allowlist utils
│   ├── offscreen/             # Offscreen document for clipboard write operations
│   ├── icons/                 # Extension icons
│   ├── test/                  # Unit, popup, settings, and CDP integration tests
│   ├── test-page.html         # Interactive HTML test fixture
│   ├── diagnostic.js          # Diagnostic snippet
│   ├── package.json           # Extension scripts and test commands
│   └── README.md              # Helper documentation
├── .agents/                   # Agent rules and guidelines
├── package.json               # Root package script runner
└── README.md                  # Workspace guide
```

---

## Installation in Google Chrome

1. Open Google Chrome.
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Select the **`helper`** directory (`/home/littlespidy/myextra/chrome_extension/helper`).
6. The **Helper** extension will appear in your toolbar.

---

## Testing

Run tests from root or inside the `helper` folder:
```bash
npm test
```
Or:
```bash
cd helper && npm test
```
