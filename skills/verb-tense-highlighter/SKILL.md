---
name: verb-tense-highlighter
description: >-
  Develop, maintain, and test browser extensions that scan text fields, render
  pixel-aligned highlights via Shadow DOM overlays, and perform one-click text
  replacements while preserving surrounding document flow and framework state.
---

# Verb Tense Highlighter & Text Field Scanner Skill

This skill guides the design, implementation, and maintenance of Chrome extensions (Manifest V3) that inspect input fields and textareas on web pages, overlay custom highlights without DOM interference, and perform safe value replacements.

## Core Architectural Patterns

### 1. Non-Destructive Shadow DOM Overlays

Standard HTML `<input>` and `<textarea>` elements cannot contain inline markup. Never wrap inputs in container elements or alter the target element's DOM ancestry, as this breaks component trees in reactive frameworks (React, Vue, Angular, Svelte).

- Append a single host container to `document.body` or `document.documentElement`.
- Attach an open Shadow DOM root (`attachShadow({ mode: 'open' })`).
- Position overlay elements absolutely matching `getBoundingClientRect()` + `window.scrollX`/`scrollY`.
- Replicate computed typography styles: `font-family`, `font-size`, `font-weight`, `line-height`, `letter-spacing`, `word-spacing`, `text-indent`, `text-transform`.
- Replicate box model: `padding`, `border-width`, `box-sizing`.
- Synchronize scroll offsets on target scroll events:
  ```javascript
  overlay.scrollLeft = target.scrollLeft;
  overlay.scrollTop = target.scrollTop;
  ```
- Keep transparent text for regular content and highlight targets with `pointer-events: auto; cursor: pointer;`.

### 2. Sentence Segmentation and Whole-Word Matching

- Break text into sentences based on terminal punctuation (`.`, `!`, `?`, newlines, or end of input).
- Enforce strict whole-word boundaries `\b(word)\b/gi` to prevent false positive substring matches (e.g. "island", "area", "share").
- Maintain case preservation across replacements:
  - lowercase -> lowercase ("is" -> "was", "are" -> "were")
  - Capitalized -> Capitalized ("Is" -> "Was", "Are" -> "Were")
  - UPPERCASE -> UPPERCASE ("IS" -> "WAS", "ARE" -> "WERE")

### 3. Framework-Safe In-Place Replacement

Directly setting `element.value = ...` does not trigger synthetic events in reactive libraries. Use native prototype descriptors:

```javascript
function setNativeValue(element, value) {
  const isTextArea = element.tagName.toLowerCase() === 'textarea';
  const prototype = isTextArea
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

  if (descriptor && descriptor.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
}

// Always dispatch input and change events
element.dispatchEvent(new Event('input', { bubbles: true }));
element.dispatchEvent(new Event('change', { bubbles: true }));
```

### 4. Privacy-First Allowlist Lifecycle

- Extension must be inactive by default.
- Check allowlist on content script initialization.
- Listen for live updates via `chrome.storage.onChanged`:
  - When site is added to allowlist: mount overlay host, scan fields, attach observers.
  - When site is removed from allowlist: tear down all overlays and disconnect observers.

### 5. Dynamic Content Tracking

- Use `MutationObserver` on `document.body` with `childList: true, subtree: true` to discover dynamically created text fields.
- Use `ResizeObserver` on tracked elements to reposition overlays during layout changes.
- Use global scroll capture listeners (`window.addEventListener('scroll', updatePositions, { capture: true, passive: true })`) to track scrolling inside overflow containers or modals.

## Verification Checklist

1. Unit tests for word matching, negative cases, sentence boundaries, and case preservation.
2. Popup UI verification for domain addition, removal, and current site detection.
3. Automated browser integration tests via Chrome DevTools Protocol (CDP) in headless mode verifying overlay positioning, click-replacement, and allowlist toggling.
4. Compliance with project rules: ensure no emoji characters are used in UI or code.
