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
  let shadowRoot = null;
  let hostElement = null;
  let floatingTooltip = null;
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
   * Initializes or tears down the extension on this page based on allowlist status.
   */
  async function checkAllowlistAndInitialize() {
    try {
      const { allowlist = [] } = await chrome.storage.sync.get(['allowlist']);
      const allowed = AllowlistUtils.isUrlAllowed(window.location.href, allowlist);

      if (allowed && !isEnabledOnThisPage) {
        activateExtension();
      } else if (!allowed && isEnabledOnThisPage) {
        deactivateExtension();
      }
    } catch (err) {
      console.warn('[Is & Are Replacer] Failed to check allowlist:', err);
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

    // Remove all overlays
    for (const [el, record] of trackedElements.entries()) {
      if (record.overlay && record.overlay.parentNode) {
        record.overlay.remove();
      }
      removeElementListeners(el, record);
    }
    trackedElements.clear();

    hideFloatingTooltip();
    floatingTooltip = null;

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
   * Scans document for all valid text fields.
   */
  function scanAllFields() {
    const fields = findAllFieldsDeep(document.body || document.documentElement);
    fields.forEach((el) => {
      registerField(el);
    });
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

    const onUpdate = () => updateOverlayForElement(element);
    const onScroll = () => syncScroll(element);

    element.addEventListener('input', onUpdate);
    element.addEventListener('keyup', onUpdate);
    element.addEventListener('change', onUpdate);
    element.addEventListener('paste', onUpdate);
    element.addEventListener('focus', onUpdate);
    element.addEventListener('scroll', onScroll, { passive: true });

    const record = {
      overlay: null,
      onUpdate,
      onScroll
    };

    trackedElements.set(element, record);
    if (resizeObserver) {
      resizeObserver.observe(element);
    }

    // Initial overlay update
    updateOverlayForElement(element);
  }

  /**
   * Removes element tracking and overlay.
   */
  function unregisterField(element) {
    const record = trackedElements.get(element);
    if (!record) return;

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
    element.removeEventListener('focus', record.onUpdate);
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
    const scanResult = TextScanner.scanText(text);

    if (!scanResult.hasMatches) {
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
   * Renders the mirrored transparent text with underlined yellow marks for "is" or "are".
   */
  function renderOverlayContent(element, overlay, text, scanResult) {
    overlay.innerHTML = '';
    const fragment = document.createDocumentFragment();
    let currentIndex = 0;

    for (const match of scanResult.allMatches) {
      // Append text preceding the match
      if (match.start > currentIndex) {
        const precedingText = text.substring(currentIndex, match.start);
        fragment.appendChild(document.createTextNode(precedingText));
      }

      // Create highlight mark for "is" or "are"
      const mark = document.createElement('mark');
      mark.className = 'is-highlight-word';
      mark.dataset.start = String(match.start);
      mark.dataset.end = String(match.end);
      mark.dataset.word = match.word;
      mark.dataset.replacement = match.replacement;
      mark.dataset.elementId = element.id || '';
      mark.title = `Click to replace with '${match.replacement}'`;
      mark.appendChild(document.createTextNode(match.word));

      // Prevent losing focus on mousedown
      mark.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });

      // Show/hide instant unclipped floating tooltip on hover
      mark.addEventListener('mouseenter', () => {
        showFloatingTooltip(mark, match.replacement);
      });
      mark.addEventListener('mouseleave', () => {
        hideFloatingTooltip();
      });

      // Quick replacement on click
      mark.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideFloatingTooltip();
        handleWordReplacement(element, match.start, match.end);
      });

      fragment.appendChild(mark);
      currentIndex = match.end;
    }

    // Append any trailing text
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
   * Handles replacement of "is" / "are" with "was" / "were" at specified index.
   */
  function handleWordReplacement(element, start, end) {
    hideFloatingTooltip();
    const currentText = getElementText(element);

    // Verify word at target position
    let targetStart = start;
    let targetEnd = end;
    const targetSlice = currentText.substring(targetStart, targetEnd);

    if (!['is', 'are'].includes(targetSlice.toLowerCase())) {
      // If text shifted slightly due to typing, re-scan to locate matching word
      const res = TextScanner.scanText(currentText);
      const closest = res.allMatches.find((m) => Math.abs(m.start - start) < 10);
      if (closest) {
        targetStart = closest.start;
        targetEnd = closest.end;
      } else {
        updateOverlayForElement(element);
        return;
      }
    }

    const { newText, nextCursorPos } = TextScanner.replaceWordAt(currentText, targetStart, targetEnd);

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

  // React to storage changes in real time (e.g. user toggled allowlist in popup)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (changes.allowlist) {
      checkAllowlistAndInitialize();
    }
  });

  // Initial startup check
  checkAllowlistAndInitialize();
})();
