/**
 * Content Script for Is & Are Replacer.
 * Scans textboxes, input fields, and contenteditable elements on allowlisted websites
 * for sentences containing "is" or "are", highlights them in yellow with an underline,
 * and enables one-click replacement to "was" or "were".
 */
(function () {
  'use strict';

  // Prevent double injection
  if (window.__isToWasReplacerInjected) return;
  window.__isToWasReplacerInjected = true;

  let isEnabledOnThisPage = false;
  let activeRules = [];
  let activeShortcuts = [];
  let activeUnwantedHeaders = [];
  let isShortcutsEnabledOnSite = true;
  let shadowRoot = null;
  let hostElement = null;
  let floatingTooltip = null;
  let flyingToolbar = null;
  let activeFocusedElement = null;
  let lastContextMenuTarget = null;
  let resizeObserver = null;
  let mutationObserver = null;
  let lastKnownUrl = window.location.href;

  // Tracked inputs and their overlays: Map<HTMLElement, OverlayRecord>
  const trackedElements = new Map();

  /**
   * List of supported input types.
   */
  const SUPPORTED_INPUT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel', '']);

  /**
   * Initializes or tears down the extension on this page based on whitelist,
   * blacklist, and per-site switch statuses.
   */
  async function checkAllowlistAndInitialize() {
    try {
      const data = await chrome.storage.sync.get([
        'allowlist',
        'blacklist',
        'site_replacer_state',
        'site_shortcuts_state',
        'replacer_rules',
        'shortcuts',
        'unwanted_headers'
      ]);
      const allowlist = Array.isArray(data.allowlist) ? data.allowlist : [];
      const blacklist = Array.isArray(data.blacklist) ? data.blacklist : [];
      const siteReplacerState = data.site_replacer_state || {};
      const siteShortcutsState = data.site_shortcuts_state || {};

      // 1. Blacklist check overrides everything
      if (AllowlistUtils.isUrlBlacklisted(window.location.href, blacklist)) {
        if (isEnabledOnThisPage) {
          deactivateExtension();
        }
        return;
      }

      activeRules = Array.isArray(data.replacer_rules) && data.replacer_rules.length > 0
        ? data.replacer_rules
        : (typeof TextScanner !== 'undefined' && TextScanner.DEFAULT_RULES ? TextScanner.DEFAULT_RULES : []);

      activeShortcuts = Array.isArray(data.shortcuts) ? data.shortcuts : [];
      activeUnwantedHeaders = Array.isArray(data.unwanted_headers) && data.unwanted_headers.length > 0
        ? data.unwanted_headers
        : [
            'sec-fetch-*',
            'sec-ch-ua-*',
            'X-pwnfox-color',
            'Accept-Language',
            'Upgrade-Insecure-Requests',
            'Priority',
            'Accept-Encoding'
          ];

      const allowed = AllowlistUtils.isUrlAllowed(window.location.href, allowlist);
      const matchedPattern = AllowlistUtils.getMatchingPattern(window.location.href, allowlist);
      const siteKey = matchedPattern || AllowlistUtils.getSiteIdentifier(window.location.href);
      const replacerEnabledOnSite = siteReplacerState[siteKey] !== false;
      isShortcutsEnabledOnSite = siteShortcutsState[siteKey] !== false;

      const shouldBeActive = Boolean(allowed && replacerEnabledOnSite);

      if (shouldBeActive && !isEnabledOnThisPage) {
        activateExtension();
      } else if (!shouldBeActive && isEnabledOnThisPage) {
        deactivateExtension();
      } else if (shouldBeActive && isEnabledOnThisPage) {
        // Refresh overlays if rules or status changed
        scanAllFields();
        rebuildFlyingToolbar();
      }
    } catch (err) {
      console.warn('[Helper] Failed to check status:', err);
    }
  }

  /**
   * Sets up the overlay host in Shadow DOM using viewport-fixed positioning.
   */
  function setupShadowRoot() {
    if (hostElement && shadowRoot) return;

    hostElement = document.createElement('div');
    hostElement.id = 'is-highlighter-extension-root';
    hostElement.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 0; pointer-events: none; z-index: 2147483640;';

    shadowRoot = hostElement.attachShadow({ mode: 'open' });

    // Fetch and inject content.css into Shadow DOM
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('content/content.css');
    shadowRoot.appendChild(link);

    // Create shared instant floating tooltip attached directly to shadowRoot (avoids overflow clipping)
    floatingTooltip = document.createElement('div');
    floatingTooltip.className = 'is-floating-tooltip';
    floatingTooltip.style.display = 'none';
    shadowRoot.appendChild(floatingTooltip);

    // Create unified Flying Toolbar (shown only when text is selected)
    flyingToolbar = document.createElement('div');
    flyingToolbar.className = 'helper-flying-toolbar';
    flyingToolbar.style.display = 'none';
    shadowRoot.appendChild(flyingToolbar);

    rebuildFlyingToolbar();

    const targetContainer = document.body || document.documentElement;
    targetContainer.appendChild(hostElement);
  }

  /**
   * Displays the floating tooltip immediately above the specified mark without clipping.
   */
  function showFloatingTooltip(mark, replacementWord) {
    if (!floatingTooltip || !isEnabledOnThisPage) return;
    floatingTooltip.textContent = `Click to replace with '${replacementWord}'`;
    floatingTooltip.style.display = 'block';

    const markRect = mark.getBoundingClientRect();
    const tooltipRect = floatingTooltip.getBoundingClientRect();

    // Position centered above the mark; flip below if too close to viewport top
    let top = markRect.top - tooltipRect.height - 6;
    if (top < 4) {
      top = markRect.bottom + 6;
    }

    let left = markRect.left + (markRect.width / 2) - (tooltipRect.width / 2);
    if (left < 6) left = 6;
    const maxLeft = window.innerWidth - tooltipRect.width - 6;
    if (left > maxLeft) left = maxLeft;

    floatingTooltip.style.top = `${top}px`;
    floatingTooltip.style.left = `${left}px`;
    floatingTooltip.classList.add('is-tooltip-visible');
  }

  /**
   * Hides the floating tooltip immediately.
   */
  function hideFloatingTooltip() {
    if (!floatingTooltip) return;
    floatingTooltip.classList.remove('is-tooltip-visible');
    floatingTooltip.style.display = 'none';
  }

  /**
   * Checks if text contains redacted or truncated tokens.
   */
  function hasRedactedTokens(text) {
    if (!text || typeof text !== 'string') return false;
    return /\[(?:redacted|truncated)\]/i.test(text);
  }

  /**
   * Rebuilds the unified flying toolbar containing Transform, Shortcuts, and Unwanted Headers.
   * Group order: Transform, Shortcuts, Unwanted Headers.
   */
  function rebuildFlyingToolbar() {
    if (!flyingToolbar) return;
    flyingToolbar.innerHTML = '';

    // Group 1: Transform
    const transformGroup = document.createElement('div');
    transformGroup.className = 'helper-toolbar-group helper-toolbar-group-transform';

    const transformLabel = document.createElement('span');
    transformLabel.className = 'helper-toolbar-group-label';
    transformLabel.textContent = 'Transform';
    transformGroup.appendChild(transformLabel);

    const transformBtnsContainer = document.createElement('div');
    transformBtnsContainer.className = 'helper-toolbar-group-buttons';

    const transformConfigs = [
      { text: 'Truncate', action: 'truncate', isRed: false },
      { text: 'Redact', action: 'redact', isRed: false },
      { text: 'Red Color Truncate', action: 'red-color-truncate', isRed: true },
      { text: 'Red Color Redact', action: 'red-color-redact', isRed: true }
    ];

    transformConfigs.forEach(cfg => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'helper-bar-btn' + (cfg.isRed ? ' helper-bar-btn-red' : '');
      btn.textContent = cfg.text;
      btn.dataset.action = cfg.action;
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleSelectionTransformation(cfg.action);
      });
      transformBtnsContainer.appendChild(btn);
    });
    transformGroup.appendChild(transformBtnsContainer);
    flyingToolbar.appendChild(transformGroup);

    // Group 2: Shortcuts
    if (isShortcutsEnabledOnSite && Array.isArray(activeShortcuts) && activeShortcuts.length > 0) {
      const shortcutsGroup = document.createElement('div');
      shortcutsGroup.className = 'helper-toolbar-group helper-toolbar-group-shortcuts';

      const shortcutsLabel = document.createElement('span');
      shortcutsLabel.className = 'helper-toolbar-group-label';
      shortcutsLabel.textContent = 'Shortcuts';
      shortcutsGroup.appendChild(shortcutsLabel);

      const shortcutsBtnsContainer = document.createElement('div');
      shortcutsBtnsContainer.className = 'helper-toolbar-group-buttons';

      activeShortcuts.forEach(sc => {
        const scBtn = document.createElement('button');
        scBtn.type = 'button';
        scBtn.className = 'helper-flying-shortcut-btn';
        scBtn.textContent = sc.name;
        scBtn.title = `Run ${sc.name} (${sc.keys})`;
        scBtn.addEventListener('mousedown', (e) => e.preventDefault());
        scBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targetEl = activeFocusedElement || document.activeElement;
          if (targetEl) {
            executeShortcutOnElement(targetEl, sc);
          }
        });
        shortcutsBtnsContainer.appendChild(scBtn);
      });
      shortcutsGroup.appendChild(shortcutsBtnsContainer);
      flyingToolbar.appendChild(shortcutsGroup);
    }

    // Group 3: Unwanted Headers
    const headersGroup = document.createElement('div');
    headersGroup.className = 'helper-toolbar-group helper-toolbar-group-headers';

    const headersLabel = document.createElement('span');
    headersLabel.className = 'helper-toolbar-group-label';
    headersLabel.textContent = 'Unwanted Headers';
    headersGroup.appendChild(headersLabel);

    const headersBtnsContainer = document.createElement('div');
    headersBtnsContainer.className = 'helper-toolbar-group-buttons';

    const removeHeadersBtn = document.createElement('button');
    removeHeadersBtn.type = 'button';
    removeHeadersBtn.className = 'helper-flying-header-btn';
    removeHeadersBtn.textContent = 'Remove Unwanted Headers';
    removeHeadersBtn.title = 'Strip sec-fetch-*, sec-ch-ua-*, and other configured unwanted headers from this text field';
    removeHeadersBtn.addEventListener('mousedown', (e) => e.preventDefault());
    removeHeadersBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetEl = activeFocusedElement || document.activeElement;
      if (targetEl) {
        removeUnwantedHeadersFromElement(targetEl);
      }
    });
    headersBtnsContainer.appendChild(removeHeadersBtn);
    headersGroup.appendChild(headersBtnsContainer);
    flyingToolbar.appendChild(headersGroup);
  }

  /**
   * Positions and displays the unified flying toolbar above the selected text.
   */
  function showFlyingToolbar(element) {
    if (!flyingToolbar || !isEnabledOnThisPage || !isElementVisible(element)) {
      hideFlyingToolbar();
      return;
    }

    flyingToolbar.style.display = 'flex';
    const barRect = flyingToolbar.getBoundingClientRect();

    let top = 0;
    let left = 0;

    const sel = window.getSelection();
    let selRect = null;
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      try {
        const r = sel.getRangeAt(0);
        const rect = r.getBoundingClientRect();
        if (rect && (rect.width > 0 || rect.height > 0)) {
          selRect = rect;
        }
      } catch (e) {
        // Fallback to element rect
      }
    }

    const elemRect = element.getBoundingClientRect();
    const anchorRect = selRect || elemRect;

    top = anchorRect.top - barRect.height - 8;
    if (top < 6) {
      top = anchorRect.bottom + 8;
    }

    left = anchorRect.left;
    if (left < 6) left = 6;
    if (left + barRect.width > window.innerWidth - 6) {
      left = window.innerWidth - barRect.width - 6;
    }

    flyingToolbar.style.top = `${top}px`;
    flyingToolbar.style.left = `${left}px`;
  }

  /**
   * Hides the unified flying toolbar.
   */
  function hideFlyingToolbar() {
    if (flyingToolbar) {
      flyingToolbar.style.display = 'none';
    }
  }

  /**
   * Checks if text is selected in the element and shows the unified flying toolbar.
   * If no text is selected, the toolbar remains hidden.
   */
  function checkAndShowFlyingToolbar(element) {
    if (!flyingToolbar || !isEnabledOnThisPage || !element) {
      hideFlyingToolbar();
      return;
    }
    const selectedText = getSelectedText(element);
    if (!selectedText || selectedText.trim().length === 0) {
      hideFlyingToolbar();
      return;
    }
    showFlyingToolbar(element);
  }

  /**
   * Matches a line of text against an unwanted header pattern (supports prefix wildcards like sec-fetch-* and base headers like sec-ch-ua).
   * Ensures markdown formatting, code fences, and non-header lines are never matched.
   */
  function matchesHeaderPattern(line, pattern) {
    if (!line || !pattern) return false;
    const trimmed = line.trim();

    // A valid HTTP header line MUST contain a colon ':' separating the header name and value
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) return false;

    // Never match markdown fences or markdown headings
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~') || trimmed.startsWith('#')) return false;

    // The header name before the colon must be a valid HTTP header token (alphanumeric, hyphens, underscores)
    const headerName = trimmed.slice(0, colonIdx).trim().toLowerCase();
    if (!headerName || !/^[a-zA-Z0-9_\-]+$/.test(headerName)) return false;

    const cleanPat = pattern.trim().toLowerCase().replace(/:$/, '');
    if (cleanPat.endsWith('*')) {
      const prefix = cleanPat.slice(0, -1);
      const prefixWithoutDash = prefix.endsWith('-') ? prefix.slice(0, -1) : prefix;
      return headerName.startsWith(prefix) || headerName === prefixWithoutDash;
    }
    return headerName === cleanPat;
  }

  /**
   * Helper to collect all text nodes under a root DOM node.
   */
  function getTextNodesUnder(node) {
    const textNodes = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
    let n;
    while ((n = walker.nextNode())) {
      textNodes.push(n);
    }
    return textNodes;
  }

  /**
   * Removes unwanted header lines from a contentEditable element without destroying its Markdown/DOM structure.
   */
  function removeUnwantedHeadersFromDOM(root, patterns) {
    let removedCount = 0;
    const allTextNodes = getTextNodesUnder(root);

    for (const tn of allTextNodes) {
      const val = tn.nodeValue;
      if (!val) continue;

      if (val.includes('\n')) {
        const lines = val.split(/\r?\n/);
        const filtered = [];
        for (const line of lines) {
          if (patterns.some(pat => matchesHeaderPattern(line, pat))) {
            removedCount++;
          } else {
            filtered.push(line);
          }
        }
        if (filtered.length !== lines.length) {
          tn.nodeValue = filtered.join('\n');
        }
      } else {
        const line = val.trim();
        if (patterns.some(pat => matchesHeaderPattern(line, pat))) {
          removedCount++;
          const parent = tn.parentElement;
          if (parent && parent !== root && parent.childNodes.length === 1 && (parent.tagName === 'DIV' || parent.tagName === 'P' || parent.tagName === 'LI')) {
            parent.remove();
          } else {
            tn.nodeValue = '';
          }
        }
      }
    }

    return removedCount;
  }

  /**
   * Removes all lines matching configured unwanted headers from the element.
   * Completely preserves Markdown and code block formatting.
   */
  function removeUnwantedHeadersFromElement(element) {
    if (!element) return;
    const patterns = (activeUnwantedHeaders && activeUnwantedHeaders.length > 0)
      ? activeUnwantedHeaders
      : [
          'sec-fetch-*',
          'sec-ch-ua-*',
          'X-pwnfox-color',
          'Accept-Language',
          'Upgrade-Insecure-Requests',
          'Priority',
          'Accept-Encoding'
        ];

    if (element.isContentEditable) {
      const removedCount = removeUnwantedHeadersFromDOM(element, patterns);
      if (removedCount > 0) {
        element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        updateOverlayForElement(element);
        showTemporaryStatusFeedback(`Removed ${removedCount} unwanted header line${removedCount === 1 ? '' : 's'}`);
      } else {
        showTemporaryStatusFeedback('No unwanted headers found');
      }
      return;
    }

    const currentText = getElementText(element);
    const lines = currentText.split(/\r?\n/);
    let removedCount = 0;
    const filteredLines = lines.filter(line => {
      const isUnwanted = patterns.some(pat => matchesHeaderPattern(line, pat));
      if (isUnwanted) removedCount++;
      return !isUnwanted;
    });

    if (removedCount > 0) {
      const newText = filteredLines.join('\n');
      setNativeValue(element, newText);
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      updateOverlayForElement(element);
      showTemporaryStatusFeedback(`Removed ${removedCount} unwanted header line${removedCount === 1 ? '' : 's'}`);
    } else {
      showTemporaryStatusFeedback('No unwanted headers found');
    }
  }

  /**
   * Executes a keyboard shortcut or action on the active element.
   */
  async function executeShortcutOnElement(element, shortcut) {
    if (!element || !shortcut || !shortcut.keys) return;
    element.focus();
    const keyLower = shortcut.keys.toLowerCase().replace(/\s+/g, '');

    if (keyLower.includes('ctrl+c') || keyLower === 'copy') {
      try {
        const selText = getSelectedText(element);
        if (selText) {
          await navigator.clipboard.writeText(selText);
          showTemporaryStatusFeedback('Copied to clipboard');
        } else {
          document.execCommand('copy');
        }
      } catch (err) {
        document.execCommand('copy');
      }
      return;
    }

    if (keyLower.includes('ctrl+v') || keyLower === 'paste') {
      try {
        const clipText = await navigator.clipboard.readText();
        if (clipText) {
          pasteTextIntoActiveElement(clipText);
          showTemporaryStatusFeedback('Pasted from clipboard');
        }
      } catch (err) {
        document.execCommand('paste');
      }
      return;
    }

    if (keyLower.includes('ctrl+a') || keyLower === 'selectall') {
      if (typeof element.select === 'function') {
        element.select();
      } else {
        document.execCommand('selectAll');
      }
      return;
    }

    if (keyLower.includes('ctrl+z') || keyLower === 'undo') {
      document.execCommand('undo');
      element.dispatchEvent(new Event('input', { bubbles: true }));
      updateOverlayForElement(element);
      return;
    }

    // Generic key event simulation
    const parts = keyLower.split('+');
    const mainKey = parts[parts.length - 1];
    const hasCtrl = parts.includes('ctrl');
    const hasShift = parts.includes('shift');
    const hasAlt = parts.includes('alt');

    const eventOpts = {
      key: mainKey,
      code: 'Key' + mainKey.toUpperCase(),
      ctrlKey: hasCtrl,
      shiftKey: hasShift,
      altKey: hasAlt,
      bubbles: true,
      cancelable: true
    };

    element.dispatchEvent(new KeyboardEvent('keydown', eventOpts));
    element.dispatchEvent(new KeyboardEvent('keypress', eventOpts));
    element.dispatchEvent(new KeyboardEvent('keyup', eventOpts));
  }

  /**
   * Gets selected text from element or window selection.
   */
  function getSelectedText(element) {
    if (element && (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT')) {
      if (typeof element.selectionStart === 'number' && typeof element.selectionEnd === 'number') {
        return element.value.substring(element.selectionStart, element.selectionEnd);
      }
    }
    const sel = window.getSelection();
    return sel ? sel.toString() : '';
  }

  /**
   * Handles Universal Selection Transformation directly on selected text.
   * Preserves surrounding line breaks, markdown, and never modifies the next line.
   */
  function handleSelectionTransformation(action) {
    const el = activeFocusedElement || document.activeElement;
    if (!el) return;

    const mode = (action === 'truncate' || action === 'red-color-truncate') ? 'truncate' : 'redact';
    const useRed = (action === 'red-color-truncate' || action === 'red-color-redact');

    if (el.tagName && (el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'input')) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (typeof start !== 'number' || typeof end !== 'number' || start === end) return;

      const val = el.value;
      const rawSelected = val.substring(start, end);

      // Separate any leading and trailing line breaks or whitespace so they are never redacted
      const leadingMatch = rawSelected.match(/^[\r\n\s]*/);
      const leadingWs = leadingMatch ? leadingMatch[0] : '';
      const trailingMatch = rawSelected.match(/[\r\n\s]*$/);
      const trailingWs = trailingMatch ? trailingMatch[0] : '';

      const targetText = rawSelected.substring(leadingWs.length, rawSelected.length - trailingWs.length);
      if (!targetText) return;

      const tag = (mode === 'truncate') ? '[truncated]' : '[redacted]';
      let transformed;
      if (targetText.includes('\n')) {
        const lines = targetText.split(/\r?\n/);
        transformed = lines.map(line => {
          const lMatch = line.match(/^\s*/)[0];
          const tMatch = line.match(/\s*$/)[0];
          const core = line.substring(lMatch.length, line.length - tMatch.length);
          if (!core) return line;
          const trCore = core.length <= 6 ? tag : (core.slice(0, 3) + tag + core.slice(-3));
          return lMatch + trCore + tMatch;
        }).join('\n');
      } else {
        transformed = targetText.length <= 6 ? tag : (targetText.slice(0, 3) + tag + targetText.slice(-3));
      }

      const actualStart = start + leadingWs.length;
      const actualEnd = end - trailingWs.length;
      const newVal = val.slice(0, actualStart) + transformed + val.slice(actualEnd);
      setNativeValue(el, newVal);
      el.selectionStart = actualStart;
      el.selectionEnd = actualStart + transformed.length;

      const record = trackedElements.get(el);
      if (record) {
        if (!record.redTokens) record.redTokens = new Set();
        if (useRed) {
          record.redTokens.add(actualStart);
          record.useRed = true;
        }
      }

      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      updateOverlayForElement(el);
      hideFlyingToolbar();
    } else if (el.isContentEditable || window.getSelection()) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

      const range = sel.getRangeAt(0);
      const rawSelected = range.toString();
      if (!rawSelected) return;

      const leadingMatch = rawSelected.match(/^[\r\n\s]*/);
      const leadingWs = leadingMatch ? leadingMatch[0] : '';
      const trailingMatch = rawSelected.match(/[\r\n\s]*$/);
      const trailingWs = trailingMatch ? trailingMatch[0] : '';

      const targetText = rawSelected.substring(leadingWs.length, rawSelected.length - trailingWs.length);
      if (!targetText) return;

      let first3 = '';
      let last3 = '';
      const tag = (mode === 'truncate') ? '[truncated]' : '[redacted]';
      if (targetText.length > 6) {
        first3 = targetText.slice(0, 3);
        last3 = targetText.slice(-3);
      }

      const frag = document.createDocumentFragment();
      if (leadingWs) {
        frag.appendChild(document.createTextNode(leadingWs));
      }

      if (useRed) {
        const span = document.createElement('span');
        if (first3) {
          const f3Span = document.createElement('span');
          f3Span.style.color = '#dc2626';
          f3Span.style.fontWeight = 'bold';
          f3Span.textContent = first3;
          span.appendChild(f3Span);
        }
        const b = document.createElement('b');
        b.textContent = tag;
        span.appendChild(b);
        if (last3) {
          const l3Span = document.createElement('span');
          l3Span.style.color = '#dc2626';
          l3Span.style.fontWeight = 'bold';
          l3Span.textContent = last3;
          span.appendChild(l3Span);
        }
        frag.appendChild(span);
      } else {
        const fullTag = first3 ? (first3 + tag + last3) : tag;
        frag.appendChild(document.createTextNode(fullTag));
      }

      if (trailingWs) {
        frag.appendChild(document.createTextNode(trailingWs));
      }

      range.deleteContents();
      range.insertNode(frag);
      sel.removeAllRanges();
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      updateOverlayForElement(el);
      hideFlyingToolbar();
    }
  }

  /**
   * Inserts text directly into the active field and dispatches events.
   */
  function pasteTextIntoActiveElement(text) {
    const el = (lastContextMenuTarget && isValidTextField(lastContextMenuTarget))
      ? lastContextMenuTarget
      : ((activeFocusedElement && isValidTextField(activeFocusedElement))
        ? activeFocusedElement
        : (isValidTextField(document.activeElement) ? document.activeElement : null));

    if (!el) return;

    if (el.tagName && (el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'input')) {
      const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
      const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
      const val = el.value || '';
      const newVal = val.slice(0, start) + text + val.slice(end);
      setNativeValue(el, newVal);
      el.selectionStart = el.selectionEnd = start + text.length;
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      updateOverlayForElement(el);
    } else if (el.isContentEditable) {
      el.focus();
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      updateOverlayForElement(el);
    }
  }

  function showTemporaryStatusFeedback(msg) {
    if (!floatingTooltip) return;
    floatingTooltip.textContent = msg;
    floatingTooltip.style.display = 'block';
    floatingTooltip.classList.add('is-tooltip-visible');
    if (activeFocusedElement) {
      const rect = activeFocusedElement.getBoundingClientRect();
      floatingTooltip.style.top = `${Math.max(6, rect.top - 28)}px`;
      floatingTooltip.style.left = `${Math.max(6, rect.left + 10)}px`;
    }
    setTimeout(() => {
      hideFloatingTooltip();
    }, 2000);
  }

  /**
   * Activates extension functionality.
   */
  function activateExtension() {
    isEnabledOnThisPage = true;
    setupShadowRoot();

    // Initialize ResizeObserver
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target;
        if (trackedElements.has(el)) {
          updateOverlayForElement(el);
        }
      }
    });

    // Scan existing fields in DOM (including open Shadow Roots)
    scanAllFields();

    // Observe dynamically added fields
    mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            scanElementAndChildren(node);
          }
        }
        for (const node of mutation.removedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            cleanupRemovedNode(node);
          }
        }
      }
    });

    mutationObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    // Window and document event listeners for position and typing updates
    window.addEventListener('scroll', handleGlobalScroll, { capture: true, passive: true });
    window.addEventListener('resize', handleGlobalResize, { passive: true });
    document.addEventListener('input', handleGlobalInputEvent, { capture: true, passive: true });
    document.addEventListener('keyup', handleGlobalInputEvent, { capture: true, passive: true });
    document.addEventListener('change', handleGlobalInputEvent, { capture: true, passive: true });
    document.addEventListener('focusin', handleGlobalInputEvent, { capture: true, passive: true });
    document.addEventListener('selectionchange', handleGlobalSelectionChange, { passive: true });
    document.addEventListener('contextmenu', handleGlobalContextMenu, true);
  }

  function handleGlobalSelectionChange() {
    const el = activeFocusedElement || document.activeElement;
    if (el && isValidTextField(el)) {
      checkAndShowFlyingToolbar(el);
    } else {
      hideFlyingToolbar();
    }
  }

  function handleGlobalContextMenu(e) {
    lastContextMenuTarget = e.target;
  }

  /**
   * Deactivates extension and cleans up overlays and listeners.
   */
  function deactivateExtension() {
    isEnabledOnThisPage = false;

    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    window.removeEventListener('scroll', handleGlobalScroll, true);
    window.removeEventListener('resize', handleGlobalResize);
    document.removeEventListener('input', handleGlobalInputEvent, true);
    document.removeEventListener('keyup', handleGlobalInputEvent, true);
    document.removeEventListener('change', handleGlobalInputEvent, true);
    document.removeEventListener('focusin', handleGlobalInputEvent, true);
    document.removeEventListener('selectionchange', handleGlobalSelectionChange);
    document.removeEventListener('contextmenu', handleGlobalContextMenu, true);

    // Remove all overlays
    for (const [el, record] of trackedElements.entries()) {
      if (record.overlay && record.overlay.parentNode) {
        record.overlay.remove();
      }
      removeElementListeners(el, record);
    }
    trackedElements.clear();

    hideFloatingTooltip();
    hideFlyingToolbar();
    floatingTooltip = null;
    flyingToolbar = null;
    activeFocusedElement = null;

    if (hostElement && hostElement.parentNode) {
      hostElement.remove();
      hostElement = null;
      shadowRoot = null;
    }
  }

  /**
   * Determines if an element is a valid text field or editable area.
   */
  function isValidTextField(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const tag = el.tagName.toLowerCase();

    if (tag === 'textarea') {
      return !el.disabled && !el.readOnly;
    }

    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      return SUPPORTED_INPUT_TYPES.has(type) && !el.disabled && !el.readOnly;
    }

    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '') {
      return true;
    }

    return false;
  }

  /**
   * Gets text from an input, textarea, or contenteditable element.
   */
  function getElementText(el) {
    if (!el) return '';
    if (el.isContentEditable) {
      return el.innerText || el.textContent || '';
    }
    return el.value || '';
  }

  /**
   * Traverses a root element and recursively inspects child nodes and open Shadow Roots.
   */
  function findAllFieldsDeep(root) {
    const fields = [];
    function traverse(node) {
      if (!node) return;
      if (node !== root && isValidTextField(node)) {
        fields.push(node);
      }
      if (node.shadowRoot) {
        traverse(node.shadowRoot);
      }
      const children = node.children || [];
      for (let i = 0; i < children.length; i++) {
        traverse(children[i]);
      }
    }
    traverse(root);
    return fields;
  }

  /**
   * Scans document for all valid text fields and updates overlays.
   */
  function scanAllFields() {
    const fields = findAllFieldsDeep(document.body || document.documentElement);
    fields.forEach((el) => {
      registerField(el);
    });

    for (const el of trackedElements.keys()) {
      updateOverlayForElement(el);
    }
  }

  /**
   * Scans a newly added element and its descendants.
   */
  function scanElementAndChildren(root) {
    if (isValidTextField(root)) {
      registerField(root);
    }
    const descendants = findAllFieldsDeep(root);
    descendants.forEach((el) => {
      registerField(el);
    });
  }

  /**
   * Cleans up overlays for removed nodes.
   */
  function cleanupRemovedNode(root) {
    if (trackedElements.has(root)) {
      unregisterField(root);
    }
    for (const [el] of trackedElements) {
      if (!document.contains(el)) {
        unregisterField(el);
      }
    }
  }

  /**
   * Registers and attaches listeners to an input, textarea, or contenteditable element.
   */
  function registerField(element) {
    if (trackedElements.has(element)) return;

    const onUpdate = () => {
      updateOverlayForElement(element);
      if (document.activeElement === element) {
        checkAndShowFlyingToolbar(element);
      }
    };

    const onScroll = () => {
      syncScroll(element);
      if (activeFocusedElement === element) {
        if (flyingToolbar && flyingToolbar.style.display !== 'none') {
          showFlyingToolbar(element);
        }
      }
    };

    const onFocus = () => {
      activeFocusedElement = element;
      checkAndShowFlyingToolbar(element);
    };

    const onSelectionChange = () => {
      if (activeFocusedElement === element) {
        checkAndShowFlyingToolbar(element);
      }
    };

    const onBlur = () => {
      setTimeout(() => {
        if (activeFocusedElement === element && document.activeElement !== element) {
          hideFlyingToolbar();
        }
      }, 250);
    };

    element.addEventListener('input', onUpdate);
    element.addEventListener('keyup', onUpdate);
    element.addEventListener('change', onUpdate);
    element.addEventListener('paste', onUpdate);
    element.addEventListener('focus', onFocus);
    element.addEventListener('click', onFocus);
    element.addEventListener('mouseup', onSelectionChange);
    element.addEventListener('select', onSelectionChange);
    element.addEventListener('blur', onBlur);
    element.addEventListener('scroll', onScroll, { passive: true });

    const record = {
      overlay: null,
      onUpdate,
      onScroll,
      onFocus,
      onSelectionChange,
      onBlur,
      useRed: false
    };

    trackedElements.set(element, record);
    if (resizeObserver) {
      resizeObserver.observe(element);
    }

    // Initial overlay update and checks
    updateOverlayForElement(element);
    if (document.activeElement === element) {
      activeFocusedElement = element;
      checkAndShowFlyingToolbar(element);
    }
  }

  /**
   * Removes element tracking and overlay.
   */
  function unregisterField(element) {
    const record = trackedElements.get(element);
    if (!record) return;

    if (activeFocusedElement === element) {
      hideFlyingToolbar();
      activeFocusedElement = null;
    }

    if (resizeObserver) {
      resizeObserver.unobserve(element);
    }
    removeElementListeners(element, record);

    if (record.overlay && record.overlay.parentNode) {
      record.overlay.remove();
    }
    trackedElements.delete(element);
  }

  function removeElementListeners(element, record) {
    element.removeEventListener('input', record.onUpdate);
    element.removeEventListener('keyup', record.onUpdate);
    element.removeEventListener('change', record.onUpdate);
    element.removeEventListener('paste', record.onUpdate);
    if (record.onFocus) {
      element.removeEventListener('focus', record.onFocus);
      element.removeEventListener('click', record.onFocus);
    }
    if (record.onSelectionChange) {
      element.removeEventListener('mouseup', record.onSelectionChange);
      element.removeEventListener('select', record.onSelectionChange);
    }
    if (record.onBlur) {
      element.removeEventListener('blur', record.onBlur);
    }
    element.removeEventListener('scroll', record.onScroll);
  }

  /**
   * Global capture listener ensuring modern frameworks (Material UI, React, etc.)
   * trigger overlay updates even if bubbling is intercepted.
   */
  function handleGlobalInputEvent(e) {
    if (!isEnabledOnThisPage) return;
    const target = e.target;
    if (isValidTextField(target)) {
      if (!trackedElements.has(target)) {
        registerField(target);
      } else {
        updateOverlayForElement(target);
      }
      activeFocusedElement = target;
      checkAndShowFlyingToolbar(target);
    }
  }

  /**
   * Checks if an element is currently visible in the DOM.
   */
  function isElementVisible(el) {
    if (!document.contains(el)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  /**
   * Synchronizes the overlay scroll position with the input/textarea.
   */
  function syncScroll(element) {
    const record = trackedElements.get(element);
    if (!record || !record.overlay) return;
    record.overlay.scrollLeft = element.scrollLeft;
    record.overlay.scrollTop = element.scrollTop;
  }

  /**
   * Updates or creates the highlight overlay for a target element.
   */
  function updateOverlayForElement(element) {
    if (!isEnabledOnThisPage || !shadowRoot) return;

    const record = trackedElements.get(element);
    if (!record) return;

    if (!isElementVisible(element)) {
      if (record.overlay) {
        record.overlay.style.display = 'none';
      }
      return;
    }

    const text = getElementText(element);
    const scanResult = TextScanner.scanTextWithRules(text, activeRules);
    const hasRedacted = hasRedactedTokens(text);

    if (!scanResult.hasMatches && !hasRedacted) {
      if (record.overlay) {
        record.overlay.style.display = 'none';
      }
      return;
    }

    // Ensure overlay exists
    if (!record.overlay) {
      const overlay = document.createElement('div');
      overlay.className = 'is-overlay-container';
      shadowRoot.appendChild(overlay);
      record.overlay = overlay;
    }

    const overlay = record.overlay;

    // Copy computed styles and viewport-based positioning
    syncOverlayStylesAndPosition(element, overlay);

    overlay.style.display = 'block';

    // Build highlight DOM contents
    renderOverlayContent(element, overlay, text, scanResult);

    // Synchronize scroll
    overlay.scrollLeft = element.scrollLeft;
    overlay.scrollTop = element.scrollTop;
  }

  /**
   * Copies relevant layout and typography styles from element to overlay using viewport coordinates.
   */
  function syncOverlayStylesAndPosition(element, overlay) {
    const rect = element.getBoundingClientRect();
    const computed = window.getComputedStyle(element);
    const isMultiLine = element.tagName.toLowerCase() === 'textarea' || element.isContentEditable;

    // Viewport-relative positioning
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    // Box model
    overlay.style.boxSizing = computed.boxSizing;
    overlay.style.paddingTop = computed.paddingTop;
    overlay.style.paddingRight = computed.paddingRight;
    overlay.style.paddingBottom = computed.paddingBottom;
    overlay.style.paddingLeft = computed.paddingLeft;
    overlay.style.borderTopWidth = computed.borderTopWidth;
    overlay.style.borderRightWidth = computed.borderRightWidth;
    overlay.style.borderBottomWidth = computed.borderBottomWidth;
    overlay.style.borderLeftWidth = computed.borderLeftWidth;
    overlay.style.borderStyle = 'solid';
    overlay.style.borderColor = 'transparent';

    // Typography
    overlay.style.fontFamily = computed.fontFamily;
    overlay.style.fontSize = computed.fontSize;
    overlay.style.fontWeight = computed.fontWeight;
    overlay.style.fontStyle = computed.fontStyle;
    overlay.style.fontVariant = computed.fontVariant;
    overlay.style.lineHeight = computed.lineHeight;
    overlay.style.letterSpacing = computed.letterSpacing;
    overlay.style.wordSpacing = computed.wordSpacing;
    overlay.style.textTransform = computed.textTransform;
    overlay.style.textIndent = computed.textIndent;
    overlay.style.direction = computed.direction;

    // Text wrapping
    if (isMultiLine) {
      overlay.style.whiteSpace = 'pre-wrap';
      overlay.style.wordBreak = 'break-word';
      overlay.style.overflowWrap = 'break-word';
    } else {
      overlay.style.whiteSpace = 'pre';
      overlay.style.wordBreak = 'normal';
      overlay.style.overflowWrap = 'normal';
    }

    return true;
  }

  /**
   * Renders the mirrored transparent text with underlined yellow marks for "is" or "are"
   * as well as bold redacted tags and red endpoint highlights.
   */
  function renderOverlayContent(element, overlay, text, scanResult) {
    overlay.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const record = trackedElements.get(element);
    const useRed = record ? Boolean(record.useRed) : false;

    // Collect all highlight markers
    const markers = [];

    // Replacer matches
    if (scanResult && Array.isArray(scanResult.allMatches)) {
      for (const m of scanResult.allMatches) {
        markers.push({
          start: m.start,
          end: m.end,
          type: 'replacer',
          word: m.word,
          replacement: m.replacement
        });
      }
    }

    // Redaction and Truncation matches
    const tokenRegex = /(\[redacted\]|\[truncated\])/gi;
    let match;
    while ((match = tokenRegex.exec(text)) !== null) {
      const tokenStart = match.index;
      const tokenEnd = tokenStart + match[0].length;

      const isTokenRed = (record && record.redTokens) ? record.redTokens.has(tokenStart) : useRed;
      if (isTokenRed) {
        const first3Start = Math.max(0, tokenStart - 3);
        const first3End = tokenStart;
        if (first3End > first3Start) {
          markers.push({
            start: first3Start,
            end: first3End,
            type: 'endpoint-red',
            text: text.substring(first3Start, first3End)
          });
        }

        markers.push({
          start: tokenStart,
          end: tokenEnd,
          type: 'redacted-tag',
          text: match[0]
        });

        const last3Start = tokenEnd;
        const last3End = Math.min(text.length, tokenEnd + 3);
        if (last3End > last3Start) {
          markers.push({
            start: last3Start,
            end: last3End,
            type: 'endpoint-red',
            text: text.substring(last3Start, last3End)
          });
        }
      } else {
        markers.push({
          start: tokenStart,
          end: tokenEnd,
          type: 'redacted-tag',
          text: match[0]
        });
      }
    }

    // Sort markers by start index
    markers.sort((a, b) => a.start - b.start || (a.type === 'redacted-tag' ? -1 : 1));

    let currentIndex = 0;
    for (const marker of markers) {
      if (marker.start < currentIndex) {
        continue;
      }

      if (marker.start > currentIndex) {
        const precedingText = text.substring(currentIndex, marker.start);
        fragment.appendChild(document.createTextNode(precedingText));
      }

      if (marker.type === 'replacer') {
        const mark = document.createElement('mark');
        mark.className = 'is-highlight-word';
        mark.dataset.start = String(marker.start);
        mark.dataset.end = String(marker.end);
        mark.dataset.word = marker.word;
        mark.dataset.replacement = marker.replacement;
        mark.dataset.elementId = element.id || '';
        mark.title = `Click to replace with '${marker.replacement}'`;
        mark.appendChild(document.createTextNode(marker.word));

        mark.addEventListener('mousedown', (e) => e.preventDefault());
        mark.addEventListener('mouseenter', () => showFloatingTooltip(mark, marker.replacement));
        mark.addEventListener('mouseleave', () => hideFloatingTooltip());
        mark.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          hideFloatingTooltip();
          handleWordReplacement(element, marker.start, marker.end, marker.replacement);
        });
        fragment.appendChild(mark);
      } else if (marker.type === 'redacted-tag') {
        const b = document.createElement('b');
        b.className = 'helper-redacted-tag';
        b.appendChild(document.createTextNode(marker.text));
        fragment.appendChild(b);
      } else if (marker.type === 'endpoint-red') {
        const span = document.createElement('span');
        span.className = 'helper-redacted-endpoint-red';
        span.appendChild(document.createTextNode(marker.text));
        fragment.appendChild(span);
      }

      currentIndex = marker.end;
    }

    if (currentIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(currentIndex)));
    }

    overlay.appendChild(fragment);
  }

  /**
   * Sets value on input/textarea using prototype descriptor so reactive frameworks detect it.
   */
  function setNativeValue(element, value) {
    if (element.isContentEditable) {
      element.innerText = value;
      return;
    }

    const isTextArea = element.tagName.toLowerCase() === 'textarea';
    const prototype = isTextArea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  /**
   * Handles replacement of targeted word at specified index.
   */
  function handleWordReplacement(element, start, end, targetReplacement) {
    hideFloatingTooltip();
    const currentText = getElementText(element);

    let targetStart = start;
    let targetEnd = end;
    let replacement = targetReplacement;

    // Verify word at target position or find closest match
    const res = TextScanner.scanTextWithRules(currentText, activeRules);
    const closest = res.allMatches.find((m) => Math.abs(m.start - start) < 10);
    if (closest) {
      targetStart = closest.start;
      targetEnd = closest.end;
      if (!replacement) {
        replacement = closest.replacement;
      }
    } else if (!replacement) {
      updateOverlayForElement(element);
      return;
    }

    const { newText, nextCursorPos } = TextScanner.replaceWordAt(currentText, targetStart, targetEnd, replacement);

    // Apply native value change
    setNativeValue(element, newText);

    // Dispatch standard input and change events
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    // Restore focus and cursor position
    try {
      element.focus();
      if (typeof element.setSelectionRange === 'function') {
        element.setSelectionRange(nextCursorPos, nextCursorPos);
      }
    } catch (err) {
      // Ignore if element cannot set selection range
    }

    // Re-render overlay immediately
    updateOverlayForElement(element);
  }

  /**
   * Repositions all overlays on viewport scroll or resize.
   */
  function handleGlobalScroll() {
    if (!isEnabledOnThisPage) return;
    hideFloatingTooltip();
    for (const [el, record] of trackedElements.entries()) {
      if (record.overlay && record.overlay.style.display !== 'none') {
        syncOverlayStylesAndPosition(el, record.overlay);
        syncScroll(el);
      }
    }
  }

  function handleGlobalResize() {
    if (!isEnabledOnThisPage) return;
    hideFloatingTooltip();
    for (const [el] of trackedElements.entries()) {
      updateOverlayForElement(el);
    }
  }

  /**
   * SPA Navigation tracking (React Router, Next.js, Angular, etc.)
   */
  function checkUrlChange() {
    if (window.location.href !== lastKnownUrl) {
      lastKnownUrl = window.location.href;
      checkAllowlistAndInitialize();
      if (isEnabledOnThisPage) {
        scanAllFields();
      }
    }
  }

  window.addEventListener('popstate', checkUrlChange);
  window.addEventListener('hashchange', checkUrlChange);

  const originalPushState = history.pushState;
  if (originalPushState) {
    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      checkUrlChange();
      return result;
    };
  }

  const originalReplaceState = history.replaceState;
  if (originalReplaceState) {
    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      checkUrlChange();
      return result;
    };
  }

  // Handle messages from background service worker (e.g. direct paste from context menu)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && (message.type === 'PASTE_SNIPPET' || message.action === 'PASTE_SNIPPET')) {
      pasteTextIntoActiveElement(message.text);
      sendResponse({ success: true });
      return true;
    }
  });

  // React to storage changes in real time (e.g. user toggled whitelist, blacklist, replacer switch, shortcuts, or updated rules)
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.allowlist || changes.blacklist || changes.site_replacer_state || changes.site_shortcuts_state || changes.replacer_rules || changes.shortcuts || changes.unwanted_headers) {
      checkAllowlistAndInitialize();
    }
  });

  // Initial startup check
  checkAllowlistAndInitialize();
})();
