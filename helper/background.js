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

let isRebuildingContextMenus = false;
let queuedRebuild = false;

// Initialize storage defaults on installation
chrome.runtime.onInstalled.addListener(async () => {
  await StorageManager.initializeDefaults();
  await rebuildContextMenus();
});

chrome.runtime.onStartup.addListener(async () => {
  await rebuildContextMenus();
});

/**
 * Safely creates a context menu item checking runtime.lastError to avoid uncaught warnings.
 */
function safeCreateMenu(options) {
  return new Promise((resolve) => {
    chrome.contextMenus.create(options, () => {
      if (chrome.runtime.lastError) {
        // Handled: reading lastError prevents "Unchecked runtime.lastError" warnings in Chrome
      }
      resolve();
    });
  });
}

/**
 * Rebuilds context menu items dynamically based on saved snippets.
 * Serialized with an async mutex queue to prevent overlapping duplicate creations.
 */
async function rebuildContextMenus() {
  if (!chrome.contextMenus) return;

  if (isRebuildingContextMenus) {
    queuedRebuild = true;
    return;
  }
  isRebuildingContextMenus = true;

  try {
    await new Promise((resolve) => {
      chrome.contextMenus.removeAll(() => {
        if (chrome.runtime.lastError) {
          // Handled: reading lastError prevents "Unchecked runtime.lastError" warnings in Chrome
        }
        resolve();
      });
    });

    await safeCreateMenu({
      id: CONTEXT_MENU_ROOT_ID,
      title: 'Saved Snippets',
      contexts: ['all']
    });

    const snippets = await StorageManager.getSnippets();

    if (!snippets || snippets.length === 0) {
      await safeCreateMenu({
        id: CONTEXT_MENU_EMPTY_ID,
        parentId: CONTEXT_MENU_ROOT_ID,
        title: 'No saved snippets (Click to open Settings)',
        contexts: ['all']
      });
      return;
    }

    // Group snippets by Category
    const categoriesMap = new Map();
    snippets.forEach(item => {
      const cat = item.category || 'General';
      if (!categoriesMap.has(cat)) {
        categoriesMap.set(cat, []);
      }
      categoriesMap.get(cat).push(item);
    });

    const useCategorySubmenus = categoriesMap.size > 1;

    for (const [catName, catSnippets] of categoriesMap.entries()) {
      let parentMenuId = CONTEXT_MENU_ROOT_ID;

      if (useCategorySubmenus) {
        const catMenuId = `helper-cat-${catName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        await safeCreateMenu({
          id: catMenuId,
          parentId: CONTEXT_MENU_ROOT_ID,
          title: catName,
          contexts: ['all']
        });
        parentMenuId = catMenuId;
      }

      for (const item of catSnippets) {
        const answers = Array.isArray(item.answers) && item.answers.length > 0
          ? item.answers
          : [item.description || ''];

        if (answers.length > 1) {
          // Parent menu for snippet with multiple answers
          const snipParentId = `${CONTEXT_MENU_SNIPPET_PREFIX}${item.id}`;
          await safeCreateMenu({
            id: snipParentId,
            parentId: parentMenuId,
            title: `${item.heading || 'Untitled Snippet'} (${answers.length})`,
            contexts: ['all']
          });

          // Sub-menu for each answer
          for (let idx = 0; idx < answers.length; idx++) {
            const answerText = answers[idx];
            const preview = answerText.replace(/\s+/g, ' ').trim().slice(0, 36);
            await safeCreateMenu({
              id: `${CONTEXT_MENU_SNIPPET_PREFIX}${item.id}_ans_${idx}`,
              parentId: snipParentId,
              title: `${idx + 1}. ${preview}${answerText.length > 36 ? '...' : ''}`,
              contexts: ['all']
            });
          }
        } else {
          // Single answer item
          await safeCreateMenu({
            id: `${CONTEXT_MENU_SNIPPET_PREFIX}${item.id}`,
            parentId: parentMenuId,
            title: `${item.heading || 'Untitled Snippet'}`,
            contexts: ['all']
          });
        }
      }
    }
  } catch (err) {
    console.warn('[Helper] Failed to rebuild context menus:', err);
  } finally {
    isRebuildingContextMenus = false;
    if (queuedRebuild) {
      queuedRebuild = false;
      rebuildContextMenus();
    }
  }
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
      const fullSnippetKey = info.menuItemId.substring(CONTEXT_MENU_SNIPPET_PREFIX.length);
      const parts = fullSnippetKey.split('_ans_');
      const snippetId = parts[0];
      const answerIndex = parts.length > 1 ? parseInt(parts[1], 10) : -1;

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

      const answers = Array.isArray(snippet.answers) && snippet.answers.length > 0
        ? snippet.answers
        : [snippet.description || ''];

      let textToPaste = snippet.description;
      let optionLabel = snippet.heading;
      if (answerIndex >= 0 && answerIndex < answers.length) {
        textToPaste = answers[answerIndex];
        optionLabel = `${snippet.heading} (${answerIndex + 1})`;
      } else if (answers[0]) {
        textToPaste = answers[0];
      }

      // Try pasting directly into active/focused field in tab
      if (tab && tab.id) {
        try {
          chrome.tabs.sendMessage(tab.id, {
            type: 'PASTE_SNIPPET',
            text: textToPaste
          }, () => {
            if (chrome.runtime.lastError) {
              // Non-scriptable page or content script inactive
            }
          });
        } catch (e) {
          // Ignore
        }
      }

      try {
        await copyToClipboard(textToPaste);
        await notifyUser('Helper: Snippet Ready', `"${optionLabel}" ready.`);
      } catch (err) {
        await notifyUser('Helper: Copy Error', 'Failed to copy snippet to clipboard.');
      }
    }
  });
}

/**
 * Updates action badge for a tab according to whether its URL is allowlisted,
 * not blacklisted, and whether Replacer switch is enabled.
 */
async function updateBadgeForTab(tabId, url) {
  if (!tabId || !url) return;

  try {
    const [allowlist, blacklist] = await Promise.all([
      StorageManager.getAllowlist(),
      StorageManager.getBlacklist()
    ]);

    // Check if blacklisted first (blacklist overrides allowlist)
    if (AllowlistUtils.isUrlBlacklisted(url, blacklist)) {
      await chrome.action.setBadgeText({ tabId, text: '' });
      await chrome.action.setTitle({
        tabId,
        title: 'Helper: Inactive (Path is blacklisted)'
      });
      return;
    }

    const isAllowed = AllowlistUtils.isUrlAllowed(url, allowlist);

    if (isAllowed) {
      const matchedPattern = AllowlistUtils.getMatchingPattern(url, allowlist);
      const siteKey = matchedPattern || AllowlistUtils.getSiteIdentifier(url);
      const isReplacerOn = await StorageManager.getSiteReplacerEnabled(siteKey);
      const isStorageOn = await StorageManager.getSiteStorageEnabled(siteKey);

      if (isReplacerOn || isStorageOn) {
        // At least one function is active on this site: badge must show ON
        await chrome.action.setBadgeText({ tabId, text: 'ON' });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR_ACTIVE });

        let titleText = 'Helper: Active on this site';
        if (!isReplacerOn && isStorageOn) {
          titleText = 'Helper: Active (Replacer paused, Snippets enabled)';
        } else if (isReplacerOn && !isStorageOn) {
          titleText = 'Helper: Active (Storage paused, Replacer enabled)';
        }
        await chrome.action.setTitle({
          tabId,
          title: titleText
        });
      } else {
        // ONLY when all functions on the site are paused
        await chrome.action.setBadgeText({ tabId, text: 'PAUSE' });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR_PAUSED });
        await chrome.action.setTitle({
          tabId,
          title: 'Helper: All features paused on this site'
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
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (changes.allowlist || changes.blacklist || changes.site_replacer_state || changes.site_storage_state) {
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

  if (changes.snippets || changes.categories) {
    if (changes.snippets && areaName === 'sync' && Array.isArray(changes.snippets.newValue)) {
      try {
        await chrome.storage.local.set({ snippets: changes.snippets.newValue });
      } catch (err) {
        // Ignore
      }
    }
    await rebuildContextMenus();
  }
});
