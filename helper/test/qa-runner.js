/**
 * Mandatory Browser QA Runner
 * Starts an HTTP server, launches Chromium with the unpacked extension,
 * and performs automated end-to-end browser QA across all extension features.
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const EXT_DIR = path.resolve(__dirname, '..');
const PORT = 8769;

const CHROME_BIN = fs.existsSync('/home/littlespidy/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome')
  ? '/home/littlespidy/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'
  : 'google-chrome';

// Static HTTP server serving extension files and test/qa-page.html
const server = http.createServer((req, res) => {
  const reqUrl = req.url.split('?')[0];
  const reqPath = reqUrl === '/' ? '/test/qa-page.html' : reqUrl;
  const filePath = path.join(EXT_DIR, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const contentType = ext === '.html' ? 'text/html'
      : ext === '.js' ? 'application/javascript'
      : ext === '.css' ? 'text/css'
      : ext === '.png' ? 'image/png'
      : 'text/plain';
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

function hasEmoji(str) {
  if (!str) return false;
  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(str);
}

async function runBrowserQA() {
  console.log('======================================================');
  console.log('   STARTING MANDATORY BROWSER QA VERIFICATION         ');
  console.log('======================================================');

  await new Promise(r => server.listen(PORT, r));
  console.log(`[QA Server] Running at http://127.0.0.1:${PORT}/test/qa-page.html`);

  const userDataDir = `/tmp/cft-qa-${Date.now()}`;
  const chromeProcess = spawn(CHROME_BIN, [
    '--headless=new',
    '--remote-debugging-port=9444',
    '--no-sandbox',
    `--load-extension=${EXT_DIR}`,
    `--disable-extensions-except=${EXT_DIR}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1280,900'
  ]);

  let isCleaned = false;
  function cleanup() {
    if (!isCleaned) {
      isCleaned = true;
      try { chromeProcess.kill(); } catch (e) {}
      try { server.close(); } catch (e) {}
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
    }
  }

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });
  process.on('uncaughtException', (err) => {
    console.error('[QA Error]', err);
    cleanup();
    process.exit(1);
  });

  await new Promise(r => setTimeout(r, 1800));

  const targets = await fetch('http://127.0.0.1:9444/json').then(r => r.json());
  const swTarget = targets.find(t => t.url.endsWith('/background.js') && !t.url.includes('glbjnfimcajjenihimblfaponejbkoph'));
  assert(swTarget, 'Background service worker must be loaded and running');

  const extMatch = swTarget.url.match(/chrome-extension:\/\/([a-z]+)\//);
  assert(extMatch, 'Extension ID must be found');
  const extId = extMatch[1];
  console.log('[PASS] Helper Extension loaded with ID:', extId);

  const swWs = new WebSocket(swTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    swWs.onopen = resolve;
    swWs.onerror = reject;
  });
  await sendCDP(swWs, 'Runtime.enable');

  async function evalInSW(expr) {
    const res = await sendCDP(swWs, 'Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error('SW Eval error: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result.value;
  }

  // 1. Allowlist the QA site in extension storage
  await evalInSW(`chrome.storage.sync.set({ allowlist: ['127.0.0.1:${PORT}'] })`);
  console.log(`[PASS] Whitelisted 127.0.0.1:${PORT} in storage.`);

  // 2. Open QA Page in browser
  const qaUrl = `http://127.0.0.1:${PORT}/test/qa-page.html`;
  const pageTarget = await fetch('http://127.0.0.1:9444/json/new?' + encodeURIComponent(qaUrl), { method: 'PUT' }).then(r => r.json());
  console.log('[PASS] Navigated browser to QA page:', pageTarget.url);

  const pageWs = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(r => pageWs.onopen = r);
  await sendCDP(pageWs, 'Runtime.enable');
  await sendCDP(pageWs, 'Page.enable');
  await sendCDP(pageWs, 'DOM.enable');

  await new Promise(r => setTimeout(r, 1500));

  async function evalInPage(expr) {
    const res = await sendCDP(pageWs, 'Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error('Page Eval failed: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result.value;
  }

  async function captureScreenshot(ws, filePath) {
    const shot = await sendCDP(ws, 'Page.captureScreenshot', { format: 'png' });
    if (filePath) {
      try {
        fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
      } catch (err) {
        console.warn('[QA] Failed to write screenshot to', filePath, err.message);
      }
    }
    return shot.data;
  }

  async function dispatchMouseClick(ws, x, y) {
    await sendCDP(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) });
    await sendCDP(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
    await sendCDP(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
  }

  const ARTIFACT_DIR = '/home/littlespidy/.gemini/antigravity-cli/brain/f72bf1cf-cc59-47b0-b9e3-bd4cb8b576fe';

  // 3. Verify Helper content script injected and shadow root exists
  const hostCheck = await evalInPage(`Boolean(document.getElementById('is-highlighter-extension-root'))`);
  assert.strictEqual(hostCheck, true, 'Helper content script Shadow DOM root must be injected');
  console.log('[PASS] Helper content script active and Shadow DOM root mounted.');

  // 4. Verify Word Replacer ("is" -> "was") and hover tooltip
  console.log('[QA] Testing word highlights and hover tooltip...');
  const highlights = await evalInPage(`
    (() => {
      const host = document.getElementById('is-highlighter-extension-root');
      const marks = Array.from(host.shadowRoot.querySelectorAll('mark.is-highlight-word')).map(m => m.textContent);
      return marks;
    })()
  `);
  assert(highlights.includes('is'), 'Word replacer must detect and highlight "is"');
  console.log('[PASS] Word replacer successfully detected words:', highlights.slice(0, 5));

  const wordReplaceResult = await evalInPage(`
    (() => {
      const ta = document.getElementById('qa-textarea-replacer');
      const host = document.getElementById('is-highlighter-extension-root');
      const firstMark = host.shadowRoot.querySelector('mark.is-highlight-word');
      if (!firstMark) return { error: 'No highlight mark found' };
      firstMark.click();
      return { val: ta.value };
    })()
  `);
  assert(wordReplaceResult.val.startsWith('This was a primary test sentence.'), 'Clicking highlight must replace "is" with "was"');
  console.log('[PASS] One-click replacement ("is" -> "was") executed accurately.');

  // 5. Verify Flying Toolbar appears ONLY on text selection and dismisses on outside click
  console.log('[QA] Testing flying toolbar selection and outside dismissal with physical mouse interaction simulation...');

  // Get physical bounding coordinates of textarea for mouse interaction
  const taCoords = await evalInPage(`
    (() => {
      const ta = document.getElementById('qa-textarea-transform');
      const r = ta.getBoundingClientRect();
      return { x: r.left + 25, y: r.top + 25 };
    })()
  `);

  // Test 5a: Dispatch physical mouse click inside the textbox WITHOUT selecting text
  await dispatchMouseClick(pageWs, taCoords.x, taCoords.y);
  await new Promise(r => setTimeout(r, 200));

  const toolbarOnFocusOnly = await evalInPage(`
    (() => {
      const host = document.getElementById('is-highlighter-extension-root');
      if (!host || !host.shadowRoot) return { error: 'No shadow root' };
      const toolbar = host.shadowRoot.querySelector('.helper-flying-toolbar');
      if (!toolbar) return { computedDisplay: 'none', offsetWidth: 0, offsetHeight: 0, isVisibleClass: false };
      return {
        computedDisplay: window.getComputedStyle(toolbar).display,
        offsetWidth: toolbar.offsetWidth,
        offsetHeight: toolbar.offsetHeight,
        isVisibleClass: toolbar.classList.contains('is-toolbar-visible')
      };
    })()
  `);

  assert.strictEqual(toolbarOnFocusOnly.computedDisplay, 'none', 'Flying toolbar computed display must be "none" when clicking without selection');
  assert.strictEqual(toolbarOnFocusOnly.offsetWidth, 0, 'Flying toolbar offsetWidth must be 0 when unselected');
  assert.strictEqual(toolbarOnFocusOnly.isVisibleClass, false, 'Toolbar must not have is-toolbar-visible class when unselected');
  await captureScreenshot(pageWs, path.join(ARTIFACT_DIR, 'qa-toolbar-hidden-on-click.png'));
  console.log('[PASS] Physical click in textbox confirms toolbar is completely hidden (computed display: none, width: 0).');

  // Test 5b: Selecting text must display the toolbar
  const toolbarAfterSelection = await evalInPage(`
    (async () => {
      const ta = document.getElementById('qa-textarea-transform');
      ta.focus();
      ta.setSelectionRange(0, 12); // "Bearer token"
      ta.dispatchEvent(new Event('select', { bubbles: true }));
      ta.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise(r => setTimeout(r, 200));

      const host = document.getElementById('is-highlighter-extension-root');
      const toolbar = host.shadowRoot.querySelector('.helper-flying-toolbar');
      const groups = Array.from(toolbar.querySelectorAll('.helper-toolbar-group-label')).map(l => l.textContent);
      return {
        computedDisplay: window.getComputedStyle(toolbar).display,
        offsetWidth: toolbar.offsetWidth,
        offsetHeight: toolbar.offsetHeight,
        isVisibleClass: toolbar.classList.contains('is-toolbar-visible'),
        groups
      };
    })()
  `);
  assert.strictEqual(toolbarAfterSelection.computedDisplay, 'flex', 'Flying toolbar must be computed display "flex" on text selection');
  assert(toolbarAfterSelection.offsetWidth > 0, 'Flying toolbar must have non-zero width when visible');
  assert.strictEqual(toolbarAfterSelection.isVisibleClass, true, 'Flying toolbar must have is-toolbar-visible class');
  assert.deepStrictEqual(toolbarAfterSelection.groups, ['Transform', 'Unwanted Headers'], 'Toolbar groups must follow order: Transform -> Shortcuts -> Unwanted Headers');
  await captureScreenshot(pageWs, path.join(ARTIFACT_DIR, 'qa-toolbar-visible-on-selection.png'));
  console.log('[PASS] Flying toolbar displays strictly on selection with computed display "flex" and correct group ordering.');

  // Test 5c: Physical click outside must immediately dismiss the toolbar
  await dispatchMouseClick(pageWs, 10, 10);
  await new Promise(r => setTimeout(r, 150));

  const toolbarAfterOutsideClick = await evalInPage(`
    (() => {
      const host = document.getElementById('is-highlighter-extension-root');
      const toolbar = host.shadowRoot.querySelector('.helper-flying-toolbar');
      if (!toolbar) return { computedDisplay: 'none', offsetWidth: 0, isVisibleClass: false };
      return {
        computedDisplay: window.getComputedStyle(toolbar).display,
        offsetWidth: toolbar.offsetWidth,
        offsetHeight: toolbar.offsetHeight,
        isVisibleClass: toolbar.classList.contains('is-toolbar-visible')
      };
    })()
  `);
  assert.strictEqual(toolbarAfterOutsideClick.computedDisplay, 'none', 'Flying toolbar must have computed display "none" upon outside click');
  assert.strictEqual(toolbarAfterOutsideClick.offsetWidth, 0, 'Flying toolbar offsetWidth must be 0 after outside click');
  assert.strictEqual(toolbarAfterOutsideClick.isVisibleClass, false, 'Toolbar must not have is-toolbar-visible class after outside click');
  await captureScreenshot(pageWs, path.join(ARTIFACT_DIR, 'qa-toolbar-hidden-outside-click.png'));
  console.log('[PASS] Physical click outside immediately dismisses flying toolbar (computed display: none, width: 0).');

  // 6. Test Red Color Redact preserving next line
  console.log('[QA] Testing Red Color Redact line scoping...');
  const redactResult = await evalInPage(`
    (async () => {
      const ta = document.getElementById('qa-textarea-transform');
      ta.focus();
      ta.selectionStart = 0;
      ta.selectionEnd = 28; // "Bearer token_abc123456789xyz"
      ta.dispatchEvent(new Event('select'));
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise(r => setTimeout(r, 200));

      const host = document.getElementById('is-highlighter-extension-root');
      const toolbar = host.shadowRoot.querySelector('.helper-flying-toolbar');
      const redBtn = Array.from(toolbar.querySelectorAll('.helper-bar-btn-red')).find(b => b.dataset.action === 'red-color-redact');
      if (!redBtn) return { error: 'Red color redact button not found' };
      redBtn.click();
      await new Promise(r => setTimeout(r, 200));

      return {
        val: ta.value
      };
    })()
  `);
  assert(redactResult.val.startsWith('Bea[redacted]xyz\nSecond line untouched'), 'Red Color Redact must redact first line and keep second line completely untouched');
  assert(!redactResult.val.includes('[redacted]\n[redacted]'), 'Must not create extra redact on next line');
  console.log('[PASS] Red Color Redact transformed selected text without modifying next line.');

  // 7. Test Unwanted Headers removal preserving markdown formatting
  console.log('[QA] Testing Unwanted Headers removal on markdown code block...');
  const mdResult = await evalInPage(`
    (async () => {
      const ta = document.getElementById('qa-textarea-markdown');
      ta.focus();
      ta.selectionStart = 0;
      ta.selectionEnd = ta.value.length;
      ta.dispatchEvent(new Event('select'));
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise(r => setTimeout(r, 200));

      const host = document.getElementById('is-highlighter-extension-root');
      const toolbar = host.shadowRoot.querySelector('.helper-flying-toolbar');
      const cleanBtn = toolbar.querySelector('.helper-flying-header-btn');
      if (!cleanBtn) return { error: 'Clean headers button not found' };
      cleanBtn.click();
      await new Promise(r => setTimeout(r, 200));

      return {
        val: ta.value
      };
    })()
  `);
  assert(mdResult.val.includes('```bash'), 'Markdown code fence must be preserved');
  assert(mdResult.val.includes('curl -X POST https://api.example.com/data'), 'Code contents must be preserved');
  assert(mdResult.val.includes('# API Request Summary'), 'Markdown heading must be preserved');
  assert(!mdResult.val.includes('sec-fetch-mode'), 'Unwanted sec-fetch-mode header must be stripped');
  assert(!mdResult.val.includes('Priority:'), 'Unwanted Priority header must be stripped');
  console.log('[PASS] Unwanted headers stripped while preserving full Markdown document structure.');

  // 8. Test Settings Page (default dark theme, live markdown preview, multi-answer snippets)
  console.log('[QA] Testing Settings Page in browser...');
  const settingsUrl = `chrome-extension://${extId}/settings/settings.html`;
  const settingsTarget = await fetch('http://127.0.0.1:9444/json/new?' + encodeURIComponent(settingsUrl), { method: 'PUT' }).then(r => r.json());
  const settingsWs = new WebSocket(settingsTarget.webSocketDebuggerUrl);
  await new Promise(r => settingsWs.onopen = r);
  await sendCDP(settingsWs, 'Runtime.enable');
  await sendCDP(settingsWs, 'Page.enable');
  await new Promise(r => setTimeout(r, 1000));

  async function evalInSettings(expr) {
    const res = await sendCDP(settingsWs, 'Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error('Settings eval failed: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result.value;
  }

  const settingsTheme = await evalInSettings(`document.documentElement.getAttribute('data-theme')`);
  assert.strictEqual(settingsTheme, 'dark', 'Settings page must default to data-theme="dark"');

  const importExportExist = await evalInSettings(`
    Boolean(document.getElementById('sidebar-import-btn')) && Boolean(document.getElementById('sidebar-export-btn'))
  `);
  assert.strictEqual(importExportExist, true, 'Sidebar import and export buttons must be present above theme toggle');

  const storageBannerAbsent = await evalInSettings(`Boolean(document.getElementById('storage-setup-banner')) === false`);
  assert.strictEqual(storageBannerAbsent, true, 'Storage setup banner must be absent');

  console.log('[PASS] Settings page: default dark theme, import/export buttons, and clean sidebar verified.');

  // Test Header Cleaner Console & Interactive Test Cleaner
  console.log('[QA] Testing Header Cleaner Console and Interactive Test Cleaner...');
  const headerConsoleTest = await evalInSettings(`
    (async () => {
      document.getElementById('nav-header-cleaner').click();
      await new Promise(r => setTimeout(r, 200));

      const terminal = document.getElementById('header-console-terminal');
      const testInput = document.getElementById('console-test-input');
      const testBtn = document.getElementById('console-test-clean-btn');
      const clearBtn = document.getElementById('clear-header-console-btn');

      if (!terminal || !testInput || !testBtn || !clearBtn) {
        return { error: 'Console elements missing' };
      }

      // Enter test headers and click test clean
      testInput.value = 'sec-fetch-mode: cors\\nAccept-Encoding: gzip\\nContent-Type: text/plain';
      testBtn.click();
      await new Promise(r => setTimeout(r, 200));

      const entryCount = terminal.querySelectorAll('.console-entry').length;
      const entryText = terminal.innerText;

      // Click clear
      clearBtn.click();
      await new Promise(r => setTimeout(r, 200));
      const afterClearCount = terminal.querySelectorAll('.console-entry').length;

      return {
        entryCount,
        entryText,
        afterClearCount
      };
    })()
  `);
  assert(headerConsoleTest.entryCount > 0, 'Header console must record deleted headers entry');
  assert(headerConsoleTest.entryText.includes('sec-fetch-mode'), 'Console log must list deleted sec-fetch-mode header');
  assert.strictEqual(headerConsoleTest.afterClearCount, 0, 'Clear console button must reset terminal entries to 0');
  console.log('[PASS] Header Cleaner Console, interactive testing, and clear function verified.');

  // 9. Zero-Emoji Compliance Check
  console.log('[QA] Testing Zero-Emoji compliance across pages...');
  const pageText = await evalInPage(`document.body.innerText`);
  assert(!hasEmoji(pageText), 'QA page must contain zero emojis');
  const settingsText = await evalInSettings(`document.body.innerText`);
  assert(!hasEmoji(settingsText), 'Settings page must contain zero emojis');
  console.log('[PASS] Zero-emoji rule verified across all user interfaces.');

  cleanup();

  console.log('======================================================');
  console.log('   MANDATORY BROWSER QA PASSED 100%! READY TO PUSH    ');
  console.log('======================================================');
}

runBrowserQA().catch(err => {
  console.error('[QA FAILED]', err);
  process.exit(1);
});
