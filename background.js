/**
 * Background Service Worker (Manifest V3)
 * Manages extension state, context menus, offscreen clipboard, and communication.
 */
importScripts('lib/allowlist-utils.js', 'lib/storage-manager.js');

const BADGE_COLOR_ACTIVE = '#16a34a'; // Green
const BADGE_COLOR_PAUSED = '#d97706'; // Amber

const CONTEXT_MENU_ROOT_ID = 'helper-saved-snippets-root';
const CONTEXT_MENU_EMPTY_ID = 'helper-no-snippets';
const CONTEXT_MENU_SNIPPET_PREFIX = 'helper-snip-';

// Initialize storage defaults on installation
chrome.runtime.onInstalled.addListener(async () => {
  await StorageManager.initializeDefaults();
  await rebuildContextMenus();
});

chrome.runtime.onStartup.addListener(async () => {
  await rebuildContextMenus();
});

/**
 * Rebuilds context menu items dynamically based on saved snippets.
 */
async function rebuildContextMenus() {
  if (!chrome.contextMenus) return;

  chrome.contextMenus.removeAll(async () => {
    try {
      chrome.contextMenus.create({
        id: CONTEXT_MENU_ROOT_ID,
        title: 'Saved Snippets',
        contexts: ['all']
      });

      const snippets = await StorageManager.getSnippets();

      if (!snippets || snippets.length === 0) {
        chrome.contextMenus.create({
          id: CONTEXT_MENU_EMPTY_ID,
          parentId: CONTEXT_MENU_ROOT_ID,
          title: 'No saved snippets (Click to open Settings)',
          contexts: ['all']
        });
      } else {
        snippets.forEach((item) => {
          chrome.contextMenus.create({
            id: `${CONTEXT_MENU_SNIPPET_PREFIX}${item.id}`,
            parentId: CONTEXT_MENU_ROOT_ID,
            title: item.heading || 'Untitled Snippet',
            contexts: ['all']
          });
        });
      }
    } catch (err) {
      console.warn('[Helper] Failed to rebuild context menus:', err);
    }
  });
}

/**
 * Ensures offscreen document is open and copies text to clipboard.
 */
async function copyToClipboard(text) {
  if (!chrome.offscreen) {
    throw new Error('Offscreen API unavailable');
  }

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Copy saved snippet text to clipboard'
    });
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'COPY_TO_CLIPBOARD', text: text },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response && response.success) {
          resolve(true);
        } else {
          reject(new Error(response ? response.error : 'Unknown copy error'));
        }
      }
    );
  });
}

/**
 * Sends a notification or visual confirmation to the user upon copy.
 */
async function notifyUser(title, message) {
  if (chrome.notifications && chrome.notifications.create) {
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-48.png',
        title: title,
        message: message,
        priority: 1
      });
      return;
    } catch (err) {
      // Ignore notification creation error
    }
  }
}

// Handle context menu clicks
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === CONTEXT_MENU_EMPTY_ID) {
      chrome.runtime.openOptionsPage();
      return;
    }

    if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith(CONTEXT_MENU_SNIPPET_PREFIX)) {
      const snippetId = info.menuItemId.substring(CONTEXT_MENU_SNIPPET_PREFIX.length);

      // Check if Active Site Storage Switch is enabled for this domain
      if (tab && tab.url) {
        const domain = AllowlistUtils.getSiteIdentifier(tab.url);
        const storageEnabled = await StorageManager.getSiteStorageEnabled(domain);
        if (!storageEnabled) {
          await notifyUser(
            'Helper: Storage Paused',
            `Snippet storage is temporarily paused on ${domain}. Enable it in the Helper popup.`
          );
          return;
        }
      }

      const snippets = await StorageManager.getSnippets();
      const snippet = snippets.find((s) => s.id === snippetId);

      if (!snippet) {
        await notifyUser('Helper', 'Snippet not found');
        return;
      }

      try {
        await copyToClipboard(snippet.description);
        await notifyUser('Helper: Snippet Copied', `"${snippet.heading}" copied to clipboard.`);
      } catch (err) {
        await notifyUser('Helper: Copy Error', 'Failed to copy snippet to clipboard.');
      }
    }
  });
}

/**
 * Updates action badge for a tab according to whether its URL is allowlisted
 * and whether Replacer switch is enabled.
 */
async function updateBadgeForTab(tabId, url) {
  if (!tabId || !url) return;

  try {
    const allowlist = await StorageManager.getAllowlist();
    const isAllowed = AllowlistUtils.isUrlAllowed(url, allowlist);

    if (isAllowed) {
      const domain = AllowlistUtils.getSiteIdentifier(url);
      const isReplacerOn = await StorageManager.getSiteReplacerEnabled(domain);

      if (isReplacerOn) {
        await chrome.action.setBadgeText({ tabId, text: 'ON' });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR_ACTIVE });
        await chrome.action.setTitle({
          tabId,
          title: 'Helper: Active on this site'
        });
      } else {
        await chrome.action.setBadgeText({ tabId, text: 'PAUSE' });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR_PAUSED });
        await chrome.action.setTitle({
          tabId,
          title: 'Helper: Replacer paused on this site'
        });
      }
    } else {
      await chrome.action.setBadgeText({ tabId, text: '' });
      await chrome.action.setTitle({
        tabId,
        title: 'Helper: Inactive (Site not in whitelist)'
      });
    }
  } catch (err) {
    // Tab might have closed or not scriptable
  }
}

// Update badge when tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    await updateBadgeForTab(tabId, tab.url);
  }
});

// Update badge when active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      await updateBadgeForTab(tab.id, tab.url);
    }
  } catch (err) {
    // Ignore error if tab no longer exists
  }
});

// Update tabs and menus when storage changes
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.allowlist || changes.site_replacer_state) {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id && tab.url) {
          await updateBadgeForTab(tab.id, tab.url);
        }
      }
    } catch (err) {
      // Ignore
    }
  }

  if (changes.snippets) {
    await rebuildContextMenus();
  }
});
