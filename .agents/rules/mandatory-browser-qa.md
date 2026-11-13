---
trigger: always_on
---

# Mandatory Browser QA Rule

## Core Directive
Before any commit and push to the remote repository, you must execute a comprehensive browser QA process using a live browser with the extension installed.

## Mandatory QA Steps
1. **Start Local HTTP Server**: Serve the extension QA test page (`test/qa-page.html` or `test-page.html`) on a local HTTP server (e.g. `http://127.0.0.1:<port>`).
2. **Launch Chromium/Chrome with Extension Loaded**: Launch Chromium/Chrome with the unpacked extension loaded using `--load-extension=<path-to-extension>` and `--no-sandbox`.
3. **Open Website in Browser**: Navigate the browser to the local test server URL.
4. **Execute End-to-End QA Verification**:
   - Verify allowlist activation and dormant state on non-allowlisted origins.
   - Verify word replacement ("is" -> "was", "are" -> "were", dynamic rules) and hover tooltips.
   - Verify the unified flying toolbar is displayed ONLY when text is selected.
   - Verify the toolbar group ordering: Transform -> Shortcuts -> Unwanted Headers.
   - Verify text transformations (Redact, Truncate, Red Color Redact) never modify unselected lines.
   - Verify unwanted header removal preserves markdown code fences and document structure.
   - Verify settings page: default dark theme, live markdown preview, multi-answer snippets, import/export buttons.
   - Verify zero emojis or decorative unicode symbols exist anywhere in UI, console messages, comments, or documentation.
5. **Enforcement Gate**:
   - Never commit or push if the browser QA process fails or detects any defect.
   - Always run `npm run qa` (or `npm test`) and confirm 100% pass before proceeding with `git commit` and `git push`.
