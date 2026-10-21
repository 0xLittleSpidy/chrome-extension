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
    SITE_REPLACER_STATE: 'site_replacer_state',
    SITE_STORAGE_STATE: 'site_storage_state',
    SNIPPETS: 'snippets',
    REPLACER_RULES: 'replacer_rules'
  };

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
      description: 'Hello, thank you for reaching out!',
      updatedAt: 1700000000000
    },
    {
      id: 'snip-signature',
      heading: 'Email Signature',
      description: 'Best regards,\nHelper User',
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
      STORAGE_KEYS.SITE_REPLACER_STATE,
      STORAGE_KEYS.SITE_STORAGE_STATE,
      STORAGE_KEYS.SNIPPETS,
      STORAGE_KEYS.REPLACER_RULES
    ]);

    const updates = {};
    if (!Array.isArray(data[STORAGE_KEYS.ALLOWLIST])) {
      updates[STORAGE_KEYS.ALLOWLIST] = [];
    }
    if (!data[STORAGE_KEYS.SITE_REPLACER_STATE] || typeof data[STORAGE_KEYS.SITE_REPLACER_STATE] !== 'object') {
      updates[STORAGE_KEYS.SITE_REPLACER_STATE] = {};
    }
    if (!data[STORAGE_KEYS.SITE_STORAGE_STATE] || typeof data[STORAGE_KEYS.SITE_STORAGE_STATE] !== 'object') {
      updates[STORAGE_KEYS.SITE_STORAGE_STATE] = {};
    }
    if (!Array.isArray(data[STORAGE_KEYS.SNIPPETS]) || data[STORAGE_KEYS.SNIPPETS].length === 0) {
      updates[STORAGE_KEYS.SNIPPETS] = DEFAULT_SNIPPETS;
    }
    if (!Array.isArray(data[STORAGE_KEYS.REPLACER_RULES]) || data[STORAGE_KEYS.REPLACER_RULES].length === 0) {
      updates[STORAGE_KEYS.REPLACER_RULES] = DEFAULT_RULES;
    }

    if (Object.keys(updates).length > 0) {
      await setToStorage(updates);
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
    const data = await getFromStorage([STORAGE_KEYS.SNIPPETS]);
    if (Array.isArray(data[STORAGE_KEYS.SNIPPETS])) {
      return data[STORAGE_KEYS.SNIPPETS];
    }
    return DEFAULT_SNIPPETS;
  }

  async function saveSnippet(snippet) {
    if (!snippet || !snippet.heading) {
      throw new Error('Snippet heading is required');
    }
    const list = await getSnippets();
    const cleanSnippet = {
      id: snippet.id || 'snip-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      heading: String(snippet.heading).trim(),
      description: String(snippet.description || ''),
      updatedAt: Date.now()
    };

    const existingIndex = list.findIndex(item => item.id === cleanSnippet.id);
    if (existingIndex !== -1) {
      list[existingIndex] = cleanSnippet;
    } else {
      list.push(cleanSnippet);
    }
    await setToStorage({ [STORAGE_KEYS.SNIPPETS]: list });
    return cleanSnippet;
  }

  async function deleteSnippet(snippetId) {
    if (!snippetId) return;
    const list = await getSnippets();
    const updated = list.filter(item => item.id !== snippetId);
    await setToStorage({ [STORAGE_KEYS.SNIPPETS]: updated });
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
    const [allowlist, snippets, rules] = await Promise.all([
      getAllowlist(),
      getSnippets(),
      getReplacerRules()
    ]);

    return {
      version: 1,
      appName: 'Helper',
      exportedAt: new Date().toISOString(),
      allowlist: allowlist,
      snippets: snippets,
      replacer_rules: rules
    };
  }

  async function importConfiguration(jsonString) {
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
    if (Array.isArray(parsed.allowlist)) {
      updates[STORAGE_KEYS.ALLOWLIST] = parsed.allowlist;
    }
    if (Array.isArray(parsed.snippets)) {
      updates[STORAGE_KEYS.SNIPPETS] = parsed.snippets.filter(s => s && s.heading);
    }
    if (Array.isArray(parsed.replacer_rules)) {
      updates[STORAGE_KEYS.REPLACER_RULES] = parsed.replacer_rules.filter(r => r && r.find);
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('No valid settings, snippets, or rules found in file');
    }

    await setToStorage(updates);
    return updates;
  }

  return {
    STORAGE_KEYS: STORAGE_KEYS,
    DEFAULT_RULES: DEFAULT_RULES,
    initializeDefaults: initializeDefaults,
    getAllowlist: getAllowlist,
    setAllowlist: setAllowlist,
    getSiteReplacerEnabled: getSiteReplacerEnabled,
    setSiteReplacerEnabled: setSiteReplacerEnabled,
    getSiteStorageEnabled: getSiteStorageEnabled,
    setSiteStorageEnabled: setSiteStorageEnabled,
    getSnippets: getSnippets,
    saveSnippet: saveSnippet,
    deleteSnippet: deleteSnippet,
    getReplacerRules: getReplacerRules,
    saveReplacerRule: saveReplacerRule,
    deleteReplacerRule: deleteReplacerRule,
    exportConfiguration: exportConfiguration,
    importConfiguration: importConfiguration
  };
});
