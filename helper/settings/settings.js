/**
 * Helper Settings Page Controller
 * Handles Whitelist, Snippets (Markdown & Multi-Answer), Replacer Rules,
 * JSON/JS File Persistence Setup, and Dark Theme.
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Navigation elements
  const navButtons = document.querySelectorAll('.nav-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const toast = document.getElementById('toast');

  // Theme elements
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeToggleLabel = document.getElementById('theme-toggle-label');

  // Sidebar Import/Export elements
  const sidebarImportBtn = document.getElementById('sidebar-import-btn');
  const sidebarExportBtn = document.getElementById('sidebar-export-btn');
  const sidebarImportInput = document.getElementById('sidebar-import-input');



  // Whitelist elements
  const addWhitelistForm = document.getElementById('add-whitelist-form');
  const whitelistInput = document.getElementById('whitelist-input');
  const whitelistList = document.getElementById('whitelist-list');
  const whitelistCount = document.getElementById('whitelist-count');
  const whitelistEmpty = document.getElementById('whitelist-empty');

  // Blacklist elements
  const addBlacklistForm = document.getElementById('add-blacklist-form');
  const blacklistInput = document.getElementById('blacklist-input');
  const blacklistList = document.getElementById('blacklist-list');
  const blacklistCount = document.getElementById('blacklist-count');
  const blacklistEmpty = document.getElementById('blacklist-empty');

  // Snippet elements
  const snippetForm = document.getElementById('snippet-form');
  const snippetFormTitle = document.getElementById('snippet-form-title');
  const snippetIdInput = document.getElementById('snippet-id');
  const snippetHeadingInput = document.getElementById('snippet-heading');
  const snippetCategorySelect = document.getElementById('snippet-category');
  const snippetAddCategoryBtn = document.getElementById('snippet-add-category-btn');
  const settingsCategoryFilter = document.getElementById('settings-category-filter');
  const snippetDescriptionInput = document.getElementById('snippet-description');
  const snippetDescriptionLabel = document.getElementById('snippet-description-label');
  const snippetMarkdownPreview = document.getElementById('snippet-markdown-preview');
  const snippetAnswersNav = document.getElementById('snippet-answers-nav');
  const snippetAddAnswerBtn = document.getElementById('snippet-add-answer-btn');
  const snippetRemoveAnswerBtn = document.getElementById('snippet-remove-answer-btn');
  const snippetSubmitBtn = document.getElementById('snippet-submit-btn');
  const snippetCancelBtn = document.getElementById('snippet-cancel-btn');
  const snippetsList = document.getElementById('snippets-list');
  const snippetsCount = document.getElementById('snippets-count');
  const snippetsEmpty = document.getElementById('snippets-empty');

  // Shortcut elements
  const shortcutForm = document.getElementById('shortcut-form');
  const shortcutFormTitle = document.getElementById('shortcut-form-title');
  const shortcutIdInput = document.getElementById('shortcut-id');
  const shortcutNameInput = document.getElementById('shortcut-name');
  const shortcutKeysInput = document.getElementById('shortcut-keys');
  const shortcutSubmitBtn = document.getElementById('shortcut-submit-btn');
  const shortcutCancelBtn = document.getElementById('shortcut-cancel-btn');
  const shortcutsList = document.getElementById('shortcuts-list');
  const shortcutsCount = document.getElementById('shortcuts-count');
  const shortcutsEmpty = document.getElementById('shortcuts-empty');

  // Header Cleaner elements
  const headerCleanerForm = document.getElementById('header-cleaner-form');
  const headerPatternInput = document.getElementById('header-pattern-input');
  const headerCleanerList = document.getElementById('header-cleaner-list');
  const headerCleanerCount = document.getElementById('header-cleaner-count');
  const resetHeadersBtn = document.getElementById('reset-headers-btn');
  const headerConsoleCount = document.getElementById('header-console-count');
  const clearHeaderConsoleBtn = document.getElementById('clear-header-console-btn');
  const consoleTestInput = document.getElementById('console-test-input');
  const consoleTestCleanBtn = document.getElementById('console-test-clean-btn');
  const headerConsoleTerminal = document.getElementById('header-console-terminal');

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



  // Active Snippet Form Multi-Answer state
  let currentFormAnswers = [''];
  let currentAnswerIndex = 0;

  // --- Safe Zero-Dependency Markdown Parser ---
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderMarkdownToHtml(markdown) {
    if (!markdown || typeof markdown !== 'string') {
      return '<p class="markdown-placeholder">Preview will render here in real time...</p>';
    }

    if (!markdown.trim()) {
      return '<p class="markdown-placeholder">Preview will render here in real time...</p>';
    }

    let text = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 1. Extract and preserve fenced code blocks
    const codeBlocks = [];
    text = text.replace(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const placeholder = `@@CODEBLOCK${codeBlocks.length}@@`;
      codeBlocks.push(`<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`);
      return placeholder;
    });

    // 2. Extract and preserve inline code
    const inlineCodes = [];
    text = text.replace(/`([^`\n]+)`/g, (match, code) => {
      const placeholder = `@@INLINECODE${inlineCodes.length}@@`;
      inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
      return placeholder;
    });

    // 3. Escape HTML for safety
    text = escapeHtml(text);

    // 4. Headers (# Header, ## Header, etc.)
    text = text.replace(/^(#{1,4})\s+(.+)$/gm, (match, hashes, content) => {
      const level = hashes.length;
      return `<h${level}>${content}</h${level}>`;
    });

    // 5. Blockquotes (> Quote)
    text = text.replace(/^>\s*(.+)$/gm, '<blockquote>$1</blockquote>');

    // 6. Bold, Italic, Strikethrough
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
    text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // 7. Links: [text](safe_url)
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|#[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 8. Unordered Lists (- item or * item)
    text = text.replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>');
    text = text.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ul>$1</ul>');

    // 9. Ordered Lists (1. item)
    text = text.replace(/^\d+\.\s+(.+)$/gm, '<li class="ol-item">$1</li>');
    text = text.replace(/((?:<li class="ol-item">.*<\/li>\s*)+)/g, (match) => {
      return '<ol>' + match.replace(/ class="ol-item"/g, '') + '</ol>';
    });

    // 10. Paragraphs
    const lines = text.split('\n');
    const processed = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('<h') || line.startsWith('<pre>') || line.startsWith('<blockquote>') ||
          line.startsWith('<ul>') || line.startsWith('</ul>') || line.startsWith('<ol>') ||
          line.startsWith('</ol>') || line.startsWith('<li>') || line.startsWith('@@CODEBLOCK')) {
        processed.push(line);
      } else if (line.trim() === '') {
        processed.push('');
      } else {
        processed.push(`<p>${line}</p>`);
      }
    }
    text = processed.join('\n');

    // 11. Restore inline codes and code blocks
    inlineCodes.forEach((codeHtml, idx) => {
      text = text.replace(new RegExp(`@@INLINECODE${idx}@@`, 'g'), codeHtml);
    });

    codeBlocks.forEach((blockHtml, idx) => {
      text = text.replace(new RegExp(`<p>@@CODEBLOCK${idx}@@<\/p>|@@CODEBLOCK${idx}@@`, 'g'), blockHtml);
    });

    return text;
  }

  // --- Toast Notification ---
  function showToast(message, type = 'success') {
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show toast-${type}`;
    setTimeout(() => {
      toast.className = 'toast';
    }, 3200);
  }

  // --- Auto-Sync Indicator Controller ---
  const settingsSyncIndicator = document.getElementById('settings-sync-indicator');
  const syncLabel = settingsSyncIndicator ? settingsSyncIndicator.querySelector('span') : null;

  function triggerSyncPulse(message = 'Syncing...') {
    if (settingsSyncIndicator) {
      settingsSyncIndicator.classList.add('syncing');
      if (syncLabel) syncLabel.textContent = message;
      setTimeout(() => {
        settingsSyncIndicator.classList.remove('syncing');
        if (syncLabel) syncLabel.textContent = 'Synced';
      }, 1000);
    }
  }

  if (settingsSyncIndicator) {
    settingsSyncIndicator.addEventListener('click', () => {
      triggerSyncPulse('Syncing...');
      showToast('All settings and storage synchronized');
    });
  }

  chrome.storage.onChanged.addListener(() => {
    triggerSyncPulse('Syncing...');
  });

  // --- Theme Controller ---
  async function initTheme() {
    const currentTheme = await StorageManager.getTheme();
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (themeToggleLabel) {
      themeToggleLabel.textContent = `Theme: ${currentTheme === 'dark' ? 'Dark' : 'Light'}`;
    }
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', async () => {
      const active = document.documentElement.getAttribute('data-theme') || 'dark';
      const nextTheme = active === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nextTheme);
      await StorageManager.setTheme(nextTheme);
      if (themeToggleLabel) {
        themeToggleLabel.textContent = `Theme: ${nextTheme === 'dark' ? 'Dark' : 'Light'}`;
      }
      showToast(`Switched to ${nextTheme} theme`);
    });
  }

  // Sidebar Import / Export Handlers
  if (sidebarImportBtn && sidebarImportInput) {
    sidebarImportBtn.addEventListener('click', () => {
      sidebarImportInput.click();
    });

    sidebarImportInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const text = event.target.result;
          await StorageManager.importConfiguration(text, 'replace');
          showToast('Configuration successfully imported!');
          sidebarImportInput.value = '';
          await Promise.all([
            renderWhitelist(),
            renderBlacklist(),
            renderSnippets(),
            renderRules(),
            renderShortcuts(),
            renderHeaderCleaner()
          ]);
        } catch (err) {
          showToast('Import failed: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
    });
  }

  if (sidebarExportBtn) {
    sidebarExportBtn.addEventListener('click', async () => {
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

  // --- Blacklist Management ---
  async function renderBlacklist() {
    if (!blacklistCount || !blacklistList) return;
    const list = await StorageManager.getBlacklist();
    blacklistCount.textContent = `${list.length} item${list.length === 1 ? '' : 's'}`;

    blacklistList.innerHTML = '';
    if (list.length === 0) {
      if (blacklistEmpty) blacklistEmpty.style.display = 'block';
    } else {
      if (blacklistEmpty) blacklistEmpty.style.display = 'none';

      list.forEach((entry) => {
        const item = document.createElement('div');
        item.className = 'list-item';

        const title = document.createElement('span');
        title.className = 'list-item-title';
        title.textContent = entry;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-danger btn-sm';
        removeBtn.textContent = 'Delete';
        removeBtn.addEventListener('click', async () => {
          await StorageManager.removeBlacklist(entry);
          showToast(`Removed "${entry}" from blacklist`);
          renderBlacklist();
        });

        item.appendChild(title);
        item.appendChild(removeBtn);
        blacklistList.appendChild(item);
      });
    }
  }

  if (addBlacklistForm && blacklistInput) {
    addBlacklistForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raw = blacklistInput.value.trim();
      const normalized = AllowlistUtils.normalizePattern(raw) || raw;

      if (!normalized) {
        showToast('Please enter a valid path or URL', 'error');
        return;
      }

      const current = await StorageManager.getBlacklist();
      if (current.includes(normalized)) {
        showToast('URL/Path is already in the blacklist', 'error');
        return;
      }

      await StorageManager.addBlacklist(normalized);
      blacklistInput.value = '';
      showToast(`Added "${normalized}" to blacklist`);
      renderBlacklist();
    });
  }

  // --- Multi-Answer & Markdown Snippet Management ---
  function updateLiveMarkdownPreview() {
    if (snippetMarkdownPreview && snippetDescriptionInput) {
      snippetMarkdownPreview.innerHTML = renderMarkdownToHtml(snippetDescriptionInput.value);
    }
  }

  function renderAnswerTabs() {
    if (!snippetAnswersNav) return;
    snippetAnswersNav.innerHTML = '';

    currentFormAnswers.forEach((ans, idx) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `answer-chip ${idx === currentAnswerIndex ? 'active' : ''}`;
      chip.textContent = `Option ${idx + 1}`;
      chip.setAttribute('aria-label', `Switch to answer option ${idx + 1}`);

      chip.addEventListener('click', () => {
        // Save current typing before switching
        if (snippetDescriptionInput) {
          currentFormAnswers[currentAnswerIndex] = snippetDescriptionInput.value;
        }
        currentAnswerIndex = idx;
        if (snippetDescriptionInput) {
          snippetDescriptionInput.value = currentFormAnswers[idx] || '';
        }
        if (snippetDescriptionLabel) {
          snippetDescriptionLabel.textContent = `Markdown Description (Option ${idx + 1})`;
        }
        renderAnswerTabs();
        updateLiveMarkdownPreview();
        if (snippetDescriptionInput) snippetDescriptionInput.focus();
      });

      snippetAnswersNav.appendChild(chip);
    });

    if (snippetRemoveAnswerBtn) {
      snippetRemoveAnswerBtn.style.display = currentFormAnswers.length > 1 ? 'inline-flex' : 'none';
    }
  }

  if (snippetDescriptionInput) {
    snippetDescriptionInput.addEventListener('input', () => {
      currentFormAnswers[currentAnswerIndex] = snippetDescriptionInput.value;
      updateLiveMarkdownPreview();
    });
  }

  if (snippetAddAnswerBtn) {
    snippetAddAnswerBtn.addEventListener('click', () => {
      if (snippetDescriptionInput) {
        currentFormAnswers[currentAnswerIndex] = snippetDescriptionInput.value;
      }
      currentFormAnswers.push('');
      currentAnswerIndex = currentFormAnswers.length - 1;
      if (snippetDescriptionInput) {
        snippetDescriptionInput.value = '';
      }
      if (snippetDescriptionLabel) {
        snippetDescriptionLabel.textContent = `Markdown Description (Option ${currentAnswerIndex + 1})`;
      }
      renderAnswerTabs();
      updateLiveMarkdownPreview();
      if (snippetDescriptionInput) snippetDescriptionInput.focus();
    });
  }

  if (snippetRemoveAnswerBtn) {
    snippetRemoveAnswerBtn.addEventListener('click', () => {
      if (currentFormAnswers.length <= 1) return;
      currentFormAnswers.splice(currentAnswerIndex, 1);
      currentAnswerIndex = Math.max(0, currentAnswerIndex - 1);
      if (snippetDescriptionInput) {
        snippetDescriptionInput.value = currentFormAnswers[currentAnswerIndex] || '';
      }
      if (snippetDescriptionLabel) {
        snippetDescriptionLabel.textContent = `Markdown Description (Option ${currentAnswerIndex + 1})`;
      }
      renderAnswerTabs();
      updateLiveMarkdownPreview();
    });
  }

  if (snippetAddCategoryBtn) {
    snippetAddCategoryBtn.addEventListener('click', async () => {
      const name = window.prompt('Enter new category name:');
      if (name && name.trim()) {
        await StorageManager.addCategory(name.trim());
        showToast(`Category "${name.trim()}" created`);
        await renderSnippets();
        if (snippetCategorySelect) snippetCategorySelect.value = name.trim();
      }
    });
  }

  async function renderSnippets() {
    const [allSnippets, categories] = await Promise.all([
      StorageManager.getSnippets(),
      StorageManager.getCategories()
    ]);

    // Populate category dropdown in form
    if (snippetCategorySelect) {
      const currentSelected = snippetCategorySelect.value;
      snippetCategorySelect.innerHTML = '';
      categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        if (cat === currentSelected) opt.selected = true;
        snippetCategorySelect.appendChild(opt);
      });
      if (!snippetCategorySelect.value && categories[0]) {
        snippetCategorySelect.value = categories[0];
      }
    }

    // Populate category filter
    if (settingsCategoryFilter) {
      const currentFilter = settingsCategoryFilter.value || 'all';
      settingsCategoryFilter.innerHTML = '<option value="all">All Categories</option>';
      categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        if (cat === currentFilter) opt.selected = true;
        settingsCategoryFilter.appendChild(opt);
      });
      settingsCategoryFilter.onchange = () => {
        renderSnippets();
      };
    }

    const activeFilter = settingsCategoryFilter ? settingsCategoryFilter.value : 'all';
    const list = (activeFilter && activeFilter !== 'all')
      ? allSnippets.filter(s => (s.category || 'General') === activeFilter)
      : allSnippets;

    snippetsCount.textContent = `${list.length} snippet${list.length === 1 ? '' : 's'}`;

    snippetsList.innerHTML = '';
    if (list.length === 0) {
      snippetsEmpty.style.display = 'block';
    } else {
      snippetsEmpty.style.display = 'none';

      list.forEach((snippet) => {
        const card = document.createElement('div');
        card.className = 'snippet-card';

        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.justifyContent = 'space-between';
        headerRow.style.alignItems = 'center';
        headerRow.style.marginBottom = '8px';

        const titleBox = document.createElement('div');
        titleBox.style.display = 'flex';
        titleBox.style.alignItems = 'center';
        titleBox.style.gap = '8px';

        const heading = document.createElement('h4');
        heading.className = 'snippet-card-heading';
        heading.style.margin = '0';
        heading.textContent = snippet.heading;

        const catBadge = document.createElement('span');
        catBadge.className = 'badge';
        catBadge.textContent = snippet.category || 'General';

        titleBox.appendChild(heading);
        titleBox.appendChild(catBadge);

        // Reordering buttons
        const reorderBox = document.createElement('div');
        reorderBox.style.display = 'flex';
        reorderBox.style.gap = '4px';

        const upBtn = document.createElement('button');
        upBtn.className = 'btn btn-secondary btn-sm';
        upBtn.textContent = 'Up';
        upBtn.title = 'Move snippet up';
        upBtn.addEventListener('click', async () => {
          const fullList = await StorageManager.getSnippets();
          const idx = fullList.findIndex(s => s.id === snippet.id);
          if (idx > 0) {
            const temp = fullList[idx - 1];
            fullList[idx - 1] = fullList[idx];
            fullList[idx] = temp;
            await StorageManager.reorderSnippets(fullList.map(s => s.id));
            renderSnippets();
          }
        });

        const downBtn = document.createElement('button');
        downBtn.className = 'btn btn-secondary btn-sm';
        downBtn.textContent = 'Down';
        downBtn.title = 'Move snippet down';
        downBtn.addEventListener('click', async () => {
          const fullList = await StorageManager.getSnippets();
          const idx = fullList.findIndex(s => s.id === snippet.id);
          if (idx < fullList.length - 1) {
            const temp = fullList[idx + 1];
            fullList[idx + 1] = fullList[idx];
            fullList[idx] = temp;
            await StorageManager.reorderSnippets(fullList.map(s => s.id));
            renderSnippets();
          }
        });

        reorderBox.appendChild(upBtn);
        reorderBox.appendChild(downBtn);

        headerRow.appendChild(titleBox);
        headerRow.appendChild(reorderBox);
        card.appendChild(headerRow);

        const answers = Array.isArray(snippet.answers) && snippet.answers.length > 0
          ? snippet.answers
          : [snippet.description || ''];

        if (answers.length > 1) {
          // Multi-answer view: allow user to inspect each answer and choose which to copy
          const answersList = document.createElement('div');
          answersList.className = 'snippet-answers-list';

          answers.forEach((ans, idx) => {
            const ansItem = document.createElement('div');
            ansItem.className = 'snippet-answer-item';

            const ansHeader = document.createElement('div');
            ansHeader.className = 'snippet-answer-header';

            const badge = document.createElement('span');
            badge.className = 'snippet-answer-badge';
            badge.textContent = `Option ${idx + 1}`;

            const copyOptBtn = document.createElement('button');
            copyOptBtn.className = 'btn btn-secondary btn-sm';
            copyOptBtn.textContent = `Copy Option ${idx + 1}`;
            copyOptBtn.addEventListener('click', async () => {
              try {
                await navigator.clipboard.writeText(ans);
                showToast(`Copied Option ${idx + 1} of "${snippet.heading}"`);
              } catch (err) {
                showToast('Failed to copy to clipboard', 'error');
              }
            });

            ansHeader.appendChild(badge);
            ansHeader.appendChild(copyOptBtn);

            const ansDesc = document.createElement('div');
            ansDesc.className = 'snippet-card-desc';
            ansDesc.innerHTML = renderMarkdownToHtml(ans);

            ansItem.appendChild(ansHeader);
            ansItem.appendChild(ansDesc);
            answersList.appendChild(ansItem);
          });

          card.appendChild(answersList);
        } else {
          // Single answer view
          const desc = document.createElement('div');
          desc.className = 'snippet-card-desc';
          desc.innerHTML = renderMarkdownToHtml(snippet.description || answers[0] || '');
          card.appendChild(desc);
        }

        const actions = document.createElement('div');
        actions.className = 'snippet-card-actions';

        if (answers.length <= 1) {
          const copyBtn = document.createElement('button');
          copyBtn.className = 'btn btn-secondary btn-sm';
          copyBtn.textContent = 'Copy';
          copyBtn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(snippet.description || answers[0] || '');
              showToast(`Copied "${snippet.heading}" to clipboard`);
            } catch (err) {
              showToast('Failed to copy to clipboard', 'error');
            }
          });
          actions.appendChild(copyBtn);
        }

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-secondary btn-sm';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => {
          snippetIdInput.value = snippet.id;
          snippetHeadingInput.value = snippet.heading;
          if (snippetCategorySelect) {
            snippetCategorySelect.value = snippet.category || 'General';
          }

          currentFormAnswers = answers.length > 0 ? [...answers] : [''];
          currentAnswerIndex = 0;
          snippetDescriptionInput.value = currentFormAnswers[0];
          if (snippetDescriptionLabel) {
            snippetDescriptionLabel.textContent = 'Markdown Description (Option 1)';
          }

          snippetFormTitle.textContent = 'Edit Snippet';
          snippetSubmitBtn.textContent = 'Update Snippet';
          snippetCancelBtn.style.display = 'inline-flex';
          renderAnswerTabs();
          updateLiveMarkdownPreview();
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

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        card.appendChild(actions);

        snippetsList.appendChild(card);
      });
    }
  }

  function resetSnippetForm() {
    snippetIdInput.value = '';
    snippetHeadingInput.value = '';
    if (snippetCategorySelect) snippetCategorySelect.value = 'General';
    currentFormAnswers = [''];
    currentAnswerIndex = 0;
    if (snippetDescriptionInput) snippetDescriptionInput.value = '';
    if (snippetDescriptionLabel) snippetDescriptionLabel.textContent = 'Markdown Description (Option 1)';
    snippetFormTitle.textContent = 'Add New Snippet';
    snippetSubmitBtn.textContent = 'Save Snippet';
    snippetCancelBtn.style.display = 'none';
    renderAnswerTabs();
    updateLiveMarkdownPreview();
  }

  snippetCancelBtn.addEventListener('click', resetSnippetForm);

  snippetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const heading = snippetHeadingInput.value.trim();
    const category = snippetCategorySelect ? (snippetCategorySelect.value || 'General') : 'General';
    if (snippetDescriptionInput) {
      currentFormAnswers[currentAnswerIndex] = snippetDescriptionInput.value;
    }

    if (!heading) {
      showToast('Heading is required', 'error');
      return;
    }

    // Filter valid non-empty answers, defaulting to at least 1
    const cleanAnswers = currentFormAnswers.map(a => a.trim()).filter(a => a.length > 0);
    if (cleanAnswers.length === 0) {
      const fallback = snippetDescriptionInput ? snippetDescriptionInput.value.trim() : '';
      if (fallback) cleanAnswers.push(fallback);
    }

    if (cleanAnswers.length === 0) {
      showToast('At least one answer or description is required', 'error');
      return;
    }

    try {
      await StorageManager.saveSnippet({
        id: snippetIdInput.value || undefined,
        heading: heading,
        category: category,
        description: cleanAnswers[0],
        answers: cleanAnswers
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

  // --- Shortcuts Management ---
  async function renderShortcuts() {
    if (!shortcutsCount || !shortcutsList) return;
    const list = await StorageManager.getShortcuts();
    shortcutsCount.textContent = `${list.length} shortcut${list.length === 1 ? '' : 's'}`;

    shortcutsList.innerHTML = '';
    if (list.length === 0) {
      if (shortcutsEmpty) shortcutsEmpty.style.display = 'block';
    } else {
      if (shortcutsEmpty) shortcutsEmpty.style.display = 'none';

      const table = document.createElement('table');
      table.className = 'rules-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th>Shortcut Name</th>
            <th>Key Combination</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector('tbody');

      list.forEach((sc) => {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.style.fontWeight = '600';
        tdName.textContent = sc.name;

        const tdKeys = document.createElement('td');
        const spanKey = document.createElement('span');
        spanKey.className = 'rules-tag';
        spanKey.textContent = sc.keys;
        tdKeys.appendChild(spanKey);

        const tdActions = document.createElement('td');
        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '8px';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-secondary btn-sm';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => {
          shortcutIdInput.value = sc.id;
          shortcutNameInput.value = sc.name;
          shortcutKeysInput.value = sc.keys;
          shortcutFormTitle.textContent = 'Edit Shortcut';
          shortcutSubmitBtn.textContent = 'Update Shortcut';
          shortcutCancelBtn.style.display = 'inline-flex';
          shortcutNameInput.focus();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-sm';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async () => {
          await StorageManager.deleteShortcut(sc.id);
          showToast(`Deleted shortcut "${sc.name}"`);
          if (shortcutIdInput.value === sc.id) {
            resetShortcutForm();
          }
          renderShortcuts();
        });

        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(deleteBtn);
        tdActions.appendChild(actionsDiv);

        tr.appendChild(tdName);
        tr.appendChild(tdKeys);
        tr.appendChild(tdActions);
        tbody.appendChild(tr);
      });

      shortcutsList.appendChild(table);
    }
  }

  function resetShortcutForm() {
    if (!shortcutForm) return;
    shortcutIdInput.value = '';
    shortcutNameInput.value = '';
    shortcutKeysInput.value = '';
    shortcutFormTitle.textContent = 'Add New Shortcut';
    shortcutSubmitBtn.textContent = 'Save Shortcut';
    shortcutCancelBtn.style.display = 'none';
  }

  if (shortcutCancelBtn) shortcutCancelBtn.addEventListener('click', resetShortcutForm);

  if (shortcutForm) {
    shortcutForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = shortcutNameInput.value.trim();
      const keys = shortcutKeysInput.value.trim();

      if (!name || !keys) {
        showToast('Shortcut name and keys are required', 'error');
        return;
      }

      try {
        await StorageManager.saveShortcut({
          id: shortcutIdInput.value || undefined,
          name: name,
          keys: keys
        });
        showToast(shortcutIdInput.value ? 'Shortcut updated' : 'Shortcut saved');
        resetShortcutForm();
        renderShortcuts();
      } catch (err) {
        showToast(err.message || 'Failed to save shortcut', 'error');
      }
    });
  }

  // --- Header Cleaner Management ---
  async function renderHeaderCleaner() {
    if (!headerCleanerCount || !headerCleanerList) return;
    const list = await StorageManager.getUnwantedHeaders();
    headerCleanerCount.textContent = `${list.length} pattern${list.length === 1 ? '' : 's'}`;

    headerCleanerList.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'rules-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Header Pattern</th>
          <th>Type</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    list.forEach((pattern) => {
      const tr = document.createElement('tr');

      const tdPat = document.createElement('td');
      tdPat.style.fontWeight = '600';
      tdPat.textContent = pattern;

      const tdType = document.createElement('td');
      const tag = document.createElement('span');
      tag.className = 'rules-tag';
      tag.textContent = pattern.includes('*') ? 'Wildcard Prefix' : 'Exact Header';
      tdType.appendChild(tag);

      const tdActions = document.createElement('td');
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-danger btn-sm';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async () => {
        await StorageManager.deleteUnwantedHeader(pattern);
        showToast(`Removed "${pattern}"`);
        renderHeaderCleaner();
      });

      tdActions.appendChild(deleteBtn);
      tr.appendChild(tdPat);
      tr.appendChild(tdType);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });

    headerCleanerList.appendChild(table);
  }

  if (headerCleanerForm && headerPatternInput) {
    headerCleanerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pattern = headerPatternInput.value.trim();
      if (!pattern) return;

      await StorageManager.addUnwantedHeader(pattern);
      headerPatternInput.value = '';
      showToast(`Added header pattern "${pattern}"`);
      renderHeaderCleaner();
    });
  }

  if (resetHeadersBtn) {
    resetHeadersBtn.addEventListener('click', async () => {
      await StorageManager.setUnwantedHeaders(StorageManager.DEFAULT_UNWANTED_HEADERS);
      showToast('Reset unwanted headers to default list');
      renderHeaderCleaner();
    });
  }

  // --- Deleted Headers Console Log ---
  async function renderHeaderConsole() {
    if (!headerConsoleTerminal) return;
    const logs = await StorageManager.getDeletedHeadersLog();
    if (headerConsoleCount) {
      headerConsoleCount.textContent = `${logs.length} ${logs.length === 1 ? 'entry' : 'entries'}`;
    }

    headerConsoleTerminal.innerHTML = '';
    if (!Array.isArray(logs) || logs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'console-empty';
      empty.textContent = 'System ready. No deleted headers recorded yet. Click Remove Unwanted Headers on any web page or use the test box above to see real-time deletion logs.';
      headerConsoleTerminal.appendChild(empty);
      return;
    }

    logs.forEach(entry => {
      const entryDiv = document.createElement('div');
      entryDiv.className = 'console-entry';

      const headerDiv = document.createElement('div');
      headerDiv.className = 'console-entry-header';

      const sourceSpan = document.createElement('span');
      sourceSpan.textContent = `[${entry.source || 'Web Page'}] ${entry.count || (entry.headers ? entry.headers.length : 0)} header(s) deleted:`;

      const timeSpan = document.createElement('span');
      timeSpan.className = 'console-entry-time';
      timeSpan.textContent = entry.timestamp || '';

      headerDiv.appendChild(sourceSpan);
      headerDiv.appendChild(timeSpan);
      entryDiv.appendChild(headerDiv);

      if (Array.isArray(entry.headers)) {
        entry.headers.forEach(h => {
          const lineDiv = document.createElement('div');
          lineDiv.className = 'console-entry-line';
          lineDiv.textContent = h;
          entryDiv.appendChild(lineDiv);
        });
      }

      headerConsoleTerminal.appendChild(entryDiv);
    });
  }

  if (clearHeaderConsoleBtn) {
    clearHeaderConsoleBtn.addEventListener('click', async () => {
      await StorageManager.clearDeletedHeadersLog();
      showToast('Cleared deleted headers console');
      renderHeaderConsole();
    });
  }

  if (consoleTestCleanBtn && consoleTestInput) {
    consoleTestCleanBtn.addEventListener('click', async () => {
      const text = consoleTestInput.value;
      if (!text || !text.trim()) {
        showToast('Please paste headers to test', 'error');
        return;
      }
      const patterns = await StorageManager.getUnwantedHeaders();
      const lines = text.split(/\r?\n/);
      let removedCount = 0;
      const removedLines = [];
      const remainingLines = [];

      for (const line of lines) {
        const trimmed = line.trim();
        const colonIdx = trimmed.indexOf(':');
        const isHeaderLike = colonIdx > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('```');
        let matched = false;

        if (isHeaderLike) {
          const headerName = trimmed.slice(0, colonIdx).trim().toLowerCase();
          for (const pat of patterns) {
            const cleanPat = pat.trim().toLowerCase().replace(/:$/, '');
            if (cleanPat.endsWith('*')) {
              const prefix = cleanPat.slice(0, -1);
              const prefixWithoutDash = prefix.endsWith('-') ? prefix.slice(0, -1) : prefix;
              if (headerName.startsWith(prefix) || headerName === prefixWithoutDash) {
                matched = true;
                break;
              }
            } else if (headerName === cleanPat) {
              matched = true;
              break;
            }
          }
        }

        if (matched) {
          removedCount++;
          removedLines.push(trimmed);
        } else {
          remainingLines.push(line);
        }
      }

      if (removedCount > 0) {
        consoleTestInput.value = remainingLines.join('\n');
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour12: false });
        const dateStr = now.toISOString().slice(0, 10);
        await StorageManager.addDeletedHeadersLog({
          id: 'test-clean-' + Date.now(),
          timestamp: `${dateStr} ${timeStr}`,
          source: 'Interactive Test Cleaner',
          headers: removedLines,
          count: removedCount
        });
        showToast(`Removed ${removedCount} header line${removedCount === 1 ? '' : 's'}`);
        renderHeaderConsole();
      } else {
        showToast('No matching unwanted headers found');
      }
    });
  }

  // Listen for storage changes from other views
  chrome.storage.onChanged.addListener(() => {
    renderWhitelist();
    renderBlacklist();
    renderSnippets();
    renderRules();
    renderShortcuts();
    renderHeaderCleaner();
    renderHeaderConsole();
  });

  // Initialize Theme, Answer Tabs, and Data
  await initTheme();
  renderAnswerTabs();
  updateLiveMarkdownPreview();
  await Promise.all([
    renderWhitelist(),
    renderBlacklist(),
    renderSnippets(),
    renderRules(),
    renderShortcuts(),
    renderHeaderCleaner(),
    renderHeaderConsole()
  ]);
});
