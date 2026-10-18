/**
 * Content Script for Is-to-Was Replacer.
 * Scans textboxes and input fields on allowlisted websites for sentences containing "is",
 * highlights the word in yellow with an underline, and enables one-click replacement to "was".
 */
(function () {
  'use strict';

  // Prevent double injection
  if (window.__isToWasReplacerInjected) return;
  window.__isToWasReplacerInjected = true;
  console.log('[Is-to-Was] Content script loaded on:', window.location.href);

  let isEnabledOnThisPage = false;
  let shadowRoot = null;
  let hostElement = null;
  let resizeObserver = null;
  let mutationObserver = null;

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
      console.warn('[Is-to-Was] Failed to check allowlist:', err);
    }
  }

  /**
   * Sets up the overlay host in Shadow DOM.
   */
  function setupShadowRoot() {
    if (hostElement && shadowRoot) return;

    hostElement = document.createElement('div');
    hostElement.id = 'is-highlighter-extension-root';
    hostElement.style.cssText = 'position: absolute; top: 0; left: 0; width: 0; height: 0; pointer-events: none; z-index: 2147483640;';

    shadowRoot = hostElement.attachShadow({ mode: 'open' });

    // Fetch and inject content.css into Shadow DOM
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('content/content.css');
    shadowRoot.appendChild(link);

    const targetContainer = document.body || document.documentElement;
    targetContainer.appendChild(hostElement);
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

    // Scan existing fields in DOM
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

    // Window event listeners for position and scroll tracking
    window.addEventListener('scroll', handleGlobalScroll, { capture: true, passive: true });
    window.addEventListener('resize', handleGlobalResize, { passive: true });
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

    // Remove all overlays
    for (const [el, record] of trackedElements.entries()) {
      if (record.overlay && record.overlay.parentNode) {
        record.overlay.remove();
      }
      removeElementListeners(el, record);
    }
    trackedElements.clear();

    if (hostElement && hostElement.parentNode) {
      hostElement.remove();
      hostElement = null;
      shadowRoot = null;
    }
  }

  /**
   * Determines if an element is a valid text field.
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

    return false;
  }

  /**
   * Scans document for all valid text fields.
   */
  function scanAllFields() {
    const candidates = document.querySelectorAll('textarea, input');
    candidates.forEach((el) => {
      if (isValidTextField(el)) {
        registerField(el);
      }
    });
  }

  /**
   * Scans a newly added element and its descendants.
   */
  function scanElementAndChildren(root) {
    if (isValidTextField(root)) {
      registerField(root);
    }
    if (root.querySelectorAll) {
      const descendants = root.querySelectorAll('textarea, input');
      descendants.forEach((el) => {
        if (isValidTextField(el)) {
          registerField(el);
        }
      });
    }
  }

  /**
   * Cleans up overlays for removed nodes.
   */
  function cleanupRemovedNode(root) {
    if (trackedElements.has(root)) {
      unregisterField(root);
    }
    if (root.querySelectorAll) {
      const descendants = root.querySelectorAll('textarea, input');
      descendants.forEach((el) => {
        if (trackedElements.has(el)) {
          unregisterField(el);
        }
      });
    }
  }

  /**
   * Registers and attaches listeners to an input or textarea element.
   */
  function registerField(element) {
    if (trackedElements.has(element)) return;

    const onInput = () => updateOverlayForElement(element);
    const onScroll = () => syncScroll(element);
    const onFocus = () => updateOverlayForElement(element);

    element.addEventListener('input', onInput);
    element.addEventListener('scroll', onScroll, { passive: true });
    element.addEventListener('focus', onFocus);

    const record = {
      overlay: null,
      onInput,
      onScroll,
      onFocus
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
    element.removeEventListener('input', record.onInput);
    element.removeEventListener('scroll', record.onScroll);
    element.removeEventListener('focus', record.onFocus);
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

    const text = element.value || '';
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
    overlay.style.display = 'block';

    // Copy computed styles and positioning
    syncOverlayStylesAndPosition(element, overlay);

    // Build highlight DOM contents
    renderOverlayContent(element, overlay, text, scanResult);

    // Synchronize scroll
    overlay.scrollLeft = element.scrollLeft;
    overlay.scrollTop = element.scrollTop;
  }

  /**
   * Copies relevant layout and typography styles from element to overlay.
   */
  function syncOverlayStylesAndPosition(element, overlay) {
    const rect = element.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const computed = window.getComputedStyle(element);
    const isTextArea = element.tagName.toLowerCase() === 'textarea';

    overlay.style.top = `${rect.top + scrollY}px`;
    overlay.style.left = `${rect.left + scrollX}px`;
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
    if (isTextArea) {
      overlay.style.whiteSpace = 'pre-wrap';
      overlay.style.wordBreak = 'break-word';
      overlay.style.overflowWrap = 'break-word';
    } else {
      overlay.style.whiteSpace = 'pre';
      overlay.style.wordBreak = 'normal';
      overlay.style.overflowWrap = 'normal';
    }
  }

  /**
   * Renders the mirrored transparent text with underlined yellow marks for "is".
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
      const tooltipMsg = `Click to replace with '${match.replacement}'`;
      mark.title = tooltipMsg;
      mark.setAttribute('data-tooltip', tooltipMsg);
      mark.appendChild(document.createTextNode(match.word));

      // Prevent losing focus on mousedown
      mark.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });

      // Quick replacement on click
      mark.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
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
    const currentText = element.value || '';

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
    for (const [el, record] of trackedElements.entries()) {
      if (record.overlay && record.overlay.style.display !== 'none') {
        syncOverlayStylesAndPosition(el, record.overlay);
        syncScroll(el);
      }
    }
  }

  function handleGlobalResize() {
    if (!isEnabledOnThisPage) return;
    for (const [el] of trackedElements.entries()) {
      updateOverlayForElement(el);
    }
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
