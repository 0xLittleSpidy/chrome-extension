/**
 * Popup Script for Helper Extension.
 * Manages whitelist toggle, active site replacer/storage switches, quick snippets copy, and settings shortcut.
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
  const openSettingsBtn = document.getElementById('open-settings-btn');
  const addFeedback = document.getElementById('add-feedback');
  const popupSnippetsCount = document.getElementById('popup-snippets-count');
  const popupSnippetsList = document.getElementById('popup-snippets-list');
  const popupSnippetsEmpty = document.getElementById('popup-snippets-empty');

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

  // 3. Render Quick Snippets
  async function renderSnippets() {
    if (!popupSnippetsList) return;
    const snippets = await StorageManager.getSnippets();

    if (popupSnippetsCount) {
      popupSnippetsCount.textContent = snippets.length;
    }

    popupSnippetsList.innerHTML = '';
    if (!snippets || snippets.length === 0) {
      if (popupSnippetsEmpty) popupSnippetsEmpty.style.display = 'block';
    } else {
      if (popupSnippetsEmpty) popupSnippetsEmpty.style.display = 'none';

      snippets.forEach((snippet) => {
        const row = document.createElement('div');
        row.className = 'popup-snippet-row';

        const heading = document.createElement('span');
        heading.className = 'popup-snippet-heading';
        heading.textContent = snippet.heading;
        heading.title = snippet.description;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-copy-sm';
        copyBtn.textContent = 'Copy';
        copyBtn.setAttribute('aria-label', `Copy ${snippet.heading}`);

        copyBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(snippet.description);
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('btn-copied');
            showFeedback(`Copied "${snippet.heading}" to clipboard`);
            setTimeout(() => {
              copyBtn.textContent = 'Copy';
              copyBtn.classList.remove('btn-copied');
            }, 1800);
          } catch (err) {
            showFeedback('Failed to copy to clipboard', 'error');
          }
        });

        row.appendChild(heading);
        row.appendChild(copyBtn);
        popupSnippetsList.appendChild(row);
      });
    }
  }

  // 4. Render main view
  async function render() {
    if (!isScriptable) {
      toggleCurrentSiteBtn.disabled = true;
      toggleCurrentSiteLabel.textContent = 'Unavailable on this page';
      siteStatusBadge.className = 'status-badge badge-inactive';
      siteStatusText.textContent = 'Unavailable';
      if (activeSiteSwitches) activeSiteSwitches.style.display = 'none';
      await renderSnippets();
      return;
    }

    const isCurrentAllowed = currentTabUrl && AllowlistUtils.isUrlAllowed(currentTabUrl, currentAllowlist);

    if (isCurrentAllowed) {
      toggleCurrentSiteBtn.disabled = false;
      toggleCurrentSiteBtn.className = 'btn btn-danger';
      toggleCurrentSiteLabel.textContent = 'Remove from Whitelist';

      const isReplacerOn = await StorageManager.getSiteReplacerEnabled(currentSiteId);
      const isStorageOn = await StorageManager.getSiteStorageEnabled(currentSiteId);

      // Multi-switch status display
      if (isReplacerOn && isStorageOn) {
        siteStatusBadge.className = 'status-badge badge-active';
        siteStatusText.textContent = 'Active on this site';
      } else if (!isReplacerOn && !isStorageOn) {
        siteStatusBadge.className = 'status-badge badge-inactive';
        siteStatusText.textContent = 'All features paused';
      } else if (!isReplacerOn) {
        siteStatusBadge.className = 'status-badge badge-inactive';
        siteStatusText.textContent = 'Replacer paused';
      } else {
        siteStatusBadge.className = 'status-badge badge-inactive';
        siteStatusText.textContent = 'Storage paused';
      }

      if (activeSiteSwitches) {
        activeSiteSwitches.style.display = 'flex';
        toggleSiteReplacer.checked = isReplacerOn;
        toggleSiteStorage.checked = isStorageOn;
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

    await renderSnippets();
  }

  // 5. Toggle current site in whitelist
  toggleCurrentSiteBtn.addEventListener('click', async () => {
    if (!currentSiteId || !isScriptable) return;

    const isCurrentAllowed = AllowlistUtils.isUrlAllowed(currentTabUrl, currentAllowlist);

    if (isCurrentAllowed) {
      currentAllowlist = currentAllowlist.filter(p => !AllowlistUtils.matchUrlWithPattern(currentTabUrl, p));
      await StorageManager.setAllowlist(currentAllowlist);
      showFeedback(`Removed ${currentSiteId}`, 'success');
    } else {
      if (!currentAllowlist.includes(currentSiteId)) {
        currentAllowlist.push(currentSiteId);
        await StorageManager.setAllowlist(currentAllowlist);
        showFeedback(`Added ${currentSiteId} to whitelist`, 'success');
      }
    }
    await render();
  });

  // 6. Active site replacer switch change handler
  if (toggleSiteReplacer) {
    toggleSiteReplacer.addEventListener('change', async () => {
      if (!currentSiteId) return;
      const isChecked = toggleSiteReplacer.checked;
      await StorageManager.setSiteReplacerEnabled(currentSiteId, isChecked);
      showFeedback(isChecked ? 'Replacer enabled on this site' : 'Replacer paused on this site');
      await render();
    });
  }

  // 7. Active site storage switch change handler
  if (toggleSiteStorage) {
    toggleSiteStorage.addEventListener('change', async () => {
      if (!currentSiteId) return;
      const isChecked = toggleSiteStorage.checked;
      await StorageManager.setSiteStorageEnabled(currentSiteId, isChecked);
      showFeedback(isChecked ? 'Storage enabled on this site' : 'Storage paused on this site');
      await render();
    });
  }

  // 8. Listen for storage changes from background or settings
  chrome.storage.onChanged.addListener(async (changes) => {
    if (changes.allowlist || changes.site_replacer_state || changes.site_storage_state || changes.snippets) {
      currentAllowlist = await StorageManager.getAllowlist();
      await render();
    }
  });

  // Initial load
  currentAllowlist = await StorageManager.getAllowlist();
  await render();
});
