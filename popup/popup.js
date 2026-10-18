/**
 * Popup Script: Manages allowlist UI, site status, and storage synchronization.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const siteStatusBadge = document.getElementById('site-status-badge');
  const siteStatusText = document.getElementById('site-status-text');
  const currentSiteHost = document.getElementById('current-site-host');
  const toggleCurrentSiteBtn = document.getElementById('toggle-current-site-btn');
  const toggleCurrentSiteLabel = document.getElementById('toggle-current-site-label');
  const addForm = document.getElementById('add-form');
  const customDomainInput = document.getElementById('custom-domain-input');
  const addFeedback = document.getElementById('add-feedback');
  const allowlistContainer = document.getElementById('allowlist-container');
  const allowlistCount = document.getElementById('allowlist-count');
  const emptyState = document.getElementById('empty-state');

  let currentTabUrl = '';
  let currentSiteId = '';
  let currentAllowlist = [];

  // 1. Get current tab information
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.url) {
      currentTabUrl = activeTab.url;
      currentSiteId = AllowlistUtils.getSiteIdentifier(currentTabUrl);
      currentSiteHost.textContent = currentSiteId || 'Non-web page (e.g. chrome://)';
      
      // Check if URL is scriptable (http, https, file)
      const isScriptable = currentTabUrl.startsWith('http://') || 
                           currentTabUrl.startsWith('https://') || 
                           currentTabUrl.startsWith('file://');
      
      if (!isScriptable) {
        toggleCurrentSiteBtn.disabled = true;
        toggleCurrentSiteLabel.textContent = 'Unavailable on this page';
      }
    } else {
      currentSiteHost.textContent = 'No active tab';
      toggleCurrentSiteBtn.disabled = true;
    }
  } catch (err) {
    currentSiteHost.textContent = 'Error detecting page';
    toggleCurrentSiteBtn.disabled = true;
  }

  // 2. Storage helper functions
  async function loadAllowlist() {
    try {
      const data = await chrome.storage.sync.get(['allowlist']);
      return Array.isArray(data.allowlist) ? data.allowlist : [];
    } catch (err) {
      const data = await chrome.storage.local.get(['allowlist']);
      return Array.isArray(data.allowlist) ? data.allowlist : [];
    }
  }

  async function saveAllowlist(list) {
    try {
      await chrome.storage.sync.set({ allowlist: list });
    } catch (err) {
      await chrome.storage.local.set({ allowlist: list });
    }
  }

  // 3. Render functions
  function render() {
    allowlistCount.textContent = currentAllowlist.length;

    // Check if current page is allowed
    const isCurrentAllowed = currentTabUrl && AllowlistUtils.isUrlAllowed(currentTabUrl, currentAllowlist);

    if (isCurrentAllowed) {
      siteStatusBadge.className = 'status-badge badge-active';
      siteStatusText.textContent = 'Active on this site';
      toggleCurrentSiteBtn.className = 'btn btn-danger';
      toggleCurrentSiteLabel.textContent = 'Remove from Allowlist';
    } else {
      siteStatusBadge.className = 'status-badge badge-inactive';
      siteStatusText.textContent = 'Inactive on this site';
      toggleCurrentSiteBtn.className = 'btn btn-primary';
      toggleCurrentSiteLabel.textContent = 'Allow on This Website';
    }

    // Render list of websites
    allowlistContainer.innerHTML = '';
    if (currentAllowlist.length === 0) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';

      currentAllowlist.forEach((domain, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'allowlist-item';

        const domainSpan = document.createElement('span');
        domainSpan.className = 'allowlist-item-domain';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'domain-icon';
        if (domain.startsWith('file://')) {
          iconSpan.innerHTML = '<svg width="13" height="13" viewBox="0 0 20 20" fill="#64748b"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>';
        } else {
          iconSpan.innerHTML = '<svg width="13" height="13" viewBox="0 0 20 20" fill="#64748b"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-.973z" clip-rule="evenodd"/></svg>';
        }

        const textNode = document.createTextNode(domain);
        domainSpan.appendChild(iconSpan);
        domainSpan.appendChild(textNode);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove';
        removeBtn.title = `Remove ${domain}`;
        removeBtn.setAttribute('aria-label', `Remove ${domain}`);
        removeBtn.innerHTML = `
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
        `;

        removeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          currentAllowlist.splice(index, 1);
          await saveAllowlist(currentAllowlist);
          showFeedback(`Removed ${domain}`, 'success');
          render();
        });

        itemEl.appendChild(domainSpan);
        itemEl.appendChild(removeBtn);
        allowlistContainer.appendChild(itemEl);
      });
    }
  }

  function showFeedback(msg, type = 'success') {
    addFeedback.textContent = msg;
    addFeedback.className = `feedback-msg feedback-${type}`;
    setTimeout(() => {
      if (addFeedback.textContent === msg) {
        addFeedback.textContent = '';
      }
    }, 2800);
  }

  // 4. Toggle current site button handler
  toggleCurrentSiteBtn.addEventListener('click', async () => {
    if (!currentSiteId) return;

    const isCurrentAllowed = AllowlistUtils.isUrlAllowed(currentTabUrl, currentAllowlist);

    if (isCurrentAllowed) {
      // Find matching pattern(s) to remove
      currentAllowlist = currentAllowlist.filter(p => !AllowlistUtils.matchUrlWithPattern(currentTabUrl, p));
      await saveAllowlist(currentAllowlist);
      showFeedback(`Removed ${currentSiteId}`, 'success');
    } else {
      // Add current site
      if (!currentAllowlist.includes(currentSiteId)) {
        currentAllowlist.push(currentSiteId);
        await saveAllowlist(currentAllowlist);
        showFeedback(`Added ${currentSiteId} to allowlist`, 'success');
      }
    }
    render();
  });

  // 5. Add custom domain form submission
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawVal = customDomainInput.value;
    const normalized = AllowlistUtils.normalizePattern(rawVal);

    if (!normalized) {
      showFeedback('Please enter a valid website domain', 'error');
      return;
    }

    if (currentAllowlist.includes(normalized)) {
      showFeedback('Website is already in the allowlist', 'error');
      return;
    }

    currentAllowlist.push(normalized);
    await saveAllowlist(currentAllowlist);
    customDomainInput.value = '';
    showFeedback(`Added ${normalized}`, 'success');
    render();
  });

  // 6. Listen for storage changes from background or other windows
  chrome.storage.onChanged.addListener((changes, area) => {
    if (changes.allowlist) {
      currentAllowlist = Array.isArray(changes.allowlist.newValue) ? changes.allowlist.newValue : [];
      render();
    }
  });

  // Initial load
  currentAllowlist = await loadAllowlist();
  render();
});
