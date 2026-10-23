const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const EXT_DIR = path.resolve(__dirname, '..');
const CHROME_BIN = fs.existsSync('/home/littlespidy/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome')
  ? '/home/littlespidy/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'
  : 'google-chrome';

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

async function runBrowserVerification() {
  console.log('--- STARTING LIVE BROWSER VERIFICATION ---');

  const userDataDir = `/tmp/cft-browser-test-${Date.now()}`;
  const chromeProcess = spawn(CHROME_BIN, [
    '--headless=new',
    '--remote-debugging-port=9333',
    '--no-sandbox',
    `--load-extension=${EXT_DIR}`,
    `--disable-extensions-except=${EXT_DIR}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1280,900'
  ]);

  let cleaned = false;
  function cleanup() {
    if (!cleaned) {
      cleaned = true;
      try { chromeProcess.kill(); } catch (e) {}
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
    }
  }

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  await new Promise(r => setTimeout(r, 1500));

  const targets = await fetch('http://127.0.0.1:9333/json').then(r => r.json());
  const swTarget = targets.find(t => t.url.endsWith('/background.js') && !t.url.includes('glbjnfimcajjenihimblfaponejbkoph'));
  assert(swTarget, 'Background service worker must be loaded');

  // Extract extension ID from URL
  const extMatch = swTarget.url.match(/chrome-extension:\/\/([a-z]+)\//);
  assert(extMatch, 'Extension ID must be found');
  const extId = extMatch[1];
  console.log('[PASS] Detected extension ID:', extId);

  // Open settings page in browser
  const settingsUrl = `chrome-extension://${extId}/settings/settings.html`;
  const pageTarget = await fetch('http://127.0.0.1:9333/json/new?' + encodeURIComponent(settingsUrl), { method: 'PUT' }).then(r => r.json());
  console.log('[PASS] Opened settings page:', pageTarget.url);

  const pageWs = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(r => { pageWs.onopen = r; });

  await sendCDP(pageWs, 'Runtime.enable');
  await sendCDP(pageWs, 'Page.enable');
  await sendCDP(pageWs, 'DOM.enable');

  await new Promise(r => setTimeout(r, 1000));

  async function evalInSettings(expr) {
    const res = await sendCDP(pageWs, 'Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error('Eval failed: ' + JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : undefined;
  }

  // 1. Verify Dark Theme by Default
  const themeAttr = await evalInSettings(`document.documentElement.getAttribute('data-theme')`);
  assert.strictEqual(themeAttr, 'dark', 'Settings page must default to data-theme="dark"');
  console.log('[PASS] Settings page data-theme is "dark" by default.');

  const bodyBg = await evalInSettings(`window.getComputedStyle(document.body).backgroundColor`);
  console.log('[PASS] Computed background color in dark theme:', bodyBg);

  // 2. Verify Storage Setup Banner is displayed on load
  const bannerVisible = await evalInSettings(`
    (() => {
      const banner = document.getElementById('storage-setup-banner');
      return banner && window.getComputedStyle(banner).display !== 'none';
    })()
  `);
  assert.strictEqual(bannerVisible, true, 'Storage setup banner must be visible on first load');
  console.log('[PASS] Storage setup banner is displayed on load with Store & Select buttons.');

  // 3. Switch to Snippets Tab
  await evalInSettings(`document.getElementById('nav-snippets').click()`);
  await new Promise(r => setTimeout(r, 300));
  const tabActive = await evalInSettings(`document.getElementById('tab-snippets').classList.contains('active')`);
  assert.strictEqual(tabActive, true, 'Snippets tab must be active');
  console.log('[PASS] Navigated to Snippets tab.');

  // 4. Test Markdown Editor & Live Markdown Viewer
  const markdownSample = '# System Announcement\nThis is **critical** and *urgent*.\n\n`sudo systemctl restart service`\n\n- Check connectivity\n- Verify DNS records';
  await evalInSettings(`
    (() => {
      const heading = document.getElementById('snippet-heading');
      heading.value = 'Server Troubleshooting';

      const desc = document.getElementById('snippet-description');
      desc.value = ${JSON.stringify(markdownSample)};
      desc.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
  await new Promise(r => setTimeout(r, 300));

  const previewHtml = await evalInSettings(`document.getElementById('snippet-markdown-preview').innerHTML`);
  assert(previewHtml.includes('<h1>System Announcement</h1>'), 'Preview must render <h1>');
  assert(previewHtml.includes('<strong>critical</strong>'), 'Preview must render <strong>');
  assert(previewHtml.includes('<em>urgent</em>'), 'Preview must render <em>');
  assert(previewHtml.includes('<code>sudo systemctl restart service</code>'), 'Preview must render <code>');
  assert(previewHtml.includes('<li>Check connectivity</li>'), 'Preview must render <li>');
  console.log('[PASS] Live Markdown Preview rendered correctly in real time next to editor.');

  // 5. Test Multi-Answer functionality: Add Option 2
  await evalInSettings(`document.getElementById('snippet-add-answer-btn').click()`);
  await new Promise(r => setTimeout(r, 300));

  const optionCount = await evalInSettings(`document.querySelectorAll('.answer-chip').length`);
  assert.strictEqual(optionCount, 2, 'Should have 2 answer option tabs');

  const secondAnswerMarkdown = '# Quick Workaround\nPlease switch to the **fallback** cluster.';
  await evalInSettings(`
    (() => {
      const desc = document.getElementById('snippet-description');
      desc.value = ${JSON.stringify(secondAnswerMarkdown)};
      desc.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
  await new Promise(r => setTimeout(r, 300));

  const previewOption2 = await evalInSettings(`document.getElementById('snippet-markdown-preview').innerHTML`);
  assert(previewOption2.includes('<h1>Quick Workaround</h1>'), 'Option 2 preview rendered');
  assert(previewOption2.includes('<strong>fallback</strong>'), 'Option 2 preview bold rendered');
  console.log('[PASS] Multi-answer option 2 created with its own live markdown preview.');

  // 6. Save Snippet and verify rendering in snippets list
  await evalInSettings(`document.getElementById('snippet-submit-btn').click()`);
  await new Promise(r => setTimeout(r, 500));

  const savedSnippetInfo = await evalInSettings(`
    (() => {
      const cards = document.querySelectorAll('.snippet-card');
      const targetCard = Array.from(cards).find(c => c.textContent.includes('Server Troubleshooting'));
      if (!targetCard) return null;
      const copyButtons = targetCard.querySelectorAll('button');
      return {
        found: true,
        buttonTexts: Array.from(copyButtons).map(b => b.textContent.trim())
      };
    })()
  `);
  assert(savedSnippetInfo && savedSnippetInfo.found, 'Saved snippet must be in the list');
  assert(savedSnippetInfo.buttonTexts.some(t => t.includes('Copy Option 1')), 'Must have Copy Option 1 button');
  assert(savedSnippetInfo.buttonTexts.some(t => t.includes('Copy Option 2')), 'Must have Copy Option 2 button');
  console.log('[PASS] Snippet card displays both answer options with separate copy buttons.');

  // 7. Test Theme Toggle
  await evalInSettings(`document.getElementById('theme-toggle-btn').click()`);
  const lightThemeAttr = await evalInSettings(`document.documentElement.getAttribute('data-theme')`);
  assert.strictEqual(lightThemeAttr, 'light', 'Theme should toggle to light');

  await evalInSettings(`document.getElementById('theme-toggle-btn').click()`);
  const backToDarkThemeAttr = await evalInSettings(`document.documentElement.getAttribute('data-theme')`);
  assert.strictEqual(backToDarkThemeAttr, 'dark', 'Theme should toggle back to dark');
  console.log('[PASS] Theme toggle switches between light and dark correctly.');

  // 8. Capture screenshot of dark theme settings page for verification
  const screenshotRes = await sendCDP(pageWs, 'Page.captureScreenshot', { format: 'png' });
  const screenshotPath = path.resolve(__dirname, 'settings-dark-preview.png');
  fs.writeFileSync(screenshotPath, Buffer.from(screenshotRes.data, 'base64'));
  console.log('[PASS] Captured screenshot saved to:', screenshotPath);

  console.log('============================================');
  console.log('  LIVE BROWSER VERIFICATION COMPLETED 100%! ');
  console.log('============================================');

  cleanup();
  process.exit(0);
}

runBrowserVerification().catch(err => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
