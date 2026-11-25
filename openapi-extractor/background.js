import {
  extractOpenApiFragments,
  extractLinksFromHtml,
  mergeOpenApiSpecs,
  normalizeCrawlUrl,
  isCrawlableUrl,
  suggestPathPrefix
} from './lib/extractor.js';

const STORAGE_KEY = 'crawlState';
const DEFAULT_MAX_PAGES = 200;
const DEFAULT_CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 20000;

let activeCrawl = null;

async function ensureSidePanelBehavior() {
  try {
    if (chrome.sidePanel?.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } catch (err) {
    console.warn('Failed to set sidePanel behavior:', err);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureSidePanelBehavior();
});

ensureSidePanelBehavior();

function createInitialState() {
  return {
    status: 'idle',
    startUrl: '',
    origin: '',
    pathPrefix: '/',
    pagesCrawled: 0,
    pagesQueued: 0,
    fragmentsFound: 0,
    endpoints: [],
    stats: {
      totalPaths: 0,
      totalOperations: 0,
      totalSchemas: 0,
      totalTags: 0,
      methodCounts: {}
    },
    spec: null,
    error: null,
    updatedAt: Date.now()
  };
}

async function saveAndBroadcastState(state) {
  const nextState = { ...state, updatedAt: Date.now() };
  await chrome.storage.local.set({ [STORAGE_KEY]: nextState });
  try {
    await chrome.runtime.sendMessage({ type: 'CRAWL_STATE_UPDATED', state: nextState });
  } catch {
    // Side panel may not be open; state is persisted in chrome.storage.local.
  }
  return nextState;
}

async function fetchWithTimeout(url, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      throw new DOMException('Aborted', 'AbortError');
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (
      contentType &&
      !contentType.includes('text/') &&
      !contentType.includes('json') &&
      !contentType.includes('xml') &&
      !contentType.includes('markdown')
    ) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

async function captureActiveTabSnapshot(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        title: document.title || '',
        html: document.documentElement?.outerHTML || '',
        links: Array.from(document.querySelectorAll('a[href]')).map((a) => a.href)
      })
    });
    return results?.[0]?.result || null;
  } catch {
    return null;
  }
}

