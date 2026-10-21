/**
 * Helper Settings Page Controller
 * Handles Whitelist, Snippets, Replacer Rules, and JSON Import/Export.
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Navigation elements
  const navButtons = document.querySelectorAll('.nav-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const toast = document.getElementById('toast');

  // Whitelist elements
  const addWhitelistForm = document.getElementById('add-whitelist-form');
  const whitelistInput = document.getElementById('whitelist-input');
  const whitelistList = document.getElementById('whitelist-list');
  const whitelistCount = document.getElementById('whitelist-count');
  const whitelistEmpty = document.getElementById('whitelist-empty');

  // Snippet elements
  const snippetForm = document.getElementById('snippet-form');
  const snippetFormTitle = document.getElementById('snippet-form-title');
  const snippetIdInput = document.getElementById('snippet-id');
  const snippetHeadingInput = document.getElementById('snippet-heading');
  const snippetDescriptionInput = document.getElementById('snippet-description');
  const snippetSubmitBtn = document.getElementById('snippet-submit-btn');
  const snippetCancelBtn = document.getElementById('snippet-cancel-btn');
  const snippetsList = document.getElementById('snippets-list');
  const snippetsCount = document.getElementById('snippets-count');
  const snippetsEmpty = document.getElementById('snippets-empty');

  // Rule elements
  const ruleForm = document.getElementById('rule-form');
  const ruleFormTitle = document.getElementById('rule-form-title');
  const ruleIdInput = document.getElementById('rule-id');
  const ruleFindInput = document.getElementById('rule-find');
  const ruleReplaceInput = document.getElementById('rule-replace');
  const ruleWholeWordInput = document.getElementById('rule-whole-word');
  const ruleMatchCaseInput = document.getElementById('rule-match-case');
  const ruleSubmitBtn = document.getElementById('rule-submit-btn');
  const ruleCancelBtn = document.getElementById('rule-cancel-btn');
  const rulesList = document.getElementById('rules-list');
  const rulesCount = document.getElementById('rules-count');
  const rulesEmpty = document.getElementById('rules-empty');

  // Import / Export elements
  const exportJsonBtn = document.getElementById('export-json-btn');
  const importFileInput = document.getElementById('import-file-input');
  const importPreview = document.getElementById('import-preview');
  const importPreviewText = document.getElementById('import-preview-text');
  const importConfirmBtn = document.getElementById('import-confirm-btn');

  let pendingImportData = null;

  // --- Toast Notification ---
  function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast show toast-${type}`;
    setTimeout(() => {
      toast.className = 'toast';
    }, 3200);
  }

  // --- Tab Navigation ---
  function switchTab(tabId) {
    navButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    tabPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === tabId);
    });
    window.location.hash = tabId.replace('tab-', '');
  }

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Handle URL hash on load
  const initialHash = window.location.hash.replace('#', '');
  if (initialHash) {
    const targetTab = document.getElementById(`tab-${initialHash}`);
    if (targetTab) {
      switchTab(`tab-${initialHash}`);
    }
  }

  // --- Whitelist Management ---
  async function renderWhitelist() {
    const list = await StorageManager.getAllowlist();
    whitelistCount.textContent = `${list.length} item${list.length === 1 ? '' : 's'}`;

    whitelistList.innerHTML = '';
    if (list.length === 0) {
      whitelistEmpty.style.display = 'block';
    } else {
      whitelistEmpty.style.display = 'none';

      list.forEach((domain) => {
        const item = document.createElement('div');
        item.className = 'list-item';

        const title = document.createElement('span');
        title.className = 'list-item-title';
        title.textContent = domain;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-danger btn-sm';
        removeBtn.textContent = 'Delete';
        removeBtn.addEventListener('click', async () => {
          const updated = list.filter(d => d !== domain);
          await StorageManager.setAllowlist(updated);
          showToast(`Removed "${domain}" from whitelist`);
          renderWhitelist();
        });

        item.appendChild(title);
        item.appendChild(removeBtn);
        whitelistList.appendChild(item);
      });
    }
  }

  addWhitelistForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = whitelistInput.value;
    const normalized = AllowlistUtils.normalizePattern(raw);

    if (!normalized) {
      showToast('Please enter a valid website address', 'error');
      return;
    }

    const current = await StorageManager.getAllowlist();
    if (current.includes(normalized)) {
      showToast('Website is already in the whitelist', 'error');
      return;
    }

    current.push(normalized);
    await StorageManager.setAllowlist(current);
    whitelistInput.value = '';
    showToast(`Added "${normalized}" to whitelist`);
    renderWhitelist();
  });

  // --- Snippets Management ---
  async function renderSnippets() {
    const list = await StorageManager.getSnippets();
    snippetsCount.textContent = `${list.length} snippet${list.length === 1 ? '' : 's'}`;

    snippetsList.innerHTML = '';
    if (list.length === 0) {
      snippetsEmpty.style.display = 'block';
    } else {
      snippetsEmpty.style.display = 'none';

      list.forEach((snippet) => {
        const card = document.createElement('div');
        card.className = 'snippet-card';

        const heading = document.createElement('h4');
        heading.className = 'snippet-card-heading';
        heading.textContent = snippet.heading;

        const desc = document.createElement('div');
        desc.className = 'snippet-card-desc';
        desc.textContent = snippet.description;

        const actions = document.createElement('div');
        actions.className = 'snippet-card-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-secondary btn-sm';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(snippet.description);
            showToast(`Copied "${snippet.heading}" to clipboard`);
          } catch (err) {
            showToast('Failed to copy to clipboard', 'error');
          }
        });

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-secondary btn-sm';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => {
          snippetIdInput.value = snippet.id;
          snippetHeadingInput.value = snippet.heading;
          snippetDescriptionInput.value = snippet.description;
          snippetFormTitle.textContent = 'Edit Snippet';
          snippetSubmitBtn.textContent = 'Update Snippet';
          snippetCancelBtn.style.display = 'inline-flex';
          snippetHeadingInput.focus();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-sm';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async () => {
          await StorageManager.deleteSnippet(snippet.id);
          showToast(`Deleted snippet "${snippet.heading}"`);
          if (snippetIdInput.value === snippet.id) {
            resetSnippetForm();
          }
          renderSnippets();
        });

        actions.appendChild(copyBtn);
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        card.appendChild(heading);
        card.appendChild(desc);
        card.appendChild(actions);

        snippetsList.appendChild(card);
      });
    }
  }

  function resetSnippetForm() {
    snippetIdInput.value = '';
    snippetHeadingInput.value = '';
    snippetDescriptionInput.value = '';
    snippetFormTitle.textContent = 'Add New Snippet';
    snippetSubmitBtn.textContent = 'Save Snippet';
    snippetCancelBtn.style.display = 'none';
  }

  snippetCancelBtn.addEventListener('click', resetSnippetForm);

  snippetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const heading = snippetHeadingInput.value.trim();
    const description = snippetDescriptionInput.value.trim();

    if (!heading) {
      showToast('Heading is required', 'error');
      return;
    }

    try {
      await StorageManager.saveSnippet({
        id: snippetIdInput.value || undefined,
        heading: heading,
        description: description
      });

      showToast(snippetIdInput.value ? 'Snippet updated' : 'Snippet saved');
      resetSnippetForm();
      renderSnippets();
    } catch (err) {
      showToast(err.message || 'Failed to save snippet', 'error');
    }
  });

  // --- Replacer Rules Management ---
  async function renderRules() {
    const list = await StorageManager.getReplacerRules();
    rulesCount.textContent = `${list.length} rule${list.length === 1 ? '' : 's'}`;

    rulesList.innerHTML = '';
    if (list.length === 0) {
      rulesEmpty.style.display = 'block';
    } else {
      rulesEmpty.style.display = 'none';

      const table = document.createElement('table');
      table.className = 'rules-table';

      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>Find (Original)</th>
          <th>Replace with</th>
          <th>Settings</th>
          <th>Actions</th>
        </tr>
      `;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');

      list.forEach((rule) => {
        const tr = document.createElement('tr');

        const tdFind = document.createElement('td');
        tdFind.style.fontWeight = '600';
        tdFind.textContent = rule.find;

        const tdReplace = document.createElement('td');
        tdReplace.textContent = rule.replace;

        const tdSettings = document.createElement('td');
        if (rule.wholeWord) {
          const spanWord = document.createElement('span');
          spanWord.className = 'rules-tag';
          spanWord.textContent = 'Whole Word';
          tdSettings.appendChild(spanWord);
        }
        if (rule.matchCase) {
          const spanCase = document.createElement('span');
          spanCase.className = 'rules-tag';
          spanCase.textContent = 'Preserve Case';
          tdSettings.appendChild(spanCase);
        }

        const tdActions = document.createElement('td');
        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '8px';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-secondary btn-sm';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => {
          ruleIdInput.value = rule.id;
          ruleFindInput.value = rule.find;
          ruleReplaceInput.value = rule.replace;
          ruleWholeWordInput.checked = Boolean(rule.wholeWord);
          ruleMatchCaseInput.checked = Boolean(rule.matchCase);
          ruleFormTitle.textContent = 'Edit Replacement Rule';
          ruleSubmitBtn.textContent = 'Update Rule';
          ruleCancelBtn.style.display = 'inline-flex';
          ruleFindInput.focus();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-sm';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async () => {
          await StorageManager.deleteReplacerRule(rule.id);
          showToast(`Deleted rule "${rule.find}"`);
          if (ruleIdInput.value === rule.id) {
            resetRuleForm();
          }
          renderRules();
        });

        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(deleteBtn);
        tdActions.appendChild(actionsDiv);

        tr.appendChild(tdFind);
        tr.appendChild(tdReplace);
        tr.appendChild(tdSettings);
        tr.appendChild(tdActions);
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      rulesList.appendChild(table);
    }
  }

  function resetRuleForm() {
    ruleIdInput.value = '';
    ruleFindInput.value = '';
    ruleReplaceInput.value = '';
    ruleWholeWordInput.checked = true;
    ruleMatchCaseInput.checked = true;
    ruleFormTitle.textContent = 'Add Replacement Rule';
    ruleSubmitBtn.textContent = 'Save Rule';
    ruleCancelBtn.style.display = 'none';
  }

  ruleCancelBtn.addEventListener('click', resetRuleForm);

  ruleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const find = ruleFindInput.value.trim();
    const replace = ruleReplaceInput.value.trim();

    if (!find) {
      showToast('Original text to find is required', 'error');
      return;
    }

    try {
      await StorageManager.saveReplacerRule({
        id: ruleIdInput.value || undefined,
        find: find,
        replace: replace,
        wholeWord: ruleWholeWordInput.checked,
        matchCase: ruleMatchCaseInput.checked
      });

      showToast(ruleIdInput.value ? 'Rule updated' : 'Rule saved');
      resetRuleForm();
      renderRules();
    } catch (err) {
      showToast(err.message || 'Failed to save rule', 'error');
    }
  });

  // --- Import & Export Management ---
  exportJsonBtn.addEventListener('click', async () => {
    try {
      const config = await StorageManager.exportConfiguration();
      const jsonStr = JSON.stringify(config, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `helper-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Configuration exported successfully');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    }
  });

  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('File content is not a valid JSON object');
        }

        const snippetCount = Array.isArray(parsed.snippets) ? parsed.snippets.length : 0;
        const rulesCountVal = Array.isArray(parsed.replacer_rules) ? parsed.replacer_rules.length : 0;
        const whitelistCountVal = Array.isArray(parsed.allowlist) ? parsed.allowlist.length : 0;

        pendingImportData = text;
        importPreviewText.textContent = `Valid backup found: ${whitelistCountVal} whitelisted site(s), ${snippetCount} snippet(s), ${rulesCountVal} rule(s).`;
        importPreview.style.display = 'flex';
      } catch (err) {
        showToast('Invalid JSON file: ' + err.message, 'error');
        importPreview.style.display = 'none';
        pendingImportData = null;
      }
    };
    reader.readAsText(file);
  });

  importConfirmBtn.addEventListener('click', async () => {
    if (!pendingImportData) return;

    try {
      await StorageManager.importConfiguration(pendingImportData);
      showToast('Configuration successfully restored!');
      importPreview.style.display = 'none';
      importFileInput.value = '';
      pendingImportData = null;

      // Refresh all tabs
      await Promise.all([renderWhitelist(), renderSnippets(), renderRules()]);
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
  });

  // Listen for storage changes from other views
  chrome.storage.onChanged.addListener(() => {
    renderWhitelist();
    renderSnippets();
    renderRules();
  });

  // Initial render
  await Promise.all([renderWhitelist(), renderSnippets(), renderRules()]);
});
