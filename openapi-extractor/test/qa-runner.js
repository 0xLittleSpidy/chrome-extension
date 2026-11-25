import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(__dirname, '..');
const QA_DOCS_DIR = path.join(__dirname, 'qa-docs');
const PORT = 8770;
const DEBUG_PORT = 9446;

const CHROME_BIN = fs.existsSync('/home/littlespidy/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome')
  ? '/home/littlespidy/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'
  : fs.existsSync('/home/littlespidy/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome')
    ? '/home/littlespidy/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome'
    : 'google-chrome';

const server = http.createServer((req, res) => {
  const reqUrl = (req.url || '/').split('?')[0];
  const relPath = reqUrl === '/' ? '/docs/index.html' : reqUrl;
  const filePath = path.join(QA_DOCS_DIR, relPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const contentType = ext === '.html' ? 'text/html'
      : ext === '.md' ? 'text/markdown'
      : ext === '.json' ? 'application/json'
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

function checkNoEmojisInRepo(dir) {
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'icons') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      checkNoEmojisInRepo(full);
    } else if (/\.(js|html|css|json|md)$/.test(entry.name)) {
      const content = fs.readFileSync(full, 'utf8');
      assert.equal(emojiRegex.test(content), false, `Emoji found in ${full}`);
    }
  }
}

async function waitForTargets(predicate, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const targets = await res.json();
      const found = targets.find(predicate);
      if (found) return found;
    } catch {
      // Chrome still starting
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Timed out waiting for Chrome target');
}

