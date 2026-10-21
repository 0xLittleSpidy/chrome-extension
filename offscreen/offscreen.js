/**
 * Offscreen clipboard handler for Helper extension.
 * Performs clipboard writes in an isolated offscreen document.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'COPY_TO_CLIPBOARD') {
    handleClipboardWrite(message.text)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }
});

async function handleClipboardWrite(text) {
  if (typeof text !== 'string') {
    throw new Error('Clipboard text must be a string');
  }

  // Primary: navigator.clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (err) {
      // Fallback below
    }
  }

  // Fallback: document.execCommand('copy') via textarea
  const textarea = document.getElementById('clipboard-textarea');
  if (textarea) {
    textarea.value = text;
    textarea.select();
    document.execCommand('copy');
    textarea.value = '';
    return;
  }

  throw new Error('Clipboard write failed');
}
