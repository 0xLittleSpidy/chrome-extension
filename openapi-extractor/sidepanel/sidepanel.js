import { suggestPathPrefix } from '../lib/extractor.js';
import { toYaml } from '../lib/yaml.js';

const activeUrlEl = document.getElementById('active-url');
const statusBadgeEl = document.getElementById('status-badge');
const pathPrefixInput = document.getElementById('path-prefix-input');
const maxPagesInput = document.getElementById('max-pages-input');
const crawlBtn = document.getElementById('crawl-btn');
const stopBtn = document.getElementById('stop-btn');
const clearBtn = document.getElementById('clear-btn');
const progressContainer = document.getElementById('progress-container');
const crawlProgress = document.getElementById('crawl-progress');
const statusMessageEl = document.getElementById('status-message');

const statPagesEl = document.getElementById('stat-pages');
const statPathsEl = document.getElementById('stat-paths');
const statOperationsEl = document.getElementById('stat-operations');
const statSchemasEl = document.getElementById('stat-schemas');

const downloadJsonBtn = document.getElementById('download-json-btn');
const downloadYamlBtn = document.getElementById('download-yaml-btn');
const copyJsonBtn = document.getElementById('copy-json-btn');

const searchInput = document.getElementById('search-input');
const methodChips = Array.from(document.querySelectorAll('.method-chip'));
const visibleCountEl = document.getElementById('visible-count');
const endpointsTbody = document.getElementById('endpoints-tbody');
const emptyStateEl = document.getElementById('empty-state');

let currentState = null;
let selectedMethod = 'ALL';
let activeTabInfo = { id: null, url: '' };
let prefixManuallyEdited = false;

pathPrefixInput.addEventListener('input', () => {
  prefixManuallyEdited = true;
});

async function refreshActiveTab() {
  try {
    const params = new URLSearchParams(window.location.search);
    const overrideUrl = params.get('testUrl');
    if (overrideUrl) {
      activeTabInfo = { id: null, url: overrideUrl };
      activeUrlEl.textContent = overrideUrl;
      if (!prefixManuallyEdited) {
        pathPrefixInput.value = suggestPathPrefix(overrideUrl);
      }
      return;
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs?.[0];
    if (tab?.url) {
      activeTabInfo = { id: tab.id, url: tab.url };
      activeUrlEl.textContent = tab.url;
      if (!prefixManuallyEdited && (!currentState || currentState.status === 'idle')) {
        pathPrefixInput.value = suggestPathPrefix(tab.url);
      }
    } else {
      activeUrlEl.textContent = 'No active tab detected';
    }
  } catch {
    activeUrlEl.textContent = 'Unable to read active tab';
  }
}

function getSafeFilenameBase(state) {
  try {
    const host = new URL(state.startUrl).hostname.replace(/[^a-zA-Z0-9.-]/g, '-');
    return `${host}-openapi`;
  } catch {
    return 'openapi-spec';
  }
}

function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderEndpoints() {
  const endpoints = currentState?.endpoints || [];
  const query = searchInput.value.trim().toLowerCase();

  const filtered = endpoints.filter((ep) => {
    if (selectedMethod !== 'ALL' && ep.method !== selectedMethod) {
      return false;
    }
    if (!query) return true;
    return (
      ep.path.toLowerCase().includes(query) ||
      ep.method.toLowerCase().includes(query) ||
      (ep.summary && ep.summary.toLowerCase().includes(query)) ||
      (ep.tags && ep.tags.some((t) => t.toLowerCase().includes(query)))
    );
  });

  visibleCountEl.textContent = String(filtered.length);
  endpointsTbody.replaceChildren();

  if (filtered.length === 0) {
    emptyStateEl.hidden = false;
    emptyStateEl.textContent =
      endpoints.length === 0
        ? 'No endpoints extracted yet.'
        : 'No endpoints match the current filter.';
    return;
  }

  emptyStateEl.hidden = true;
  const fragment = document.createDocumentFragment();

  for (const ep of filtered) {
    const tr = document.createElement('tr');

    const methodTd = document.createElement('td');
    const methodBadge = document.createElement('span');
    methodBadge.className = `method-tag method-${ep.method}`;
    methodBadge.textContent = ep.method;
    methodTd.appendChild(methodBadge);

    const pathTd = document.createElement('td');
    pathTd.className = 'path-cell';
    pathTd.textContent = ep.path;

    const summaryTd = document.createElement('td');
    summaryTd.className = 'summary-cell';
    summaryTd.textContent = ep.summary || (ep.tags?.length ? ep.tags.join(', ') : '-');

    tr.append(methodTd, pathTd, summaryTd);
    fragment.appendChild(tr);
  }

  endpointsTbody.appendChild(fragment);
}

function renderState(state) {
  currentState = state;
  const status = state?.status || 'idle';
  const isCrawling = status === 'crawling';

  statusBadgeEl.textContent = status;
  statusBadgeEl.className = `badge badge-${status}`;

  crawlBtn.disabled = isCrawling;
  stopBtn.hidden = !isCrawling;
  clearBtn.disabled = isCrawling;
  progressContainer.hidden = !isCrawling;

  const pagesCrawled = state?.pagesCrawled || 0;
  const pagesQueued = state?.pagesQueued || 0;
  const totalKnown = pagesCrawled + pagesQueued;
  if (isCrawling && totalKnown > 0) {
    crawlProgress.max = totalKnown;
    crawlProgress.value = pagesCrawled;
  }

  statPagesEl.textContent = String(pagesCrawled);
  statPathsEl.textContent = String(state?.stats?.totalPaths || 0);
  statOperationsEl.textContent = String(state?.stats?.totalOperations || 0);
  statSchemasEl.textContent = String(state?.stats?.totalSchemas || 0);

  const hasSpec = Boolean(state?.spec && (state?.stats?.totalOperations || 0) > 0);
  downloadJsonBtn.disabled = !hasSpec;
  downloadYamlBtn.disabled = !hasSpec;
  copyJsonBtn.disabled = !hasSpec;

  if (status === 'idle') {
    statusMessageEl.textContent = 'Open an API documentation page and click Crawl Page.';
  } else if (status === 'crawling') {
    statusMessageEl.textContent = `Crawled ${pagesCrawled} pages (${pagesQueued} queued), found ${state.fragmentsFound || 0} OpenAPI fragments...`;
  } else if (status === 'complete') {
    statusMessageEl.textContent = `Completed: ${pagesCrawled} pages crawled, ${state?.stats?.totalOperations || 0} endpoints extracted.`;
  } else if (status === 'stopped') {
    statusMessageEl.textContent = `Stopped after ${pagesCrawled} pages (${state?.stats?.totalOperations || 0} endpoints extracted).`;
  } else if (status === 'error') {
    statusMessageEl.textContent = `Error: ${state?.error || 'Crawl failed.'}`;
  }

  renderEndpoints();
}

crawlBtn.addEventListener('click', async () => {
  await refreshActiveTab();
  const response = await chrome.runtime.sendMessage({
    type: 'START_CRAWL',
    tabId: activeTabInfo.id,
    startUrl: activeTabInfo.url,
    pathPrefix: pathPrefixInput.value.trim() || '/',
    maxPages: Number(maxPagesInput.value) || 200
  });
  if (!response?.ok) {
    statusMessageEl.textContent = response?.error || 'Failed to start crawl.';
  }
});

stopBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'STOP_CRAWL' });
});

