const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const EXT_DIR = path.resolve(__dirname, '..');
const PORT = 8765;
const EXT_ID = 'aendbchpjeknkpimhleahelhemebjgib';

// Path to Chrome for Testing binary
const CHROME_BIN = fs.existsSync('/home/littlespidy/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome')
  ? '/home/littlespidy/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'
  : 'google-chrome';

// Static file server for test-page.html
const server = http.createServer((req, res) => {
  const reqPath = req.url === '/' ? '/test-page.html' : req.url;
  const filePath = path.join(EXT_DIR, reqPath);
  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath);
    const contentType = ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'text/plain';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

function sendCDP(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          if (msg.error) {
            reject(new Error(JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch (err) {
        reject(err);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function runTest() {
  console.log('============================================');
  console.log('   STARTING EXTENSION INTEGRATION TEST      ');
  console.log('============================================');

  await new Promise(r => server.listen(PORT, r));
  console.log(`[Test Server] Running at http://127.0.0.1:${PORT}/test-page.html`);

  const CDP_PORT = 9555;
  const userDataDir = `/tmp/cft-profile-${Date.now()}`;
  const chromeProcess = spawn(CHROME_BIN, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-sandbox',
    `--load-extension=${EXT_DIR}`,
    `--disable-extensions-except=${EXT_DIR}`,
    `--user-data-dir=${userDataDir}`
  ]);

  let closed = false;
  function cleanup() {
    if (!closed) {
      closed = true;
      try { chromeProcess.kill(); } catch (e) {}
      try { server.close(); } catch (e) {}
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
    }
  }

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  let targets = [];
  let swTarget = null;
  for (let i = 0; i < 30; i++) {
    try {
      targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json());
      swTarget = targets.find(t => t.url && t.url.endsWith('/background.js') && !t.url.includes('glbjnfimcajjenihimblfaponejbkoph'));
      if (swTarget) break;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 400));
  }
  assert(swTarget, 'Background service worker must be loaded and running');
  console.log('[PASS] Background service worker active:', swTarget.url);

  // Connect to service worker
  const swWs = new WebSocket(swTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    swWs.onopen = resolve;
    swWs.onerror = reject;
  });
  await sendCDP(swWs, 'Runtime.enable');

  async function evalInSW(expression) {
    const res = await sendCDP(swWs, 'Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error('SW Eval error: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result.value;
  }

  // 1. Verify initial allowlist is empty by default
  const initialAllowlist = await evalInSW(`StorageManager.getAllowlist()`);
  console.log('[Storage] Initial allowlist:', initialAllowlist);
  assert(Array.isArray(initialAllowlist), 'allowlist must be an array');
  assert.strictEqual(initialAllowlist.length, 0, 'Allowlist must be empty by default');
  console.log('[PASS] Allowlist is empty by default (extension only runs on approved sites).');

  // 2. Open test page
  const pageTarget = targets.find(t => t.type === 'page');
  assert(pageTarget, 'Page target must exist');
  const pageWs = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    pageWs.onopen = resolve;
    pageWs.onerror = reject;
  });
  await sendCDP(pageWs, 'Page.enable');
  await sendCDP(pageWs, 'Runtime.enable');
  await sendCDP(pageWs, 'DOM.enable');

  console.log(`[Page] Navigating to http://127.0.0.1:${PORT}/test-page.html...`);
  await sendCDP(pageWs, 'Page.navigate', { url: `http://127.0.0.1:${PORT}/test-page.html` });
  await new Promise(r => setTimeout(r, 1200));

  async function evalInPage(expression) {
    const res = await sendCDP(pageWs, 'Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error('Page Eval error: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result.value;
  }

  // 3. Verify extension is dormant when site is NOT allowlisted
  const hostBefore = await evalInPage(`!!document.getElementById('is-highlighter-extension-root')`);
  assert.strictEqual(hostBefore, false, 'Overlay root must NOT exist on unapproved sites');
  console.log('[PASS] Extension is dormant on non-allowlisted site.');

  // 4. Add site to allowlist via extension storage
  console.log(`[Storage] Adding 127.0.0.1:${PORT} to allowlist...`);
  await evalInSW(`
    new Promise(resolve => {
      chrome.storage.sync.set({ allowlist: ['127.0.0.1:${PORT}'] }, resolve);
    })
  `);

  // Wait for storage change event to propagate to content script
  await new Promise(r => setTimeout(r, 800));

  // 5. Verify extension activates automatically in real-time
  const hostAfter = await evalInPage(`!!document.getElementById('is-highlighter-extension-root')`);
  assert.strictEqual(hostAfter, true, 'Overlay root must be created upon allowlist match');
  console.log('[PASS] Content script activates in real-time upon allowlist update.');

  // 6. Verify highlights and whole-word matching for both "is" and "are"
  const marksData = await evalInPage(`
    (() => {
      const host = document.getElementById('is-highlighter-extension-root');
      if (!host || !host.shadowRoot) return { count: 0, words: [], replacements: [] };
      const marks = Array.from(host.shadowRoot.querySelectorAll('mark.is-highlight-word'));
      return {
        count: marks.length,
        words: marks.map(m => m.textContent),
        replacements: marks.map(m => m.dataset.replacement)
      };
    })()
  `);
  console.log('[Highlights] Detected marks in Shadow DOM:', marksData.words);
  assert(marksData.count >= 8, 'Must highlight all whole-word occurrences of "is" and "are"');

  // Verify "island", "dismiss", "area", "share", "fare" are NOT highlighted
  const hasFalsePositives = marksData.words.some(w => ['island', 'dismiss', 'issues', 'area', 'share', 'fare', 'parent'].includes(w.toLowerCase()));
  assert.strictEqual(hasFalsePositives, false, 'Must NOT match substrings like "island" or "area"');
  console.log('[PASS] Whole-word matching strictly matches "is" and "are" and ignores words like "island" and "area".');

  // 7. Verify quick replacement on standard textarea ("is" -> "was")
  const initialTextarea = await evalInPage(`document.getElementById('textarea-standard').value`);
  console.log('[Textarea Before]:', initialTextarea);

  const clickReplaceResult = await evalInPage(`
    (() => {
      const host = document.getElementById('is-highlighter-extension-root');
      const marks = Array.from(host.shadowRoot.querySelectorAll('mark.is-highlight-word'));
      const isMark = marks.find(m => m.textContent === 'is');
      if (!isMark) return { success: false };
      isMark.click();
      return {
        success: true,
        valAfter: document.getElementById('textarea-standard').value
      };
    })()
  `);
  assert.strictEqual(clickReplaceResult.success, true);
  console.log('[Textarea After click]:', clickReplaceResult.valAfter);
  assert.strictEqual(
    clickReplaceResult.valAfter,
    'This was a great day. The island is beautiful. It is very calm outside.',
    'First "is" must be replaced with "was" while preserving the surrounding text and sentences'
  );
  console.log('[PASS] Clicking highlighted "is" replaces with "was" while preserving surrounding text.');

  // Instant hover floating tooltip check
  console.log('[Tooltip] Testing instant hover floating tooltip...');
  const tooltipTest = await evalInPage(`
    (() => {
      const host = document.getElementById('is-highlighter-extension-root');
      const marks = Array.from(host.shadowRoot.querySelectorAll('mark.is-highlight-word'));
      const tooltip = host.shadowRoot.querySelector('.is-floating-tooltip');
      if (!tooltip || !marks.length) return { exists: false };

      const firstMark = marks[0];
      firstMark.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const visibleOnHover = tooltip.style.display !== 'none' && tooltip.textContent.includes('Click to replace');
      const text = tooltip.textContent;

      firstMark.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      const hiddenOnLeave = tooltip.style.display === 'none';

      return { exists: true, visibleOnHover, hiddenOnLeave, text };
    })()
  `);
  assert.strictEqual(tooltipTest.exists, true, 'Floating tooltip must exist in shadow root');
  assert.strictEqual(tooltipTest.visibleOnHover, true, 'Floating tooltip must be visible on hover');
  assert.strictEqual(tooltipTest.hiddenOnLeave, true, 'Floating tooltip must hide on mouse leave');
  console.log('[PASS] Instant hover floating tooltip displays correctly without delay.');

  // 8. Verify quick replacement on plural textarea ("are" -> "were")
  const areTextareaBefore = await evalInPage(`document.getElementById('textarea-are').value`);
  console.log('[Are Textarea Before]:', areTextareaBefore);

  const clickAreResult = await evalInPage(`
    (() => {
      const host = document.getElementById('is-highlighter-extension-root');
      const marks = Array.from(host.shadowRoot.querySelectorAll('mark.is-highlight-word'));
      // Find "are" in textarea-are
      const areMark = marks.find(m => m.textContent === 'are' && m.dataset.replacement === 'were');
      if (!areMark) return { success: false };
      areMark.click();
      return {
        success: true,
        valAfter: document.getElementById('textarea-are').value
      };
    })()
  `);
  assert.strictEqual(clickAreResult.success, true);
  console.log('[Are Textarea After click]:', clickAreResult.valAfter);
  assert.strictEqual(
    clickAreResult.valAfter,
    'They were learning quickly. We are ready now. You are doing well.',
    'First "are" must be replaced with "were" while preserving surrounding text'
  );
  console.log('[PASS] Clicking highlighted "are" replaces with "were" while preserving surrounding text.');

  // 9. Verify capitalization preservation ("Is" -> "Was", "IS" -> "WAS", "Are" -> "Were", "ARE" -> "WERE")
  console.log('[Edge Cases] Testing case preservation for "Is" and "Are"...');
  await evalInPage(`
    (() => {
      const host = document.getElementById('is-highlighter-extension-root');
      const marks = Array.from(host.shadowRoot.querySelectorAll('mark.is-highlight-word'));
      const isMark = marks.find(m => m.textContent === 'Is');
      if (isMark) isMark.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 200));
  const valAfterIs = await evalInPage(`document.getElementById('textarea-edgecases').value`);
  assert(valAfterIs.startsWith('Was this capitalized?'), '"Is" must be replaced with "Was"');

  await evalInPage(`
    (() => {
      const host = document.getElementById('is-highlighter-extension-root');
      const marks = Array.from(host.shadowRoot.querySelectorAll('mark.is-highlight-word'));
      const areMark = marks.find(m => m.textContent === 'Are');
      if (areMark) areMark.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 200));
  const valAfterAre = await evalInPage(`document.getElementById('textarea-edgecases').value`);
  assert(valAfterAre.includes('Were they ready?'), '"Are" must be replaced with "Were"');

  await evalInPage(`
    (() => {
      const host = document.getElementById('is-highlighter-extension-root');
      const marks = Array.from(host.shadowRoot.querySelectorAll('mark.is-highlight-word'));
      const isMark = marks.find(m => m.textContent === 'IS');
      if (isMark) isMark.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 200));
  const valAfterIS = await evalInPage(`document.getElementById('textarea-edgecases').value`);
  assert(valAfterIS.includes('What WAS that?'), '"IS" must be replaced with "WAS"');

  await evalInPage(`
    (() => {
      const host = document.getElementById('is-highlighter-extension-root');
      const marks = Array.from(host.shadowRoot.querySelectorAll('mark.is-highlight-word'));
      const areMark = marks.find(m => m.textContent === 'ARE');
      if (areMark) areMark.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 200));
  const valAfterARE = await evalInPage(`document.getElementById('textarea-edgecases').value`);
  assert(valAfterARE.includes('Who WERE they?'), '"ARE" must be replaced with "WERE"');
  console.log('[PASS] Case preservation ("Is" -> "Was", "IS" -> "WAS", "Are" -> "Were", "ARE" -> "WERE") works accurately.');

  // 10. Test contenteditable support
  console.log('[Contenteditable] Testing replacement on contenteditable element...');
  await evalInPage(`
    (() => {
      const host = document.getElementById('is-highlighter-extension-root');
      const marks = Array.from(host.shadowRoot.querySelectorAll('mark.is-highlight-word'));
      const ceMark = marks.find(m => m.dataset.elementId === 'editable-div' && m.textContent === 'is');
      if (ceMark) ceMark.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 200));
  const ceTextAfter = await evalInPage(`document.getElementById('editable-div').innerText`);
  assert(ceTextAfter.includes('Contenteditable text was supported.'), 'Contenteditable "is" must be replaced with "was"');
  console.log('[PASS] Contenteditable elements are supported and replaced seamlessly.');

  // 11. Test dynamically created text fields (MutationObserver)
  console.log('[Dynamic Test] Creating new textarea dynamically via button click...');
  await evalInPage(`document.getElementById('add-dynamic-btn').click()`);
  await new Promise(r => setTimeout(r, 500));

  const dynamicTextareaExists = await evalInPage(`!!document.getElementById('dynamic-textarea')`);
  assert.strictEqual(dynamicTextareaExists, true, 'Dynamic textarea must exist');

  // Click "are" inside dynamic field
  const dynamicReplacement = await evalInPage(`
    (() => {
      const host = document.getElementById('is-highlighter-extension-root');
      const marks = Array.from(host.shadowRoot.querySelectorAll('mark.is-highlight-word'));
      // Find mark corresponding to "are" in dynamic textarea: "They are active."
      const dynAreMark = marks.find(m => m.dataset.elementId === 'dynamic-textarea' && m.textContent === 'are');
      if (dynAreMark) {
        dynAreMark.click();
      }
      return document.getElementById('dynamic-textarea').value;
    })()
  `);
  console.log('[Dynamic Field After click]:', dynamicReplacement);
  assert(dynamicReplacement.includes('They were active.'), 'Dynamic field "are" must be replaced with "were"');
  console.log('[PASS] Dynamically created text fields are automatically detected and supported.');

  // 11b. Verify Removal of Old "Headers" Floating Bar
  console.log('[Headers Test] Verifying removal of old "Headers" floating bar...');
  const headerBarAbsent = await evalInPage(`
    (() => {
      const el = document.getElementById('textarea-headers');
      if (!el) return { found: false, error: 'textarea-headers not found' };
      el.focus();
      el.dispatchEvent(new Event('focusin', { bubbles: true }));
      const host = document.getElementById('is-highlighter-extension-root');
      if (!host || !host.shadowRoot) return { found: false, error: 'no-shadow-root' };
      const bar = host.shadowRoot.querySelector('.helper-header-floating-bar');
      return {
        found: true,
        barExists: !!bar
      };
    })()
  `);
  assert.strictEqual(headerBarAbsent.found, true);
  assert.strictEqual(headerBarAbsent.barExists, false, 'Old helper-header-floating-bar must be completely removed');
  console.log('[PASS] Old "Headers" floating bar is completely removed.');

  // 12. Test Active Site Replacer Switch (pause replacer without removing from whitelist)
  console.log('[Per-Site Switch] Pausing replacer on 127.0.0.1:' + PORT + '...');
  await evalInSW(`
    new Promise(resolve => {
      chrome.storage.sync.set({ site_replacer_state: { '127.0.0.1:${PORT}': false } }, resolve);
    })
  `);
  await new Promise(r => setTimeout(r, 600));

  const marksWhenPaused = await evalInPage(`
    (() => {
      const host = document.getElementById('is-highlighter-extension-root');
      if (!host || !host.shadowRoot) return 0;
      return host.shadowRoot.querySelectorAll('.is-highlight-mark').length;
    })()
  `);
  assert.strictEqual(marksWhenPaused, 0, 'Word replacement highlights must be cleared when replacer switch is OFF');
  console.log('[PASS] Replacer switch temporarily clears replacement highlights while keeping extension features accessible.');

  // Verify badge shows ON (not PAUSE) when only replacer is paused
  const badgeWhenReplacerPaused = await evalInSW(`
    (async () => {
      const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1:${PORT}/*' });
      if (!tab) return 'no-tab';
      return await chrome.action.getBadgeText({ tabId: tab.id });
    })()
  `);
  assert.strictEqual(badgeWhenReplacerPaused, 'ON', 'Badge must stay ON when only replacer is paused because storage remains active');
  console.log('[PASS] Badge stays ON (does not show PAUSE) when only replacer is paused.');

  // Re-enable replacer switch on active site
  console.log('[Per-Site Switch] Re-enabling replacer on 127.0.0.1:' + PORT + '...');
  await evalInSW(`
    new Promise(resolve => {
      chrome.storage.sync.set({ site_replacer_state: { '127.0.0.1:${PORT}': true } }, resolve);
    })
  `);
  await new Promise(r => setTimeout(r, 600));

  const hostWhenResumed = await evalInPage(`!!document.getElementById('is-highlighter-extension-root')`);
  assert.strictEqual(hostWhenResumed, true, 'Overlays must be restored when replacer switch is ON');
  console.log('[PASS] Replacer switch resumes overlays instantly without removing domain from whitelist.');

  // 13. Test Dynamic Replacer Rules
  console.log('[Dynamic Rules] Adding custom replacement rule: "beautiful" -> "wonderful"...');
  await evalInSW(`
    new Promise(resolve => {
      chrome.storage.sync.set({
        replacer_rules: [
          { id: 'rule-default-is-was', find: 'is', replace: 'was', matchCase: true, wholeWord: true },
          { id: 'rule-default-are-were', find: 'are', replace: 'were', matchCase: true, wholeWord: true },
          { id: 'rule-custom-beautiful', find: 'beautiful', replace: 'wonderful', matchCase: true, wholeWord: true }
        ]
      }, resolve);
    })
  `);
  await new Promise(r => setTimeout(r, 600));

  // Verify "beautiful" is highlighted in textarea-standard and clicking it replaces with "wonderful"
  const dynamicRuleClick = await evalInPage(`
    (() => {
      const host = document.getElementById('is-highlighter-extension-root');
      if (!host || !host.shadowRoot) return { success: false, reason: 'no-host' };
      const marks = Array.from(host.shadowRoot.querySelectorAll('mark.is-highlight-word'));
      const beautifulMark = marks.find(m => m.textContent === 'beautiful');
      if (!beautifulMark) return { success: false, reason: 'mark-not-found', words: marks.map(m => m.textContent) };
      beautifulMark.click();
      return {
        success: true,
        val: document.getElementById('textarea-standard').value
      };
    })()
  `);
  assert.strictEqual(dynamicRuleClick.success, true, 'Custom rule mark "beautiful" must be detected and clickable');
  assert(dynamicRuleClick.val.includes('wonderful'), 'Custom replacement must replace "beautiful" with "wonderful"');
  console.log('[PASS] Dynamic user-configured rules highlight and replace text successfully.');

  // 14. Test Snippet Storage & Offscreen Clipboard Setup
  console.log('[Snippets] Saving snippet in storage...');
  await evalInSW(`
    new Promise(resolve => {
      chrome.storage.sync.set({
        snippets: [{ id: 'snip-test-1', heading: 'Quick Intro', description: 'Hello world from Helper snippet!' }]
      }, resolve);
    })
  `);
  await new Promise(r => setTimeout(r, 400));
  const snippetData = await evalInSW(`
    new Promise(resolve => {
      chrome.storage.sync.get(['snippets'], (res) => resolve(res.snippets));
    })
  `);
  assert.strictEqual(snippetData.length, 1);
  assert.strictEqual(snippetData[0].heading, 'Quick Intro');
  console.log('[PASS] Snippets stored persistently in extension storage.');

  // 14b. Test Scaling Beyond 22 Snippets in Real Chrome Storage
  console.log('[Snippets Scale] Testing 30 snippets in live Chrome storage...');
  const scaleCount = await evalInSW(`
    (async () => {
      for (let i = 1; i <= 30; i++) {
        await StorageManager.saveSnippet({
          id: 'snip-live-' + i,
          heading: 'Live Snippet ' + i,
          description: 'Description for snippet ' + i + ' with detailed troubleshooting steps.',
          answers: [
            'Description for snippet ' + i + ' with detailed troubleshooting steps.',
            'Alternative resolution step ' + i
          ]
        });
      }
      const all = await StorageManager.getSnippets();
      return all.length;
    })()
  `);
  assert(scaleCount >= 30, 'StorageManager must store 30+ snippets without quota failure in live Chrome');
  console.log('[PASS] Successfully saved and retrieved ' + scaleCount + ' snippets in live Chrome.');

  // 14c. Test Direct Paste Snippet via Action Message
  console.log('[Paste Snippet] Testing direct snippet paste into active text field...');
  await evalInPage(`
    (() => {
      const ta = document.getElementById('textarea-standard');
      ta.focus();
      ta.dispatchEvent(new Event('focus', { bubbles: true }));
      ta.value = 'Initial ';
      ta.selectionStart = ta.value.length;
      ta.selectionEnd = ta.value.length;
    })()
  `);
  await evalInSW(`
    (async () => {
      const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1:${PORT}/*' });
      if (tab) {
        await chrome.tabs.sendMessage(tab.id, { type: 'PASTE_SNIPPET', text: 'Hello Direct Paste!' });
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 400));
  const pastedVal = await evalInPage(`document.getElementById('textarea-standard').value`);
  assert(pastedVal.includes('Hello Direct Paste!'), 'Textarea must contain directly pasted snippet text');
  console.log('[PASS] Snippet paste action successfully inserts text into focused field.');

  // 14d. Test Unified Flying Toolbar (Only on Selection, Group Order: Transform, Shortcuts, Unwanted Headers)
  console.log('[Flying Toolbar] Testing unified flying toolbar grouping and display on selection...');
  await evalInSW(`
    (async () => {
      await StorageManager.saveShortcut({ id: 'sc-test-1', name: 'PasteHelper', keys: 'Ctrl+V' });
    })()
  `);
  await new Promise(r => setTimeout(r, 300));

  const toolbarSelectionResult = await evalInPage(`
    (async () => {
      const ta = document.getElementById('textarea-standard');
      ta.value = 'Text for toolbar test';
      ta.focus();
      ta.dispatchEvent(new Event('input', { bubbles: true }));

      await new Promise(r => setTimeout(r, 150));
      const host = document.getElementById('is-highlighter-extension-root');
      if (!host || !host.shadowRoot) return { error: 'No shadow root' };

      const toolbar = host.shadowRoot.querySelector('.helper-flying-toolbar');
      const compStyleBefore = toolbar ? window.getComputedStyle(toolbar).display : 'none';
      const hiddenWithoutSelection = !toolbar || (compStyleBefore === 'none' && !toolbar.classList.contains('is-toolbar-visible'));

      // Now select text
      ta.setSelectionRange(0, ta.value.length);
      ta.dispatchEvent(new Event('select', { bubbles: true }));
      ta.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      document.dispatchEvent(new Event('selectionchange'));

      await new Promise(r => setTimeout(r, 200));
      const compStyleAfter = toolbar ? window.getComputedStyle(toolbar).display : 'none';
      const visibleOnSelection = toolbar && compStyleAfter === 'flex' && toolbar.classList.contains('is-toolbar-visible');

      const groups = Array.from(toolbar.querySelectorAll('.helper-toolbar-group-label')).map(l => l.textContent.trim());

      return {
        hiddenWithoutSelection,
        visibleOnSelection,
        groups
      };
    })()
  `);
  assert.strictEqual(toolbarSelectionResult.hiddenWithoutSelection, true, 'Flying toolbar must be hidden when no text is selected');
  assert.strictEqual(toolbarSelectionResult.visibleOnSelection, true, 'Flying toolbar must be visible when text is selected');
  assert.deepStrictEqual(toolbarSelectionResult.groups, ['Transform', 'Shortcuts', 'Unwanted Headers'], 'Groups must be in order: Transform, Shortcuts, Unwanted Headers');
  console.log('[PASS] Unified flying toolbar appears only on text selection in correct group order.');

  // 14e. Test Unwanted Headers Cleaner preserving Markdown & Code format
  console.log('[Markdown Cleaner] Testing unwanted headers removal inside markdown code blocks...');
  const markdownCleanResult = await evalInPage(`
    (async () => {
      const ta = document.getElementById('textarea-standard');
      ta.value = '# API Specification\\n\\n\`\`\`http\\nPOST /v1/data HTTP/1.1\\nHost: example.com\\nsec-fetch-mode: cors\\nsec-ch-ua: "TestBrowser"\\nAccept: application/json\\nPriority: u=1\\n\`\`\`\\n\\nEnd of document.';
      ta.focus();
      ta.setSelectionRange(0, ta.value.length);
      ta.dispatchEvent(new Event('select', { bubbles: true }));
      document.dispatchEvent(new Event('selectionchange'));

      await new Promise(r => setTimeout(r, 200));
      const host = document.getElementById('is-highlighter-extension-root');
      const toolbar = host.shadowRoot.querySelector('.helper-flying-toolbar');
      const removeBtn = toolbar.querySelector('.helper-flying-header-btn');
      removeBtn.click();
      await new Promise(r => setTimeout(r, 200));

      return {
        cleanedValue: ta.value
      };
    })()
  `);
  assert(markdownCleanResult.cleanedValue.includes('```http'), 'Markdown code fence ```http must be preserved');
  assert(markdownCleanResult.cleanedValue.includes('```\n\nEnd of document.'), 'Closing markdown code fence must be preserved');
  assert(markdownCleanResult.cleanedValue.includes('# API Specification'), 'Markdown heading must be preserved');
  assert(markdownCleanResult.cleanedValue.includes('Host: example.com'), 'Host header must be preserved');
  assert(markdownCleanResult.cleanedValue.includes('Accept: application/json'), 'Accept header must be preserved');
  assert(!markdownCleanResult.cleanedValue.includes('sec-fetch-mode'), 'sec-fetch-mode must be removed');
  assert(!markdownCleanResult.cleanedValue.includes('sec-ch-ua'), 'sec-ch-ua must be removed');
  assert(!markdownCleanResult.cleanedValue.includes('Priority:'), 'Priority header line must be removed');
  console.log('[PASS] Markdown code format and document structure preserved while stripping unwanted headers.');

  // 14f. Test Red Color Redact does NOT modify next line
  console.log('[Redact Test] Testing Red Color Redact on single line preserving next line...');
  const redColorRedactResult = await evalInPage(`
    (async () => {
      const ta = document.getElementById('textarea-standard');
      ta.value = 'secret_token_12345\\nNext line untouched';
      ta.focus();
      // Select only the first line "secret_token_12345"
      ta.setSelectionRange(0, 18);
      ta.dispatchEvent(new Event('select', { bubbles: true }));
      document.dispatchEvent(new Event('selectionchange'));

      await new Promise(r => setTimeout(r, 200));
      const host = document.getElementById('is-highlighter-extension-root');
      const toolbar = host.shadowRoot.querySelector('.helper-flying-toolbar');
      const redBtn = Array.from(toolbar.querySelectorAll('.helper-bar-btn-red')).find(b => b.dataset.action === 'red-color-redact');
      if (!redBtn) return { error: 'Red color redact button not found' };
      redBtn.click();
      await new Promise(r => setTimeout(r, 200));

      const redSpans = Array.from(host.shadowRoot.querySelectorAll('.helper-redacted-endpoint-red')).map(s => s.textContent);

      return {
        val: ta.value,
        redSpans
      };
    })()
  `);
  assert(redColorRedactResult.val.startsWith('sec[redacted]345\nNext line untouched'), 'Only selected line must be redacted, next line must remain untouched');
  assert(redColorRedactResult.val.includes('Next line untouched'), 'Next line must be preserved without any modifications');
  assert(!redColorRedactResult.val.includes('[redacted]\n[redacted]'), 'Must not create extra redact on next line');
  console.log('[PASS] Red Color Redact transforms selected text without modifying or adding redact to next line.');

  // 14f. Test Replacer Disabling & Toolbar Decoupling
  console.log('[Toolbar Decoupling] Testing replacer pause while toolbar features remain active...');
  await evalInSW(`
    new Promise(resolve => {
      chrome.storage.sync.set({
        site_replacer_state: { '127.0.0.1:${PORT}': false }
      }, resolve);
    })
  `);
  await new Promise(r => setTimeout(r, 500));

  const hostStillActive = await evalInPage(`!!document.getElementById('is-highlighter-extension-root')`);
  assert.strictEqual(hostStillActive, true, 'Host root must remain active for shortcuts/transform even when replacer is paused');

  // Verify highlights are hidden when replacer is paused
  const highlightsCountWhenPaused = await evalInPage(`
    (() => {
      const host = document.getElementById('is-highlighter-extension-root');
      if (!host || !host.shadowRoot) return 0;
      return host.shadowRoot.querySelectorAll('.is-highlight-mark').length;
    })()
  `);
  assert.strictEqual(highlightsCountWhenPaused, 0, 'Word replacement highlights must be cleared when replacer is paused');
  console.log('[PASS] Word replacer paused without deactivating extension.');

  // Test toolbar hidden when all toolbar switches (Transform, Shortcuts, Unwanted Headers) are disabled
  console.log('[Toolbar Decoupling] Testing flying toolbar suppression when all toolbar groups are disabled...');
  await evalInSW(`
    new Promise(resolve => {
      chrome.storage.sync.set({
        site_replacer_state: { '127.0.0.1:${PORT}': true },
        site_transform_state: { '127.0.0.1:${PORT}': false },
        site_shortcuts_state: { '127.0.0.1:${PORT}': false },
        site_unwanted_headers_state: { '127.0.0.1:${PORT}': false }
      }, resolve);
    })
  `);
  await new Promise(r => setTimeout(r, 600));

  const toolbarHiddenOnSelection = await evalInPage(`
    (() => {
      const ta = document.getElementById('textarea-standard');
      ta.focus();
      ta.setSelectionRange(0, 10);
      document.dispatchEvent(new Event('selectionchange'));
      const host = document.getElementById('is-highlighter-extension-root');
      if (!host || !host.shadowRoot) return true;
      const tb = host.shadowRoot.querySelector('.helper-flying-toolbar');
      return !tb || window.getComputedStyle(tb).display === 'none';
    })()
  `);
  assert.strictEqual(toolbarHiddenOnSelection, true, 'Toolbar must not show when Transform, Shortcuts, and Unwanted Headers are all paused');
  console.log('[PASS] Flying toolbar is completely suppressed when all toolbar features are disabled.');

  // 15. Test all switches disabled (multi-switch status)
  console.log('[Multi-Switch] Disabling all site switches to verify PAUSE badge...');
  await evalInSW(`
    new Promise(resolve => {
      chrome.storage.sync.set({
        site_replacer_state: { '127.0.0.1:${PORT}': false },
        site_storage_state: { '127.0.0.1:${PORT}': false },
        site_shortcuts_state: { '127.0.0.1:${PORT}': false },
        site_transform_state: { '127.0.0.1:${PORT}': false },
        site_unwanted_headers_state: { '127.0.0.1:${PORT}': false }
      }, resolve);
    })
  `);
  await new Promise(r => setTimeout(r, 600));

  // Verify badge shows PAUSE when ALL features are disabled
  const badgeWhenAllPaused = await evalInSW(`
    (async () => {
      const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1:${PORT}/*' });
      if (!tab) return 'no-tab';
      return await chrome.action.getBadgeText({ tabId: tab.id });
    })()
  `);
  assert.strictEqual(badgeWhenAllPaused, 'PAUSE', 'Badge must show PAUSE when all features are disabled');
  console.log('[PASS] Badge shows PAUSE when all features on the site are paused.');

  // 16. Test allowlist removal deactivation
  console.log('[Allowlist] Removing site from allowlist in storage...');
  await evalInSW(`
    new Promise(resolve => {
      chrome.storage.sync.set({ allowlist: [] }, resolve);
    })
  `);
  await new Promise(r => setTimeout(r, 600));

  const hostAfterDeactivate = await evalInPage(`!!document.getElementById('is-highlighter-extension-root')`);
  assert.strictEqual(hostAfterDeactivate, false, 'Host must be completely removed when site is removed from allowlist');
  console.log('[PASS] Overlays completely removed and extension deactivated on allowlist removal.');

  console.log('============================================');
  console.log('  ALL INTEGRATION TESTS PASSED 100%!        ');
  console.log('============================================');

  cleanup();
  process.exit(0);
}

runTest().catch(err => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
