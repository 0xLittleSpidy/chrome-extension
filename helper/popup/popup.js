/**
 * Popup Script for Helper Extension.
 * Manages whitelist toggle, active site feature switches, and settings shortcut.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const siteStatusBadge = document.getElementById('site-status-badge');
  const siteStatusText = document.getElementById('site-status-text');
  const currentSiteHost = document.getElementById('current-site-host');
  const toggleCurrentSiteBtn = document.getElementById('toggle-current-site-btn');
  const toggleCurrentSiteLabel = document.getElementById('toggle-current-site-label');
  const activeSiteSwitches = document.getElementById('active-site-switches');
  const toggleSiteReplacer = document.getElementById('toggle-site-replacer');
  const toggleSiteStorage = document.getElementById('toggle-site-storage');
  const toggleSiteShortcuts = document.getElementById('toggle-site-shortcuts');
  const toggleSiteTransform = document.getElementById('toggle-site-transform');
  const toggleSiteUnwantedHeaders = document.getElementById('toggle-site-unwanted-headers');
  const openSettingsBtn = document.getElementById('open-settings-btn');
  const addFeedback = document.getElementById('add-feedback');

  let currentTabUrl = '';
  let currentSiteId = '';
  let currentAllowlist = [];
  let isScriptable = false;

  // 1. Get current tab information
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.url) {
      currentTabUrl = activeTab.url;
      currentSiteId = AllowlistUtils.getSiteIdentifier(currentTabUrl);
      currentSiteHost.textContent = currentSiteId || 'Non-web page (e.g. chrome://)';

      isScriptable = currentTabUrl.startsWith('http://') ||
                     currentTabUrl.startsWith('https://') ||
                     currentTabUrl.startsWith('file://');

      if (!isScriptable) {
        toggleCurrentSiteBtn.disabled = true;
        toggleCurrentSiteLabel.textContent = 'Unavailable on this page';
      } else {
        toggleCurrentSiteBtn.disabled = false;
      }
    } else {
      currentSiteHost.textContent = 'No active tab';
      toggleCurrentSiteBtn.disabled = true;
    }
  } catch (err) {
    currentSiteHost.textContent = 'Error detecting page';
    toggleCurrentSiteBtn.disabled = true;
  }

  // 2. Open full settings hub
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  function showFeedback(msg, type = 'success') {
    if (!addFeedback) return;
    addFeedback.textContent = msg;
    addFeedback.className = `feedback-msg feedback-${type}`;
    setTimeout(() => {
      if (addFeedback.textContent === msg) {
        addFeedback.textContent = '';
      }
    }, 2800);
  }

  function triggerSyncPulse() {
    // Notify active tabs of setting update
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SETTINGS_UPDATED' }).catch(() => {});
      }
    });
  }

  // 3. Render main view
  async function render() {
    if (!isScriptable) {
      toggleCurrentSiteBtn.disabled = true;
      toggleCurrentSiteLabel.textContent = 'Unavailable on this page';
      siteStatusBadge.className = 'status-badge badge-inactive';
      siteStatusText.textContent = 'Unavailable';
      if (activeSiteSwitches) activeSiteSwitches.style.display = 'none';
      return;
    }

    const isCurrentAllowed = currentTabUrl && AllowlistUtils.isUrlAllowed(currentTabUrl, currentAllowlist);
    const matchedPattern = isCurrentAllowed ? AllowlistUtils.getMatchingPattern(currentTabUrl, currentAllowlist) : null;
    const siteKey = matchedPattern || currentSiteId;

    if (isCurrentAllowed) {
      toggleCurrentSiteBtn.disabled = false;
      toggleCurrentSiteBtn.className = 'btn btn-danger';
      toggleCurrentSiteLabel.textContent = 'Remove from Whitelist';

      const [isReplacerOn, isStorageOn, isShortcutsOn, isTransformOn, isUnwantedHeadersOn] = await Promise.all([
        StorageManager.getSiteReplacerEnabled(siteKey),
        StorageManager.getSiteStorageEnabled(siteKey),
        StorageManager.getSiteShortcutsEnabled(siteKey),
        StorageManager.getSiteTransformEnabled(siteKey),
        StorageManager.getSiteUnwantedHeadersEnabled(siteKey)
      ]);

      const isAnyActive = isReplacerOn || isStorageOn || isShortcutsOn || isTransformOn || isUnwantedHeadersOn;

      if (isAnyActive) {
        siteStatusBadge.className = 'status-badge badge-active';
        siteStatusText.textContent = 'Active on this site';
      } else {
        siteStatusBadge.className = 'status-badge badge-inactive';
        siteStatusText.textContent = 'All features paused';
      }

      if (activeSiteSwitches) {
        activeSiteSwitches.style.display = 'flex';
        if (toggleSiteReplacer) toggleSiteReplacer.checked = isReplacerOn;
        if (toggleSiteStorage) toggleSiteStorage.checked = isStorageOn;
        if (toggleSiteShortcuts) toggleSiteShortcuts.checked = isShortcutsOn;
        if (toggleSiteTransform) toggleSiteTransform.checked = isTransformOn;
        if (toggleSiteUnwantedHeaders) toggleSiteUnwantedHeaders.checked = isUnwantedHeadersOn;
      }
    } else {
      toggleCurrentSiteBtn.disabled = false;
      toggleCurrentSiteBtn.className = 'btn btn-primary';
      toggleCurrentSiteLabel.textContent = 'Add to Whitelist';

      siteStatusBadge.className = 'status-badge badge-inactive';
      siteStatusText.textContent = 'Inactive on this site';

      if (activeSiteSwitches) {
        activeSiteSwitches.style.display = 'none';
      }
    }
  }

  // 4. Toggle current site in whitelist
  toggleCurrentSiteBtn.addEventListener('click', async () => {
    if (!currentTabUrl || !isScriptable) return;

    const isCurrentAllowed = AllowlistUtils.isUrlAllowed(currentTabUrl, currentAllowlist);

    if (isCurrentAllowed) {
      currentAllowlist = currentAllowlist.filter(p => !AllowlistUtils.matchUrlWithPattern(currentTabUrl, p));
      await StorageManager.setAllowlist(currentAllowlist);
      triggerSyncPulse();
      showFeedback('Removed from whitelist', 'success');
    } else {
      const entryToAdd = AllowlistUtils.normalizePattern(currentTabUrl) || currentSiteId;
      if (!currentAllowlist.includes(entryToAdd)) {
        currentAllowlist.push(entryToAdd);
        await StorageManager.setAllowlist(currentAllowlist);
        triggerSyncPulse();
        showFeedback('Added to whitelist', 'success');
      }
    }
    await render();
  });

  function getSiteKey() {
    const matchedPattern = currentTabUrl ? AllowlistUtils.getMatchingPattern(currentTabUrl, currentAllowlist) : null;
    return matchedPattern || currentSiteId;
  }

  // 5. Active site switch event listeners
  if (toggleSiteReplacer) {
    toggleSiteReplacer.addEventListener('change', async () => {
      const siteKey = getSiteKey();
      if (!siteKey) return;
      const isChecked = toggleSiteReplacer.checked;
      await StorageManager.setSiteReplacerEnabled(siteKey, isChecked);
      triggerSyncPulse();
      showFeedback(isChecked ? 'Replacer enabled on this site' : 'Replacer paused on this site');
      await render();
    });
  }

  if (toggleSiteStorage) {
    toggleSiteStorage.addEventListener('change', async () => {
      const siteKey = getSiteKey();
      if (!siteKey) return;
      const isChecked = toggleSiteStorage.checked;
      await StorageManager.setSiteStorageEnabled(siteKey, isChecked);
      triggerSyncPulse();
      showFeedback(isChecked ? 'Storage enabled on this site' : 'Storage paused on this site');
      await render();
    });
  }

  if (toggleSiteShortcuts) {
    toggleSiteShortcuts.addEventListener('change', async () => {
      const siteKey = getSiteKey();
      if (!siteKey) return;
      const isChecked = toggleSiteShortcuts.checked;
      await StorageManager.setSiteShortcutsEnabled(siteKey, isChecked);
      triggerSyncPulse();
      showFeedback(isChecked ? 'Shortcuts enabled on this site' : 'Shortcuts paused on this site');
      await render();
    });
  }

  if (toggleSiteTransform) {
    toggleSiteTransform.addEventListener('change', async () => {
      const siteKey = getSiteKey();
      if (!siteKey) return;
      const isChecked = toggleSiteTransform.checked;
      await StorageManager.setSiteTransformEnabled(siteKey, isChecked);
      triggerSyncPulse();
      showFeedback(isChecked ? 'Transform enabled on this site' : 'Transform paused on this site');
      await render();
    });
  }

  if (toggleSiteUnwantedHeaders) {
    toggleSiteUnwantedHeaders.addEventListener('change', async () => {
      const siteKey = getSiteKey();
      if (!siteKey) return;
      const isChecked = toggleSiteUnwantedHeaders.checked;
      await StorageManager.setSiteUnwantedHeadersEnabled(siteKey, isChecked);
      triggerSyncPulse();
      showFeedback(isChecked ? 'Unwanted Headers enabled on this site' : 'Unwanted Headers paused on this site');
      await render();
    });
  }

  // 6. Listen for storage changes from background or settings
  chrome.storage.onChanged.addListener(async (changes) => {
    if (changes.allowlist || changes.site_replacer_state || changes.site_storage_state || changes.site_shortcuts_state || changes.site_transform_state || changes.site_unwanted_headers_state) {
      triggerSyncPulse();
      currentAllowlist = await StorageManager.getAllowlist();
      await render();
    }
  });

  // Initial load
  currentAllowlist = await StorageManager.getAllowlist();
  await render();
});