clearBtn.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'CLEAR_STATE' });
  if (response?.ok) {
    renderState(response.state);
  }
});

downloadJsonBtn.addEventListener('click', () => {
  if (!currentState?.spec) return;
  const jsonText = JSON.stringify(currentState.spec, null, 2);
  triggerDownload(jsonText, `${getSafeFilenameBase(currentState)}.json`, 'application/json');
  statusMessageEl.textContent = 'Downloaded OpenAPI JSON specification.';
});

downloadYamlBtn.addEventListener('click', () => {
  if (!currentState?.spec) return;
  const yamlText = `${toYaml(currentState.spec)}\n`;
  triggerDownload(yamlText, `${getSafeFilenameBase(currentState)}.yaml`, 'application/yaml');
  statusMessageEl.textContent = 'Downloaded OpenAPI YAML specification.';
});

copyJsonBtn.addEventListener('click', async () => {
  if (!currentState?.spec) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(currentState.spec, null, 2));
    statusMessageEl.textContent = 'Copied OpenAPI JSON to clipboard.';
  } catch {
    statusMessageEl.textContent = 'Clipboard write failed.';
  }
});

searchInput.addEventListener('input', renderEndpoints);

for (const chip of methodChips) {
  chip.addEventListener('click', () => {
    for (const c of methodChips) c.classList.remove('active');
    chip.classList.add('active');
    selectedMethod = chip.dataset.method || 'ALL';
    renderEndpoints();
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'CRAWL_STATE_UPDATED' && message.state) {
    renderState(message.state);
  }
});

chrome.tabs?.onActivated?.addListener(async () => {
  await refreshActiveTab();
});

chrome.tabs?.onUpdated?.addListener(async (_tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    await refreshActiveTab();
  }
});

(async () => {
  await refreshActiveTab();
  const res = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  if (res?.ok && res.state) {
    renderState(res.state);
  }
})();
