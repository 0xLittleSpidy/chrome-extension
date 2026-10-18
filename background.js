/**
 * Background Service Worker (Manifest V3)
 * Manages extension state, badges, and communication.
 */
importScripts('lib/allowlist-utils.js');

const BADGE_COLOR_ACTIVE = '#16a34a'; // Green

// Initialize storage defaults on installation
chrome.runtime.onInstalled.addListener(async (details) => {
  const data = await chrome.storage.sync.get(['allowlist']);
  if (!data.allowlist) {
    // Default is empty allowlist as required:
    // "The extension must scan text fields only on allowlisted websites, not on every website by default."
    await chrome.storage.sync.set({ allowlist: [] });
  }
});

/**
 * Updates action badge for a tab according to whether its URL is in the allowlist.
 */
async function updateBadgeForTab(tabId, url) {
  if (!tabId || !url) return;

  try {
    const { allowlist = [] } = await chrome.storage.sync.get(['allowlist']);
    const isAllowed = AllowlistUtils.isUrlAllowed(url, allowlist);

    if (isAllowed) {
      await chrome.action.setBadgeText({ tabId, text: 'ON' });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR_ACTIVE });
      await chrome.action.setTitle({
        tabId,
        title: 'Is & Are Replacer: Active on this site'
      });
    } else {
      await chrome.action.setBadgeText({ tabId, text: '' });
      await chrome.action.setTitle({
        tabId,
        title: 'Is & Are Replacer: Inactive (Site not allowlisted)'
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

// Update all active tabs when allowlist changes in storage
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'sync' && changes.allowlist) {
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
});
