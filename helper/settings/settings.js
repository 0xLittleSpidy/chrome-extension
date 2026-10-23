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

  // File setup elements
  const storageSetupBanner = document.getElementById('storage-setup-banner');
  const bannerStoreFileBtn = document.getElementById('banner-store-file-btn');
  const bannerSelectFileBtn = document.getElementById('banner-select-file-btn');
  const bannerDismissBtn = document.getElementById('banner-dismiss-btn');
  const sidebarFileBtn = document.getElementById('sidebar-file-btn');
  const pickerSaveBtn = document.getElementById('picker-save-btn');
  const pickerOpenBtn = document.getElementById('picker-open-btn');

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

  // --- File Storage Setup & Picker Handlers ---
  async function initFileSetupPrompt() {
    try {
      const isConfigured = await StorageManager.getFileConfigured();
      if (!isConfigured && storageSetupBanner) {
        storageSetupBanner.style.display = 'flex';
      }
    } catch (err) {
      // Ignore
    }
  }

  async function handleStoreToFile() {
    try {
      const config = await StorageManager.exportConfiguration();
      const content = JSON.stringify(config, null, 2);

      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'helper-data.json',
          types: [
            {
              description: 'Helper Configuration Data (*.json, *.js)',
              accept: {
                'application/json': ['.json'],
                'application/javascript': ['.js'],
                'text/plain': ['.txt']
              }
            }
          ]
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();

        await StorageManager.setFileConfigured(true);
        if (storageSetupBanner) storageSetupBanner.style.display = 'none';
        showToast('Helper data successfully saved to file!');
      } else {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'helper-data.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        await StorageManager.setFileConfigured(true);
        if (storageSetupBanner) storageSetupBanner.style.display = 'none';
        showToast('Helper data saved as helper-data.json');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        showToast('Save file failed: ' + err.message, 'error');
      }
    }
  }

  async function handleSelectExistingFile() {
    try {
      if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({
          types: [
            {
              description: 'Helper Configuration Data (*.json, *.js)',
              accept: {
                'application/json': ['.json'],
                'application/javascript': ['.js'],
                'text/plain': ['.txt']
              }
            }
          ]
        });
        const file = await handle.getFile();
        const text = await file.text();
        await StorageManager.importConfiguration(text);
        await StorageManager.setFileConfigured(true);
        if (storageSetupBanner) storageSetupBanner.style.display = 'none';
        showToast('Configuration restored from selected file!');
        await Promise.all([renderWhitelist(), renderSnippets(), renderRules()]);
      } else if (importFileInput) {
        importFileInput.click();
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        showToast('Select file failed: ' + err.message, 'error');
      }
    }
  }

  if (bannerStoreFileBtn) bannerStoreFileBtn.addEventListener('click', handleStoreToFile);
  if (pickerSaveBtn) pickerSaveBtn.addEventListener('click', handleStoreToFile);

  if (bannerSelectFileBtn) bannerSelectFileBtn.addEventListener('click', handleSelectExistingFile);
  if (pickerOpenBtn) pickerOpenBtn.addEventListener('click', handleSelectExistingFile);

  if (bannerDismissBtn) {
    bannerDismissBtn.addEventListener('click', async () => {
      await StorageManager.setFileConfigured(true);
      if (storageSetupBanner) storageSetupBanner.style.display = 'none';
      showToast('File prompt dismissed');
    });
  }

  if (sidebarFileBtn) {
    sidebarFileBtn.addEventListener('click', () => {
      switchTab('tab-import-export');
      if (storageSetupBanner) {
        storageSetupBanner.style.display = 'flex';
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
        card.appendChild(heading);

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

  // Initialize Theme, Setup Prompt, Answer Tabs, and Data
  await initTheme();
  await initFileSetupPrompt();
  renderAnswerTabs();
  updateLiveMarkdownPreview();
  await Promise.all([renderWhitelist(), renderSnippets(), renderRules()]);
});
