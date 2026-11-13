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
  const toggleBlacklistBtn = document.getElementById('toggle-blacklist-btn');
  const toggleBlacklistLabel = document.getElementById('toggle-blacklist-label');
  const activeSiteSwitches = document.getElementById('active-site-switches');
  const toggleSiteReplacer = document.getElementById('toggle-site-replacer');
  const toggleSiteStorage = document.getElementById('toggle-site-storage');
  const toggleSiteShortcuts = document.getElementById('toggle-site-shortcuts');
  const openSettingsBtn = document.getElementById('open-settings-btn');
  const addFeedback = document.getElementById('add-feedback');
  const popupSnippetsCount = document.getElementById('popup-snippets-count');
  const popupSnippetsList = document.getElementById('popup-snippets-list');
  const popupSnippetsEmpty = document.getElementById('popup-snippets-empty');
  const popupCategoryFilter = document.getElementById('popup-category-filter');

  let currentTabUrl = '';
  let currentSiteId = '';
  let currentAllowlist = [];
  let currentBlacklist = [];
  let selectedCategory = 'all';
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
    const [allSnippets, categories] = await Promise.all([
      StorageManager.getSnippets(),
      StorageManager.getCategories()
    ]);

    // Setup category filter if multiple categories exist
    if (popupCategoryFilter && categories && categories.length > 1) {
      popupCategoryFilter.style.display = 'block';
      const prevVal = popupCategoryFilter.value || 'all';
      popupCategoryFilter.innerHTML = '<option value="all">All Categories</option>';
      categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        if (cat === selectedCategory) opt.selected = true;
        popupCategoryFilter.appendChild(opt);
      });
      popupCategoryFilter.onchange = () => {
        selectedCategory = popupCategoryFilter.value;
        renderSnippets();
      };
    } else if (popupCategoryFilter) {
      popupCategoryFilter.style.display = 'none';
    }

    const snippets = (selectedCategory && selectedCategory !== 'all')
      ? allSnippets.filter(s => (s.category || 'General') === selectedCategory)
      : allSnippets;

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

        const infoCol = document.createElement('div');
        infoCol.className = 'popup-snippet-info';

        const heading = document.createElement('span');
        heading.className = 'popup-snippet-heading';
        heading.textContent = snippet.heading;
        heading.title = snippet.description;
        infoCol.appendChild(heading);

        const answers = Array.isArray(snippet.answers) && snippet.answers.length > 0
          ? snippet.answers
          : [snippet.description || ''];

        let selectedAnswer = answers[0] || '';

        const actionCol = document.createElement('div');
        actionCol.className = 'popup-snippet-actions';

        if (answers.length > 1) {
          const select = document.createElement('select');
          select.className = 'popup-snippet-select';
          select.setAttribute('aria-label', `Select answer for ${snippet.heading}`);
          answers.forEach((ans, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            const preview = ans.replace(/\s+/g, ' ').trim().slice(0, 24);
            opt.textContent = `${idx + 1}. ${preview}${ans.length > 24 ? '...' : ''}`;
            select.appendChild(opt);
          });

          select.addEventListener('change', () => {
            const chosenIdx = parseInt(select.value, 10);
            selectedAnswer = answers[chosenIdx] || answers[0];
          });
          actionCol.appendChild(select);
        }

        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-copy-sm';
        copyBtn.textContent = 'Copy';
        copyBtn.setAttribute('aria-label', `Copy ${snippet.heading}`);

        copyBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(selectedAnswer);
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

        actionCol.appendChild(copyBtn);
        row.appendChild(infoCol);
        row.appendChild(actionCol);
        popupSnippetsList.appendChild(row);
      });
    }
  }

  // 4. Render main view
  async function render() {
    if (!isScriptable) {
      toggleCurrentSiteBtn.disabled = true;
      toggleCurrentSiteLabel.textContent = 'Unavailable on this page';
      if (toggleBlacklistBtn) toggleBlacklistBtn.disabled = true;
      siteStatusBadge.className = 'status-badge badge-inactive';
      siteStatusText.textContent = 'Unavailable';
      if (activeSiteSwitches) activeSiteSwitches.style.display = 'none';
      await renderSnippets();
      return;
    }

    if (toggleBlacklistBtn) toggleBlacklistBtn.disabled = false;

    const isCurrentBlacklisted = currentTabUrl && AllowlistUtils.isUrlBlacklisted(currentTabUrl, currentBlacklist);

    if (isCurrentBlacklisted) {
      if (toggleBlacklistBtn) {
        toggleBlacklistBtn.className = 'btn btn-danger';
        toggleBlacklistLabel.textContent = 'Remove from Blacklist';
      }
      siteStatusBadge.className = 'status-badge badge-inactive';
      siteStatusText.textContent = 'Blacklisted (Path)';
    } else {
      if (toggleBlacklistBtn) {
        toggleBlacklistBtn.className = 'btn btn-secondary';
        toggleBlacklistLabel.textContent = 'Blacklist Path';
      }
    }

    const isCurrentAllowed = currentTabUrl && AllowlistUtils.isUrlAllowed(currentTabUrl, currentAllowlist);
    const matchedPattern = isCurrentAllowed ? AllowlistUtils.getMatchingPattern(currentTabUrl, currentAllowlist) : null;
    const siteKey = matchedPattern || currentSiteId;

    if (isCurrentAllowed) {
      toggleCurrentSiteBtn.disabled = false;
      toggleCurrentSiteBtn.className = 'btn btn-danger';
      toggleCurrentSiteLabel.textContent = 'Remove from Whitelist';

      const isReplacerOn = await StorageManager.getSiteReplacerEnabled(siteKey);
      const isStorageOn = await StorageManager.getSiteStorageEnabled(siteKey);
      const isShortcutsOn = await StorageManager.getSiteShortcutsEnabled(siteKey);

      if (!isCurrentBlacklisted) {
        if (isReplacerOn && isStorageOn) {
          siteStatusBadge.className = 'status-badge badge-active';
          siteStatusText.textContent = 'Active on this site';
        } else if (!isReplacerOn && !isStorageOn) {
          siteStatusBadge.className = 'status-badge badge-inactive';
          siteStatusText.textContent = 'All features paused';
        } else if (!isReplacerOn) {
          siteStatusBadge.className = 'status-badge badge-active';
          siteStatusText.textContent = 'Active (Replacer paused)';
        } else {
          siteStatusBadge.className = 'status-badge badge-active';
          siteStatusText.textContent = 'Active (Storage paused)';
        }
      }

      if (activeSiteSwitches) {
        activeSiteSwitches.style.display = isCurrentBlacklisted ? 'none' : 'flex';
        if (toggleSiteReplacer) toggleSiteReplacer.checked = isReplacerOn;
        if (toggleSiteStorage) toggleSiteStorage.checked = isStorageOn;
        if (toggleSiteShortcuts) toggleSiteShortcuts.checked = isShortcutsOn;
      }
    } else {
      toggleCurrentSiteBtn.disabled = false;
      toggleCurrentSiteBtn.className = 'btn btn-primary';
      toggleCurrentSiteLabel.textContent = 'Add to Whitelist';

      if (!isCurrentBlacklisted) {
        siteStatusBadge.className = 'status-badge badge-inactive';
        siteStatusText.textContent = 'Inactive on this site';
      }

      if (activeSiteSwitches) {
        activeSiteSwitches.style.display = 'none';
      }
    }

    await renderSnippets();
  }

  // 5. Toggle current site in whitelist
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

  // 6. Toggle current path in blacklist
  if (toggleBlacklistBtn) {
    toggleBlacklistBtn.addEventListener('click', async () => {
      if (!currentTabUrl || !isScriptable) return;

      const isCurrentBlacklisted = AllowlistUtils.isUrlBlacklisted(currentTabUrl, currentBlacklist);

      if (isCurrentBlacklisted) {
        currentBlacklist = currentBlacklist.filter(p => !AllowlistUtils.matchUrlWithPattern(currentTabUrl, p));
        await StorageManager.setBlacklist(currentBlacklist);
        triggerSyncPulse();
        showFeedback('Removed from blacklist', 'success');
      } else {
        const entryToAdd = AllowlistUtils.normalizePattern(currentTabUrl) || currentTabUrl;
        if (!currentBlacklist.includes(entryToAdd)) {
          currentBlacklist.push(entryToAdd);
          await StorageManager.setBlacklist(currentBlacklist);
          triggerSyncPulse();
          showFeedback('Added to blacklist', 'success');
        }
      }
      await render();
    });
  }

  // 7. Active site replacer switch change handler
  if (toggleSiteReplacer) {
    toggleSiteReplacer.addEventListener('change', async () => {
      const matchedPattern = currentTabUrl ? AllowlistUtils.getMatchingPattern(currentTabUrl, currentAllowlist) : null;
      const siteKey = matchedPattern || currentSiteId;
      if (!siteKey) return;
      const isChecked = toggleSiteReplacer.checked;
      await StorageManager.setSiteReplacerEnabled(siteKey, isChecked);
      triggerSyncPulse();
      showFeedback(isChecked ? 'Replacer enabled on this site' : 'Replacer paused on this site');
      await render();
    });
  }

  // 8. Active site storage switch change handler
  if (toggleSiteStorage) {
    toggleSiteStorage.addEventListener('change', async () => {
      const matchedPattern = currentTabUrl ? AllowlistUtils.getMatchingPattern(currentTabUrl, currentAllowlist) : null;
      const siteKey = matchedPattern || currentSiteId;
      if (!siteKey) return;
      const isChecked = toggleSiteStorage.checked;
      await StorageManager.setSiteStorageEnabled(siteKey, isChecked);
      triggerSyncPulse();
      showFeedback(isChecked ? 'Storage enabled on this site' : 'Storage paused on this site');
      await render();
    });
  }

  // 9. Active site shortcuts switch change handler
  if (toggleSiteShortcuts) {
    toggleSiteShortcuts.addEventListener('change', async () => {
      const matchedPattern = currentTabUrl ? AllowlistUtils.getMatchingPattern(currentTabUrl, currentAllowlist) : null;
      const siteKey = matchedPattern || currentSiteId;
      if (!siteKey) return;
      const isChecked = toggleSiteShortcuts.checked;
      await StorageManager.setSiteShortcutsEnabled(siteKey, isChecked);
      triggerSyncPulse();
      showFeedback(isChecked ? 'Shortcuts enabled on this site' : 'Shortcuts paused on this site');
      await render();
    });
  }

  // 10. Listen for storage changes from background or settings
  chrome.storage.onChanged.addListener(async (changes) => {
    if (changes.allowlist || changes.blacklist || changes.site_replacer_state || changes.site_storage_state || changes.site_shortcuts_state || changes.snippets || changes.categories) {
      triggerSyncPulse();
      const [allowlist, blacklist] = await Promise.all([
        StorageManager.getAllowlist(),
        StorageManager.getBlacklist()
      ]);
      currentAllowlist = allowlist;
      currentBlacklist = blacklist;
      await render();
    }
  });

  // Initial load
  const [initialAllowlist, initialBlacklist] = await Promise.all([
    StorageManager.getAllowlist(),
    StorageManager.getBlacklist()
  ]);
  currentAllowlist = initialAllowlist;
  currentBlacklist = initialBlacklist;
  await render();
});
