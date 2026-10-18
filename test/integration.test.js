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

  const userDataDir = `/tmp/cft-profile-${Date.now()}`;
  const chromeProcess = spawn(CHROME_BIN, [
    '--headless=new',
    '--remote-debugging-port=9222',
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

  // Wait for browser to initialize
  await new Promise(r => setTimeout(r, 1500));

  const targets = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
  console.log('[Browser] Running targets:', targets.map(t => ({ type: t.type, title: t.title, url: t.url })));

  // Locate our background service worker
  const swTarget = targets.find(t => t.url.includes(`${EXT_ID}/background.js`));
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
  const initialStorage = await evalInSW(`chrome.storage.sync.get(['allowlist'])`);
  console.log('[Storage] Initial state:', initialStorage);
  assert(Array.isArray(initialStorage.allowlist), 'allowlist must be an array');
  assert.strictEqual(initialStorage.allowlist.length, 0, 'Allowlist must be empty by default');
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

  // 11. Test allowlist removal deactivation
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
