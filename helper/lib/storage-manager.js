/**
 * Centralized Storage Manager for Helper Extension.
 * Handles isolated storage keys, synchronization, and import/export.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StorageManager = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEYS = {
    ALLOWLIST: 'allowlist',
    BLACKLIST: 'blacklist',
    SITE_REPLACER_STATE: 'site_replacer_state',
    SITE_STORAGE_STATE: 'site_storage_state',
    SITE_SHORTCUTS_STATE: 'site_shortcuts_state',
    SNIPPETS: 'snippets',
    CATEGORIES: 'categories',
    SHORTCUTS: 'shortcuts',
    UNWANTED_HEADERS: 'unwanted_headers',
    REPLACER_RULES: 'replacer_rules',
    STORAGE_FILE_CONFIGURED: 'storage_file_configured',
    THEME: 'theme'
  };

  const DEFAULT_CATEGORIES = ['General'];

  const DEFAULT_UNWANTED_HEADERS = [
    'sec-fetch-*',
    'sec-ch-ua-*',
    'X-pwnfox-color',
    'Accept-Language',
    'Upgrade-Insecure-Requests',
    'Priority',
    'Accept-Encoding'
  ];

  const DEFAULT_RULES = [
    {
      id: 'rule-default-is-was',
      find: 'is',
      replace: 'was',
      matchCase: true,
      wholeWord: true,
      isDefault: true
    },
    {
      id: 'rule-default-are-were',
      find: 'are',
      replace: 'were',
      matchCase: true,
      wholeWord: true,
      isDefault: true
    }
  ];

  const DEFAULT_SNIPPETS = [
    {
      id: 'snip-greeting',
      heading: 'Quick Greeting',
      category: 'General',
      order: 0,
      description: 'Hello, thank you for reaching out!',
      answers: [
        'Hello, thank you for reaching out!',
        'Hi there! How can I assist you today?'
      ],
      updatedAt: 1700000000000
    },
    {
      id: 'snip-signature',
      heading: 'Email Signature',
      category: 'General',
      order: 1,
      description: 'Best regards,\nHelper User',
      answers: [
        'Best regards,\nHelper User',
        'Sincerely,\nHelper User\nProductivity Team'
      ],
      updatedAt: 1700000000000
    }
  ];

  /**
   * Helper to access storage area (sync with local fallback).
   */
  function getStorageArea() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      return chrome.storage.sync || chrome.storage.local;
    }
    return null;
  }

  function getLocalStorageArea() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      return chrome.storage.local || chrome.storage.sync;
    }
    return null;
  }

  function getSyncStorageArea() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      return chrome.storage.sync || chrome.storage.local;
    }
    return null;
  }

  function normalizeSnippets(rawList) {
    if (!Array.isArray(rawList)) return [];
    return rawList
      .filter(item => item && item.heading)
      .map((item, idx) => {
        const answers = Array.isArray(item.answers) && item.answers.length > 0
          ? item.answers
          : [item.description || ''];
        return {
          ...item,
          category: item.category ? String(item.category).trim() : 'General',
          order: typeof item.order === 'number' ? item.order : idx,
          answers: answers,
          description: item.description || answers[0] || ''
        };
      })
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  async function getFromStorage(keys) {
    const storage = getStorageArea();
    if (!storage) return {};
    try {
      return await storage.get(keys);
    } catch (err) {
      if (chrome.storage && chrome.storage.local) {
        return await chrome.storage.local.get(keys);
      }
      return {};
    }
  }

  async function setToStorage(data) {
    const storage = getStorageArea();
    if (!storage) return;
    try {
      await storage.set(data);
    } catch (err) {
      if (chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set(data);
      }
    }
  }

  /**
   * Initializes storage with defaults if not present.
   */
  async function initializeDefaults() {
    const data = await getFromStorage([
      STORAGE_KEYS.ALLOWLIST,
      STORAGE_KEYS.BLACKLIST,
      STORAGE_KEYS.CATEGORIES,
      STORAGE_KEYS.SHORTCUTS,
      STORAGE_KEYS.UNWANTED_HEADERS,
      STORAGE_KEYS.SITE_REPLACER_STATE,
      STORAGE_KEYS.SITE_STORAGE_STATE,
      STORAGE_KEYS.SITE_SHORTCUTS_STATE,
      STORAGE_KEYS.REPLACER_RULES
    ]);

    const updates = {};
    if (!Array.isArray(data[STORAGE_KEYS.ALLOWLIST])) {
      updates[STORAGE_KEYS.ALLOWLIST] = [];
    }
    if (!Array.isArray(data[STORAGE_KEYS.BLACKLIST])) {
      updates[STORAGE_KEYS.BLACKLIST] = [];
    }
    if (!Array.isArray(data[STORAGE_KEYS.CATEGORIES]) || data[STORAGE_KEYS.CATEGORIES].length === 0) {
      updates[STORAGE_KEYS.CATEGORIES] = DEFAULT_CATEGORIES;
    }
    if (!Array.isArray(data[STORAGE_KEYS.SHORTCUTS])) {
      updates[STORAGE_KEYS.SHORTCUTS] = [];
    }
    if (!Array.isArray(data[STORAGE_KEYS.UNWANTED_HEADERS]) || data[STORAGE_KEYS.UNWANTED_HEADERS].length === 0) {
      updates[STORAGE_KEYS.UNWANTED_HEADERS] = DEFAULT_UNWANTED_HEADERS;
    }
    if (!data[STORAGE_KEYS.SITE_REPLACER_STATE] || typeof data[STORAGE_KEYS.SITE_REPLACER_STATE] !== 'object') {
      updates[STORAGE_KEYS.SITE_REPLACER_STATE] = {};
    }
    if (!data[STORAGE_KEYS.SITE_STORAGE_STATE] || typeof data[STORAGE_KEYS.SITE_STORAGE_STATE] !== 'object') {
      updates[STORAGE_KEYS.SITE_STORAGE_STATE] = {};
    }
    if (!data[STORAGE_KEYS.SITE_SHORTCUTS_STATE] || typeof data[STORAGE_KEYS.SITE_SHORTCUTS_STATE] !== 'object') {
      updates[STORAGE_KEYS.SITE_SHORTCUTS_STATE] = {};
    }
    if (!Array.isArray(data[STORAGE_KEYS.REPLACER_RULES]) || data[STORAGE_KEYS.REPLACER_RULES].length === 0) {
      updates[STORAGE_KEYS.REPLACER_RULES] = DEFAULT_RULES;
    }

    if (Object.keys(updates).length > 0) {
      await setToStorage(updates);
    }

    // Initialize snippets in local storage; migrate from sync if already present
    const localArea = getLocalStorageArea();
    if (localArea) {
      let localData = {};
      try {
        localData = await localArea.get([STORAGE_KEYS.SNIPPETS]);
      } catch (err) {}

      if (!Array.isArray(localData[STORAGE_KEYS.SNIPPETS])) {
        let existingSyncSnippets = null;
        const syncArea = getSyncStorageArea();
        if (syncArea && syncArea !== localArea) {
          try {
            const syncData = await syncArea.get([STORAGE_KEYS.SNIPPETS]);
            if (Array.isArray(syncData[STORAGE_KEYS.SNIPPETS]) && syncData[STORAGE_KEYS.SNIPPETS].length > 0) {
              existingSyncSnippets = syncData[STORAGE_KEYS.SNIPPETS];
            }
          } catch (err) {}
        }
        await localArea.set({
          [STORAGE_KEYS.SNIPPETS]: existingSyncSnippets || DEFAULT_SNIPPETS
        });
      }
    }
  }

  // --- Whitelist API ---
  async function getAllowlist() {
    const data = await getFromStorage([STORAGE_KEYS.ALLOWLIST]);
    return Array.isArray(data[STORAGE_KEYS.ALLOWLIST]) ? data[STORAGE_KEYS.ALLOWLIST] : [];
  }

  async function setAllowlist(list) {
    const cleanList = Array.isArray(list) ? list : [];
    await setToStorage({ [STORAGE_KEYS.ALLOWLIST]: cleanList });
  }

  // --- Blacklist API ---
  async function getBlacklist() {
    const data = await getFromStorage([STORAGE_KEYS.BLACKLIST]);
    return Array.isArray(data[STORAGE_KEYS.BLACKLIST]) ? data[STORAGE_KEYS.BLACKLIST] : [];
  }

  async function setBlacklist(list) {
    const cleanList = Array.isArray(list) ? list : [];
    await setToStorage({ [STORAGE_KEYS.BLACKLIST]: cleanList });
  }

  async function addBlacklist(pattern) {
    if (!pattern || typeof pattern !== 'string') return;
    const clean = pattern.trim();
    if (!clean) return;
    const list = await getBlacklist();
    if (!list.includes(clean)) {
      list.push(clean);
      await setBlacklist(list);
    }
    return list;
  }

  async function removeBlacklist(pattern) {
    if (!pattern) return;
    const clean = pattern.trim();
    const list = await getBlacklist();
    const updated = list.filter(p => p !== clean);
    await setBlacklist(updated);
    return updated;
  }

  // --- Categories API ---
  async function getCategories() {
    const data = await getFromStorage([STORAGE_KEYS.CATEGORIES]);
    if (Array.isArray(data[STORAGE_KEYS.CATEGORIES]) && data[STORAGE_KEYS.CATEGORIES].length > 0) {
      return data[STORAGE_KEYS.CATEGORIES];
    }
    return DEFAULT_CATEGORIES;
  }

  async function setCategories(list) {
    const cleanList = Array.isArray(list) && list.length > 0 ? list : DEFAULT_CATEGORIES;
    await setToStorage({ [STORAGE_KEYS.CATEGORIES]: cleanList });
  }

  async function addCategory(name) {
    if (!name || typeof name !== 'string') return;
    const clean = name.trim();
    if (!clean) return;
    const list = await getCategories();
    if (!list.includes(clean)) {
      list.push(clean);
      await setCategories(list);
    }
    return list;
  }

  async function deleteCategory(name) {
    if (!name) return;
    const clean = name.trim();
    if (clean === 'General') return;
    const list = await getCategories();
    const updated = list.filter(c => c !== clean);
    await setCategories(updated.length > 0 ? updated : DEFAULT_CATEGORIES);
    const snippets = await getSnippets();
    let changed = false;
    snippets.forEach(s => {
      if (s.category === clean) {
        s.category = 'General';
        changed = true;
      }
    });
    if (changed) {
      const localArea = getLocalStorageArea();
      if (localArea) await localArea.set({ [STORAGE_KEYS.SNIPPETS]: snippets });
    }
  }

  // --- Shortcuts API ---
  async function getShortcuts() {
    const data = await getFromStorage([STORAGE_KEYS.SHORTCUTS]);
    return Array.isArray(data[STORAGE_KEYS.SHORTCUTS]) ? data[STORAGE_KEYS.SHORTCUTS] : [];
  }

  async function setShortcuts(list) {
    const cleanList = Array.isArray(list) ? list : [];
    await setToStorage({ [STORAGE_KEYS.SHORTCUTS]: cleanList });
  }

  async function saveShortcut(shortcut) {
    if (!shortcut || !shortcut.name || !shortcut.keys) {
      throw new Error('Shortcut name and keys are required');
    }
    const list = await getShortcuts();
    const cleanShortcut = {
      id: shortcut.id || 'sc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      name: String(shortcut.name).trim(),
      keys: String(shortcut.keys).trim(),
      updatedAt: Date.now()
    };
    const existingIndex = list.findIndex(item => item.id === cleanShortcut.id);
    if (existingIndex !== -1) {
      list[existingIndex] = cleanShortcut;
    } else {
      list.push(cleanShortcut);
    }
    await setShortcuts(list);
    return cleanShortcut;
  }

  async function deleteShortcut(id) {
    if (!id) return;
    const list = await getShortcuts();
    const updated = list.filter(item => item.id !== id);
    await setShortcuts(updated);
  }

  async function getSiteShortcutsEnabled(domain) {
    if (!domain) return true;
    const data = await getFromStorage([STORAGE_KEYS.SITE_SHORTCUTS_STATE]);
    const stateMap = data[STORAGE_KEYS.SITE_SHORTCUTS_STATE] || {};
    return stateMap[domain] !== false;
  }

  async function setSiteShortcutsEnabled(domain, isEnabled) {
    if (!domain) return;
    const data = await getFromStorage([STORAGE_KEYS.SITE_SHORTCUTS_STATE]);
    const stateMap = data[STORAGE_KEYS.SITE_SHORTCUTS_STATE] || {};
    stateMap[domain] = Boolean(isEnabled);
    await setToStorage({ [STORAGE_KEYS.SITE_SHORTCUTS_STATE]: stateMap });
  }

  // --- Unwanted Headers (Header Cleaner) API ---
  async function getUnwantedHeaders() {
    const data = await getFromStorage([STORAGE_KEYS.UNWANTED_HEADERS]);
    if (Array.isArray(data[STORAGE_KEYS.UNWANTED_HEADERS]) && data[STORAGE_KEYS.UNWANTED_HEADERS].length > 0) {
      return data[STORAGE_KEYS.UNWANTED_HEADERS];
    }
    return DEFAULT_UNWANTED_HEADERS;
  }

  async function setUnwantedHeaders(list) {
    const cleanList = Array.isArray(list) && list.length > 0 ? list : DEFAULT_UNWANTED_HEADERS;
    await setToStorage({ [STORAGE_KEYS.UNWANTED_HEADERS]: cleanList });
  }

  async function addUnwantedHeader(pattern) {
    if (!pattern || typeof pattern !== 'string') return;
    const clean = pattern.trim();
    if (!clean) return;
    const list = await getUnwantedHeaders();
    if (!list.includes(clean)) {
      list.push(clean);
      await setUnwantedHeaders(list);
    }
    return list;
  }

  async function deleteUnwantedHeader(pattern) {
    if (!pattern) return;
    const clean = pattern.trim();
    const list = await getUnwantedHeaders();
    const updated = list.filter(p => p.toLowerCase() !== clean.toLowerCase());
    await setUnwantedHeaders(updated);
    return updated;
  }

  // --- Per-Site Replacer Switch API ---
  async function getSiteReplacerEnabled(domain) {
    if (!domain) return true;
    const data = await getFromStorage([STORAGE_KEYS.SITE_REPLACER_STATE]);
    const stateMap = data[STORAGE_KEYS.SITE_REPLACER_STATE] || {};
    // Defaults to true if not explicitly set to false
    return stateMap[domain] !== false;
  }

  async function setSiteReplacerEnabled(domain, isEnabled) {
    if (!domain) return;
    const data = await getFromStorage([STORAGE_KEYS.SITE_REPLACER_STATE]);
    const stateMap = data[STORAGE_KEYS.SITE_REPLACER_STATE] || {};
    stateMap[domain] = Boolean(isEnabled);
    await setToStorage({ [STORAGE_KEYS.SITE_REPLACER_STATE]: stateMap });
  }

  // --- Per-Site Storage Switch API ---
  async function getSiteStorageEnabled(domain) {
    if (!domain) return true;
    const data = await getFromStorage([STORAGE_KEYS.SITE_STORAGE_STATE]);
    const stateMap = data[STORAGE_KEYS.SITE_STORAGE_STATE] || {};
    // Defaults to true if not explicitly set to false
    return stateMap[domain] !== false;
  }

  async function setSiteStorageEnabled(domain, isEnabled) {
    if (!domain) return;
    const data = await getFromStorage([STORAGE_KEYS.SITE_STORAGE_STATE]);
    const stateMap = data[STORAGE_KEYS.SITE_STORAGE_STATE] || {};
    stateMap[domain] = Boolean(isEnabled);
    await setToStorage({ [STORAGE_KEYS.SITE_STORAGE_STATE]: stateMap });
  }

  // --- Snippets API ---
  async function getSnippets() {
    const localArea = getLocalStorageArea();
    if (localArea) {
      try {
        const localData = await localArea.get([STORAGE_KEYS.SNIPPETS]);
        if (Array.isArray(localData[STORAGE_KEYS.SNIPPETS])) {
          return normalizeSnippets(localData[STORAGE_KEYS.SNIPPETS]);
        }
      } catch (err) {}
    }

    // Check sync storage for migration if not found in local storage
    const syncArea = getSyncStorageArea();
    if (syncArea && syncArea !== localArea) {
      try {
        const syncData = await syncArea.get([STORAGE_KEYS.SNIPPETS]);
        if (Array.isArray(syncData[STORAGE_KEYS.SNIPPETS]) && syncData[STORAGE_KEYS.SNIPPETS].length > 0) {
          const migrated = normalizeSnippets(syncData[STORAGE_KEYS.SNIPPETS]);
          if (localArea) {
            try {
              await localArea.set({ [STORAGE_KEYS.SNIPPETS]: migrated });
            } catch (err) {}
          }
          return migrated;
        }
      } catch (err) {}
    }

    return DEFAULT_SNIPPETS;
  }

  async function saveSnippet(snippet) {
    if (!snippet || !snippet.heading) {
      throw new Error('Snippet heading is required');
    }
    const list = await getSnippets();

    let answers = [];
    if (Array.isArray(snippet.answers) && snippet.answers.length > 0) {
      answers = snippet.answers.map(a => String(a).trim()).filter(a => a.length > 0);
    }
    if (answers.length === 0 && snippet.description) {
      answers = [String(snippet.description).trim()];
    }
    if (answers.length === 0) {
      answers = [''];
    }

    const cleanSnippet = {
      id: snippet.id || 'snip-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      heading: String(snippet.heading).trim(),
      category: snippet.category ? String(snippet.category).trim() : 'General',
      order: typeof snippet.order === 'number' ? snippet.order : list.length,
      description: answers[0] || String(snippet.description || '').trim(),
      answers: answers,
      updatedAt: Date.now()
    };

    const existingIndex = list.findIndex(item => item.id === cleanSnippet.id);
    if (existingIndex !== -1) {
      if (typeof snippet.order !== 'number') {
        cleanSnippet.order = list[existingIndex].order ?? existingIndex;
      }
      list[existingIndex] = cleanSnippet;
    } else {
      list.push(cleanSnippet);
    }

    const localArea = getLocalStorageArea();
    if (localArea) {
      await localArea.set({ [STORAGE_KEYS.SNIPPETS]: list });
    }

    // Best-effort sync backup if size permits; quota errors are safely ignored
    const syncArea = getSyncStorageArea();
    if (syncArea && syncArea !== localArea) {
      try {
        await syncArea.set({ [STORAGE_KEYS.SNIPPETS]: list });
      } catch (err) {
        // Quota exceeded in sync; local storage remains the robust primary source
      }
    }

    return cleanSnippet;
  }

  async function deleteSnippet(snippetId) {
    if (!snippetId) return;
    const list = await getSnippets();
    const updated = list.filter(item => item.id !== snippetId);

    const localArea = getLocalStorageArea();
    if (localArea) {
      await localArea.set({ [STORAGE_KEYS.SNIPPETS]: updated });
    }

    const syncArea = getSyncStorageArea();
    if (syncArea && syncArea !== localArea) {
      try {
        await syncArea.set({ [STORAGE_KEYS.SNIPPETS]: updated });
      } catch (err) {}
    }
  }

  async function reorderSnippets(orderedIds) {
    if (!Array.isArray(orderedIds)) return;
    const list = await getSnippets();
    const map = new Map(list.map(s => [s.id, s]));
    const updated = [];
    orderedIds.forEach((id, idx) => {
      const item = map.get(id);
      if (item) {
        item.order = idx;
        updated.push(item);
        map.delete(id);
      }
    });
    map.forEach(item => {
      item.order = updated.length;
      updated.push(item);
    });

    const localArea = getLocalStorageArea();
    if (localArea) {
      await localArea.set({ [STORAGE_KEYS.SNIPPETS]: updated });
    }
    const syncArea = getSyncStorageArea();
    if (syncArea && syncArea !== localArea) {
      try {
        await syncArea.set({ [STORAGE_KEYS.SNIPPETS]: updated });
      } catch (err) {}
    }
    return updated;
  }

  // --- Replacer Rules API ---
  async function getReplacerRules() {
    const data = await getFromStorage([STORAGE_KEYS.REPLACER_RULES]);
    if (Array.isArray(data[STORAGE_KEYS.REPLACER_RULES]) && data[STORAGE_KEYS.REPLACER_RULES].length > 0) {
      return data[STORAGE_KEYS.REPLACER_RULES];
    }
    return DEFAULT_RULES;
  }

  async function saveReplacerRule(rule) {
    if (!rule || !rule.find) {
      throw new Error('Original text to find is required');
    }
    const list = await getReplacerRules();
    const cleanRule = {
      id: rule.id || 'rule-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      find: String(rule.find).trim(),
      replace: String(rule.replace !== undefined ? rule.replace : ''),
      matchCase: Boolean(rule.matchCase),
      wholeWord: rule.wholeWord !== undefined ? Boolean(rule.wholeWord) : true,
      isDefault: Boolean(rule.isDefault)
    };

    const existingIndex = list.findIndex(item => item.id === cleanRule.id);
    if (existingIndex !== -1) {
      list[existingIndex] = cleanRule;
    } else {
      list.push(cleanRule);
    }
    await setToStorage({ [STORAGE_KEYS.REPLACER_RULES]: list });
    return cleanRule;
  }

  async function deleteReplacerRule(ruleId) {
    if (!ruleId) return;
    const list = await getReplacerRules();
    const updated = list.filter(item => item.id !== ruleId);
    await setToStorage({ [STORAGE_KEYS.REPLACER_RULES]: updated });
  }

  // --- Import / Export API ---
  async function exportConfiguration() {
    const [allowlist, blacklist, categories, shortcuts, unwantedHeaders, snippets, rules] = await Promise.all([
      getAllowlist(),
      getBlacklist(),
      getCategories(),
      getShortcuts(),
      getUnwantedHeaders(),
      getSnippets(),
      getReplacerRules()
    ]);

    return {
      version: 2,
      appName: 'Helper',
      exportedAt: new Date().toISOString(),
      allowlist: allowlist,
      blacklist: blacklist,
      categories: categories,
      shortcuts: shortcuts,
      unwanted_headers: unwantedHeaders,
      snippets: snippets,
      replacer_rules: rules
    };
  }

  async function importConfiguration(jsonString, mode = 'replace') {
    let parsed;
    try {
      parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
    } catch (err) {
      throw new Error('Invalid JSON format');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Configuration payload must be an object');
    }

    const updates = {};
    const isMerge = mode === 'merge';

    // Allowlist
    if (Array.isArray(parsed.allowlist)) {
      if (isMerge) {
        const current = await getAllowlist();
        const merged = Array.from(new Set([...current, ...parsed.allowlist]));
        updates[STORAGE_KEYS.ALLOWLIST] = merged;
      } else {
        updates[STORAGE_KEYS.ALLOWLIST] = parsed.allowlist;
      }
    }

    // Blacklist
    if (Array.isArray(parsed.blacklist)) {
      if (isMerge) {
        const current = await getBlacklist();
        const merged = Array.from(new Set([...current, ...parsed.blacklist]));
        updates[STORAGE_KEYS.BLACKLIST] = merged;
      } else {
        updates[STORAGE_KEYS.BLACKLIST] = parsed.blacklist;
      }
    }

    // Categories
    if (Array.isArray(parsed.categories)) {
      if (isMerge) {
        const current = await getCategories();
        const merged = Array.from(new Set([...current, ...parsed.categories]));
        updates[STORAGE_KEYS.CATEGORIES] = merged;
      } else {
        updates[STORAGE_KEYS.CATEGORIES] = parsed.categories;
      }
    }

    // Shortcuts
    if (Array.isArray(parsed.shortcuts)) {
      const validShortcuts = parsed.shortcuts.filter(s => s && s.name && s.keys);
      if (isMerge) {
        const current = await getShortcuts();
        const map = new Map(current.map(s => [s.id || s.name, s]));
        validShortcuts.forEach(s => {
          map.set(s.id || s.name, s);
        });
        updates[STORAGE_KEYS.SHORTCUTS] = Array.from(map.values());
      } else {
        updates[STORAGE_KEYS.SHORTCUTS] = validShortcuts;
      }
    }

    // Unwanted Headers
    if (Array.isArray(parsed.unwanted_headers)) {
      if (isMerge) {
        const current = await getUnwantedHeaders();
        const merged = Array.from(new Set([...current, ...parsed.unwanted_headers]));
        updates[STORAGE_KEYS.UNWANTED_HEADERS] = merged;
      } else {
        updates[STORAGE_KEYS.UNWANTED_HEADERS] = parsed.unwanted_headers;
      }
    }

    // Replacer rules
    if (Array.isArray(parsed.replacer_rules)) {
      const validRules = parsed.replacer_rules.filter(r => r && r.find);
      if (isMerge) {
        const current = await getReplacerRules();
        const map = new Map(current.map(r => [r.id || r.find, r]));
        validRules.forEach(r => {
          map.set(r.id || r.find, r);
        });
        updates[STORAGE_KEYS.REPLACER_RULES] = Array.from(map.values());
      } else {
        updates[STORAGE_KEYS.REPLACER_RULES] = validRules;
      }
    }

    // Snippets
    let hasSnippets = false;
    if (Array.isArray(parsed.snippets)) {
      hasSnippets = true;
      let cleanSnippets = normalizeSnippets(parsed.snippets);
      if (isMerge) {
        const current = await getSnippets();
        const map = new Map(current.map(s => [s.id || s.heading, s]));
        cleanSnippets.forEach(s => {
          map.set(s.id || s.heading, s);
        });
        cleanSnippets = normalizeSnippets(Array.from(map.values()));
      }

      const localArea = getLocalStorageArea();
      if (localArea) {
        await localArea.set({ [STORAGE_KEYS.SNIPPETS]: cleanSnippets });
      }
      const syncArea = getSyncStorageArea();
      if (syncArea && syncArea !== localArea) {
        try {
          await syncArea.set({ [STORAGE_KEYS.SNIPPETS]: cleanSnippets });
        } catch (err) {}
      }
      updates[STORAGE_KEYS.SNIPPETS] = cleanSnippets;
    }

    if (Object.keys(updates).length === 0 && !hasSnippets) {
      throw new Error('No valid settings, snippets, or rules found in file');
    }

    const nonSnippetUpdates = { ...updates };
    delete nonSnippetUpdates[STORAGE_KEYS.SNIPPETS];
    if (Object.keys(nonSnippetUpdates).length > 0) {
      await setToStorage(nonSnippetUpdates);
    }
    return updates;
  }

  // --- Theme API ---
  async function getTheme() {
    const data = await getFromStorage([STORAGE_KEYS.THEME]);
    return data[STORAGE_KEYS.THEME] || 'dark'; // Dark theme by default
  }

  async function setTheme(theme) {
    const cleanTheme = theme === 'light' ? 'light' : 'dark';
    await setToStorage({ [STORAGE_KEYS.THEME]: cleanTheme });
    return cleanTheme;
  }

  // --- Local File Setup State ---
  async function getFileConfigured() {
    const data = await getFromStorage([STORAGE_KEYS.STORAGE_FILE_CONFIGURED]);
    return Boolean(data[STORAGE_KEYS.STORAGE_FILE_CONFIGURED]);
  }

  async function setFileConfigured(isConfigured) {
    await setToStorage({ [STORAGE_KEYS.STORAGE_FILE_CONFIGURED]: Boolean(isConfigured) });
  }

  return {
    STORAGE_KEYS: STORAGE_KEYS,
    DEFAULT_RULES: DEFAULT_RULES,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    DEFAULT_UNWANTED_HEADERS: DEFAULT_UNWANTED_HEADERS,
    initializeDefaults: initializeDefaults,
    getAllowlist: getAllowlist,
    setAllowlist: setAllowlist,
    getBlacklist: getBlacklist,
    setBlacklist: setBlacklist,
    addBlacklist: addBlacklist,
    addToBlacklist: addBlacklist,
    removeBlacklist: removeBlacklist,
    removeFromBlacklist: removeBlacklist,
    getCategories: getCategories,
    setCategories: setCategories,
    addCategory: addCategory,
    deleteCategory: deleteCategory,
    getShortcuts: getShortcuts,
    setShortcuts: setShortcuts,
    saveShortcut: saveShortcut,
    deleteShortcut: deleteShortcut,
    getSiteShortcutsEnabled: getSiteShortcutsEnabled,
    setSiteShortcutsEnabled: setSiteShortcutsEnabled,
    getUnwantedHeaders: getUnwantedHeaders,
    setUnwantedHeaders: setUnwantedHeaders,
    addUnwantedHeader: addUnwantedHeader,
    deleteUnwantedHeader: deleteUnwantedHeader,
    getSiteReplacerEnabled: getSiteReplacerEnabled,
    setSiteReplacerEnabled: setSiteReplacerEnabled,
    getSiteStorageEnabled: getSiteStorageEnabled,
    setSiteStorageEnabled: setSiteStorageEnabled,
    getSnippets: getSnippets,
    saveSnippet: saveSnippet,
    deleteSnippet: deleteSnippet,
    reorderSnippets: reorderSnippets,
    getReplacerRules: getReplacerRules,
    saveReplacerRule: saveReplacerRule,
    deleteReplacerRule: deleteReplacerRule,
    exportConfiguration: exportConfiguration,
    importConfiguration: importConfiguration,
    getTheme: getTheme,
    setTheme: setTheme,
    getFileConfigured: getFileConfigured,
    setFileConfigured: setFileConfigured
  };
});