async function runCrawl(options) {
  const {
    tabId,
    startUrl,
    pathPrefix,
    maxPages = DEFAULT_MAX_PAGES,
    concurrency = DEFAULT_CONCURRENCY
  } = options;

  const parsedStart = new URL(startUrl);
  const origin = parsedStart.origin;
  const effectivePrefix = pathPrefix || suggestPathPrefix(startUrl);

  const abortController = new AbortController();
  activeCrawl = {
    stopRequested: false,
    abortController
  };

  let state = {
    ...createInitialState(),
    status: 'crawling',
    startUrl,
    origin,
    pathPrefix: effectivePrefix
  };
  await saveAndBroadcastState(state);

  const visited = new Set();
  const queued = new Set();
  const queue = [];
  const fragmentEntries = [];
  let pageTitle = '';

  const enqueue = (rawUrl, baseUrl) => {
    const normalized = normalizeCrawlUrl(rawUrl, baseUrl);
    if (!normalized) return;
    if (visited.has(normalized) || queued.has(normalized)) return;
    if (visited.size + queue.length >= maxPages) return;
    if (!isCrawlableUrl(normalized, origin, effectivePrefix)) return;
    queued.add(normalized);
    queue.push(normalized);
  };

  const normalizedStart = normalizeCrawlUrl(startUrl, startUrl);
  if (normalizedStart) {
    queued.add(normalizedStart);
    queue.push(normalizedStart);
  }

  // Seed with live DOM from active tab if available (captures SPA-rendered sidebars & blocks)
  let initialSnapshot = null;
  if (typeof tabId === 'number') {
    initialSnapshot = await captureActiveTabSnapshot(tabId);
    if (initialSnapshot) {
      pageTitle = initialSnapshot.title || '';
      for (const href of initialSnapshot.links || []) {
        enqueue(href, startUrl);
      }
    }
  }

  let lastBroadcastTime = 0;

  async function processUrl(url, isSeedUrl) {
    if (activeCrawl?.stopRequested) return;

    let content = null;
    if (isSeedUrl && initialSnapshot?.html) {
      content = initialSnapshot.html;
    } else {
      content = await fetchWithTimeout(url, abortController.signal);
    }

    if (!content || activeCrawl?.stopRequested) return;

    let fragments = extractOpenApiFragments(content);

    // Fallback: try .md companion URL if HTML page yielded no OpenAPI fragments
    if (fragments.length === 0 && !url.toLowerCase().endsWith('.md')) {
      const mdUrl = url.endsWith('/') ? `${url}index.md` : `${url}.md`;
      const mdContent = await fetchWithTimeout(mdUrl, abortController.signal);
      if (mdContent) {
        fragments = extractOpenApiFragments(mdContent);
      }
    }

    for (const fragment of fragments) {
      fragmentEntries.push({ fragment, sourceUrl: url });
    }

    const discovered = extractLinksFromHtml(content, url, {
      origin,
      pathPrefix: effectivePrefix
    });
    for (const link of discovered) {
      enqueue(link, url);
    }
  }

  try {
    let isFirst = true;
    while (queue.length > 0 && visited.size < maxPages && !activeCrawl.stopRequested) {
      const batch = [];
      while (batch.length < concurrency && queue.length > 0 && visited.size + batch.length < maxPages) {
        const nextUrl = queue.shift();
        if (!visited.has(nextUrl)) {
          visited.add(nextUrl);
          batch.push({ url: nextUrl, isSeed: isFirst });
          isFirst = false;
        }
      }

      await Promise.all(batch.map((item) => processUrl(item.url, item.isSeed)));

      const now = Date.now();
      if (now - lastBroadcastTime > 250 || queue.length === 0) {
        lastBroadcastTime = now;
        const mergedPreview = mergeOpenApiSpecs(fragmentEntries, {
          title: pageTitle || `${parsedStart.hostname} API`,
          origin
        });
        state = {
          ...state,
          pagesCrawled: visited.size,
          pagesQueued: queue.length,
          fragmentsFound: fragmentEntries.length,
          endpoints: mergedPreview.endpoints,
          stats: mergedPreview.stats,
          spec: mergedPreview.spec
        };
        await saveAndBroadcastState(state);
      }
    }

    const finalMerged = mergeOpenApiSpecs(fragmentEntries, {
      title: pageTitle || `${parsedStart.hostname} API`,
      origin
    });

    state = {
      ...state,
      status: activeCrawl.stopRequested ? 'stopped' : 'complete',
      pagesCrawled: visited.size,
      pagesQueued: 0,
      fragmentsFound: fragmentEntries.length,
      endpoints: finalMerged.endpoints,
      stats: finalMerged.stats,
      spec: finalMerged.spec,
      error: null
    };
    await saveAndBroadcastState(state);
  } catch (err) {
    if (err?.name !== 'AbortError') {
      state = {
        ...state,
        status: 'error',
        error: err?.message || 'Crawl failed'
      };
      await saveAndBroadcastState(state);
    }
  } finally {
    activeCrawl = null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === 'GET_STATE') {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        sendResponse({ ok: true, state: stored[STORAGE_KEY] || createInitialState() });
        return;
      }

      if (message?.type === 'CLEAR_STATE') {
        if (activeCrawl) {
          activeCrawl.stopRequested = true;
          activeCrawl.abortController.abort();
        }
        const empty = await saveAndBroadcastState(createInitialState());
        sendResponse({ ok: true, state: empty });
        return;
      }

      if (message?.type === 'STOP_CRAWL') {
        if (activeCrawl) {
          activeCrawl.stopRequested = true;
          activeCrawl.abortController.abort();
        }
        sendResponse({ ok: true });
        return;
      }

      if (message?.type === 'START_CRAWL') {
        if (activeCrawl) {
          activeCrawl.stopRequested = true;
          activeCrawl.abortController.abort();
        }

        let targetUrl = message.startUrl;
        let targetTabId = message.tabId;

        if (!targetUrl) {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          targetUrl = activeTab?.url || '';
          targetTabId = activeTab?.id;
        }

        if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
          sendResponse({ ok: false, error: 'Open an http:// or https:// API documentation page first.' });
          return;
        }

        // Launch crawl asynchronously so sendResponse returns immediately
        runCrawl({
          tabId: targetTabId,
          startUrl: targetUrl,
          pathPrefix: message.pathPrefix,
          maxPages: Number(message.maxPages) || DEFAULT_MAX_PAGES,
          concurrency: Number(message.concurrency) || DEFAULT_CONCURRENCY
        });

        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: 'Unknown message type' });
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || 'Unexpected error' });
    }
  })();
  return true;
});
