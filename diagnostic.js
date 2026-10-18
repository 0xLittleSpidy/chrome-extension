/**
 * Diagnostic snippet for Is & Are Replacer Chrome Extension.
 *
 * Instructions:
 * 1. Open the target website where the extension is not functioning as expected.
 * 2. Open Developer Tools (Press F12, or Right Click -> Inspect -> Console tab).
 * 3. Copy and paste this entire script into the console and press Enter.
 * 4. Share the resulting JSON output to diagnose the issue.
 */
(() => {
  const inputs = document.querySelectorAll('textarea, input');
  const editables = document.querySelectorAll('[contenteditable="true"], [contenteditable=""], [role="textbox"]');
  const shadowHosts = Array.from(document.querySelectorAll('*')).filter(el => !!el.shadowRoot);
  const iframes = document.querySelectorAll('iframe');
  const extRoot = document.getElementById('is-highlighter-extension-root');

  const visibleInputs = Array.from(inputs).filter(el => {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  });

  const sampleInputs = visibleInputs.slice(0, 3).map(el => ({
    tagName: el.tagName,
    type: el.getAttribute('type') || 'text',
    id: el.id || '(none)',
    className: el.className || '(none)',
    readOnly: el.readOnly,
    disabled: el.disabled,
    computedPosition: window.getComputedStyle(el).position,
    valueLength: (el.value || '').length,
    sampleValue: (el.value || '').slice(0, 60)
  }));

  const sampleEditables = Array.from(editables).slice(0, 3).map(el => ({
    tagName: el.tagName,
    role: el.getAttribute('role') || '(none)',
    contentEditable: el.getAttribute('contenteditable'),
    textLength: (el.textContent || '').length,
    sampleText: (el.textContent || '').slice(0, 60)
  }));

  const result = {
    currentUrl: window.location.href,
    origin: window.location.origin,
    hostname: window.location.hostname,
    extensionOverlayRootPresent: !!extRoot,
    overlayMarksCount: extRoot && extRoot.shadowRoot ? extRoot.shadowRoot.querySelectorAll('mark.is-highlight-word').length : 0,
    totalNativeInputs: inputs.length,
    visibleNativeInputs: visibleInputs.length,
    contentEditableElements: editables.length,
    shadowRootHostsCount: shadowHosts.length,
    iframesCount: iframes.length,
    sampleVisibleInputs: sampleInputs,
    sampleContentEditables: sampleEditables
  };

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(['allowlist'], (data) => {
        result.storageAllowlist = data.allowlist || [];
        console.log('[Is & Are Replacer Diagnostic Output]:');
        console.log(JSON.stringify(result, null, 2));
      });
      return;
    }
  } catch (err) {
    result.storageError = err.message;
  }

  console.log('[Is & Are Replacer Diagnostic Output]:');
  console.log(JSON.stringify(result, null, 2));
})();