async function runQA() {
  console.log('Starting OpenAPI Extractor Live Browser QA...');
  checkNoEmojisInRepo(EXT_DIR);
  console.log('Verified zero emojis across extension source files.');

  await new Promise((r) => server.listen(PORT, r));
  console.log(`QA mock docs server running at http://127.0.0.1:${PORT}/docs/index.html`);

  const userDataDir = `/tmp/openapi-extractor-qa-${Date.now()}`;
  const chromeProc = spawn(CHROME_BIN, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${userDataDir}`,
    `--disable-extensions-except=${EXT_DIR}`,
    `--load-extension=${EXT_DIR}`,
    `http://127.0.0.1:${PORT}/docs/index.html`
  ], { stdio: 'ignore' });

  try {
    // Wait for our extension's service worker target to discover extension ID
    const swTarget = await waitForTargets(
      (t) =>
        t.type === 'service_worker' &&
        t.url.startsWith('chrome-extension://') &&
        t.url.endsWith('/background.js') &&
        !t.url.includes('glbjnfimcajjenihimblfaponejbkoph') &&
        !t.url.includes('nkeimhogjdpnpccoofpliimaahmaaome')
    );
    const extId = new URL(swTarget.url).hostname;
    console.log(`Loaded extension ID: ${extId}`);

    // Open sidepanel in a tab from the extension service worker so it runs in the extension process
    const sidepanelUrl = `chrome-extension://${extId}/sidepanel/sidepanel.html?testUrl=${encodeURIComponent(`http://127.0.0.1:${PORT}/docs/index.html`)}`;
    const swWs = new WebSocket(swTarget.webSocketDebuggerUrl);
    await new Promise((r) => swWs.addEventListener('open', r, { once: true }));
    await sendCDP(swWs, 'Runtime.enable');
    await sendCDP(swWs, 'Runtime.evaluate', {
      expression: `chrome.tabs.create({ url: ${JSON.stringify(sidepanelUrl)} })`,
      awaitPromise: true
    });
    swWs.close();

    const panelTarget = await waitForTargets(
      (t) => t.type === 'page' && t.url.startsWith(`chrome-extension://${extId}/sidepanel/sidepanel.html`)
    );

    const ws = new WebSocket(panelTarget.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));

    const consoleErrors = [];
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(JSON.stringify(msg.params));
      }
    });

    await sendCDP(ws, 'Runtime.enable');
    await sendCDP(ws, 'Page.enable');

    // Wait for sidepanel UI to initialize
    for (let i = 0; i < 20; i += 1) {
      const readyRes = await sendCDP(ws, 'Runtime.evaluate', {
        expression: `Boolean(document.getElementById('path-prefix-input') && document.getElementById('active-url')?.textContent?.includes('127.0.0.1'))`,
        returnByValue: true
      });
      if (readyRes?.result?.value) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    // Verify prefix auto-detected as /docs/
    const prefixRes = await sendCDP(ws, 'Runtime.evaluate', {
      expression: `document.getElementById('path-prefix-input')?.value`,
      returnByValue: true
    });
    if (prefixRes?.result?.value !== '/docs/') {
      const diag = await sendCDP(ws, 'Runtime.evaluate', {
        expression: `JSON.stringify({ href: location.href, ready: document.readyState, bodyLen: document.body?.innerHTML?.length })`,
        returnByValue: true
      });
      console.error('Unexpected prefixRes:', JSON.stringify(prefixRes), 'diag:', diag?.result?.value, 'consoleErrors:', consoleErrors);
    }
    assert.equal(prefixRes.result.value, '/docs/');

    // Click Crawl Page
    await sendCDP(ws, 'Runtime.evaluate', {
      expression: `document.getElementById('crawl-btn').click()`,
      returnByValue: true
    });

    // Poll until status-badge becomes "complete"
    let status = '';
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 250));
      const statusRes = await sendCDP(ws, 'Runtime.evaluate', {
        expression: `document.getElementById('status-badge').textContent`,
        returnByValue: true
      });
      status = statusRes.result.value;
      if (status === 'complete') break;
    }
    assert.equal(status, 'complete', `Expected crawl to complete, got ${status}`);

    // Verify 3 endpoints (GET /api/v1/users, POST /api/v1/users, DELETE /api/v1/tokens/{tokenId})
    const summaryRes = await sendCDP(ws, 'Runtime.evaluate', {
      expression: `({
        pages: document.getElementById('stat-pages').textContent,
        paths: document.getElementById('stat-paths').textContent,
        ops: document.getElementById('stat-operations').textContent,
        schemas: document.getElementById('stat-schemas').textContent,
        rows: document.querySelectorAll('#endpoints-tbody tr').length,
        jsonDisabled: document.getElementById('download-json-btn').disabled,
        yamlDisabled: document.getElementById('download-yaml-btn').disabled
      })`,
      returnByValue: true
    });
    const summary = summaryRes.result.value;
    console.log('Crawl UI summary:', summary);

    assert.equal(summary.pages, '3');
    assert.equal(summary.paths, '2');
    assert.equal(summary.ops, '3');
    assert.equal(summary.schemas, '1');
    assert.equal(summary.rows, 3);
    assert.equal(summary.jsonDisabled, false);
    assert.equal(summary.yamlDisabled, false);

    // Test method filter chip (DELETE)
    await sendCDP(ws, 'Runtime.evaluate', {
      expression: `document.querySelector('[data-method="DELETE"]').click(); document.querySelectorAll('#endpoints-tbody tr').length`,
      returnByValue: true
    }).then((res) => assert.equal(res.result.value, 1));

    // Reset to ALL and test Download JSON & YAML clicks
    await sendCDP(ws, 'Runtime.evaluate', {
      expression: `
        document.querySelector('[data-method="ALL"]').click();
        document.getElementById('download-json-btn').click();
        document.getElementById('download-yaml-btn').click();
        document.getElementById('status-message').textContent;
      `,
      returnByValue: true
    }).then((res) => assert.ok(res.result.value.includes('Downloaded OpenAPI YAML')));

    assert.equal(consoleErrors.length, 0, `Runtime exceptions detected: ${consoleErrors.join('; ')}`);
    ws.close();
    console.log('Live Browser QA passed!');
  } finally {
    chromeProc.kill('SIGKILL');
    server.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

runQA().catch((err) => {
  console.error('QA FAILED:', err);
  process.exit(1);
});
