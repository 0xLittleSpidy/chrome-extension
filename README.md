# Is & Are Replacer — Chrome Extension (Manifest V3)

A Chrome extension that scans textboxes and text input fields on user-approved (allowlisted) websites for sentences containing the words **"is"** or **"are"**, highlights and underlines them in yellow, and allows instant **one-click replacement to "was" or "were"**.

---

## Features

1. **Text Field Detection**:
   - Detects standard `<textarea>` elements and text-based `<input>` elements (`type="text"`, `search`, `url`, `email`, `tel`, etc.).
   - Automatically detects and tracks dynamically created text fields using a `MutationObserver`.

2. **Precise Word Matching & Sentence Isolation**:
   - Matches standalone words `"is"` and `"are"` (case-insensitive: `"is"`, `"Is"`, `"IS"`, `"are"`, `"Are"`, `"ARE"`).
   - Never matches words that contain `"is"` or `"are"` as a substring (such as `"island"`, `"dismiss"`, `"issue"`, `"area"`, `"share"`, `"farewell"`, or `"parent"`).
   - Identifies sentence boundaries while preserving all surrounding sentences and text.

3. **Yellow Underline Highlighting**:
   - Highlights matching words with a bright yellow background and distinct amber underline.
   - Text rendering is mirrored with Shadow DOM styling, preventing any website CSS collision.
   - Preserves underlying text colors and typing flow without interfering with cursor navigation, selection, or normal form behavior.

4. **One-Click Quick Replacement**:
   - Clicking any highlighted word replaces it immediately:
     - `"is"` -> `"was"`, `"Is"` -> `"Was"`, `"IS"` -> `"WAS"`
     - `"are"` -> `"were"`, `"Are"` -> `"Were"`, `"ARE"` -> `"WERE"`
   - Dispatches native `input` and `change` events so modern JavaScript frameworks (React, Vue, Angular) register the change automatically.
   - Restores cursor position right after the replaced word.

5. **Website Allowlist & Modern UI**:
   - The extension is **strictly inactive by default** on all websites.
   - Users can allow or disable the extension for the current tab with a single click in the extension popup.
   - Users can manually add domains, subdomains (e.g., `*.google.com`), or localhost URLs.
   - Settings sync across browser sessions via `chrome.storage.sync`.
   - Dynamic real-time activation: adding or removing a website in the popup takes effect on all open tabs instantly without needing a page refresh.

---

## Project Structure

```
chrome_extension/
├── manifest.json              # Manifest V3 specification
├── background.js              # Background service worker (badge & lifecycle management)
├── CHROMEWEBSTORE.md          # Chrome Web Store listing metadata & privacy justifications
├── GEMINI.md                  # Project rules and guidelines (no emoji rule)
├── package.json               # Test script configuration
├── diagnostic.js              # Diagnostic snippet to inspect compatibility on private sites
├── icons/                     # Extension icons (16px, 48px, 128px PNG)
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── lib/
│   ├── text-scanner.js        # Sentence segmentation, word matching & replacement logic
│   └── allowlist-utils.js     # URL matching & pattern normalization utilities
├── popup/
│   ├── popup.html             # Popup user interface
│   ├── popup.css              # Responsive modern styling
│   └── popup.js               # Allowlist management & storage synchronization
├── content/
│   ├── content.js             # DOM scanner, Shadow DOM overlay manager & click handler
│   └── content.css            # Highlight & overlay styles inside Shadow DOM
├── skills/                    # Antigravity skill definitions
│   └── verb-tense-highlighter/
│       └── SKILL.md
├── test/
│   ├── unit.test.js           # Unit tests for text scanning & allowlist matching
│   ├── popup.test.js          # Unit tests for popup UI & identifier extraction
│   └── integration.test.js    # Automated end-to-end CDP test in headless Chrome
└── test-page.html             # Interactive HTML test suite
```

---

## How to Install in Google Chrome

1. Open Google Chrome.
2. Navigate to `chrome://extensions/`.
3. In the top-right corner, turn on **Developer mode**.
4. In the top-left corner, click **Load unpacked**.
5. Select the `chrome_extension` folder (`/home/littlespidy/myextra/chrome_extension`).
6. The **Is & Are Replacer** extension will appear in your toolbar.

---

## How to Use

1. Navigate to any website containing text inputs or textareas (e.g. `http://localhost:8765/test-page.html`).
2. Click the extension icon in the toolbar.
3. Click **"Allow on This Website"** (or add custom domain patterns in the popup).
4. Text fields containing sentences with `"is"` or `"are"` will display matching words highlighted in yellow with an underline.
5. Click on the yellow highlighted word to replace it with its past tense form.

---

## Troubleshooting on Private Sites

If the extension is not highlighting text fields on a private website:

1. Open the target website.
2. Open Chrome Developer Tools (**F12** or Right Click &rarr; **Inspect** &rarr; **Console** tab).
3. Copy and paste the contents of [`diagnostic.js`](diagnostic.js) into the console and press Enter.
4. Share the JSON output to identify the exact input type, shadow DOM structure, or allowlist status on that page.

---

## Running the Automated Test Suite

Run the full automated test suite (unit + popup + headless browser integration test):

```bash
npm test
```
