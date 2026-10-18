/**
 * Allowlist management and URL matching utilities.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AllowlistUtils = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Cleans and normalizes an allowlist entry input from user.
   * @param {string} input 
   * @returns {string} Normalized domain or pattern, or empty string if invalid.
   */
  function normalizePattern(input) {
    if (!input || typeof input !== 'string') return '';
    let pattern = input.trim().toLowerCase();

    // Remove leading http:// or https:// if provided
    pattern = pattern.replace(/^https?:\/\//i, '');

    // If it ends with trailing slash or path, extract host/origin
    const slashIdx = pattern.indexOf('/');
    if (slashIdx !== -1) {
      pattern = pattern.substring(0, slashIdx);
    }

    // Strip leading wildcard *. if present to standardize
    // We will support both exact and subdomain matching
    return pattern;
  }

  /**
   * Checks if a given URL matches an allowlist pattern.
   * @param {string} urlString 
   * @param {string} pattern 
   * @returns {boolean}
   */
  function matchUrlWithPattern(urlString, pattern) {
    if (!urlString || !pattern) return false;
    pattern = pattern.trim().toLowerCase();

    // Special case: file URLs
    if (urlString.startsWith('file://')) {
      return pattern === 'file://*' || pattern === 'file://' || pattern === 'local-files' || pattern === '*';
    }

    let urlObj;
    try {
      urlObj = new URL(urlString);
    } catch (e) {
      return false;
    }

    const hostname = urlObj.hostname.toLowerCase();
    const hostWithPort = urlObj.host.toLowerCase(); // includes port if non-standard

    // Normalize pattern
    let cleanPattern = pattern.replace(/^https?:\/\//i, '');
    const slashIdx = cleanPattern.indexOf('/');
    if (slashIdx !== -1) {
      cleanPattern = cleanPattern.substring(0, slashIdx);
    }

    // Wildcard all
    if (cleanPattern === '*' || cleanPattern === '<all_urls>') {
      return true;
    }

    // Exact hostname or host:port match
    if (hostname === cleanPattern || hostWithPort === cleanPattern) {
      return true;
    }

    // Handle wildcard subdomain, e.g. *.example.com or example.com
    if (cleanPattern.startsWith('*.')) {
      const baseDomain = cleanPattern.substring(2);
      if (hostname === baseDomain || hostname.endsWith('.' + baseDomain)) {
        return true;
      }
    } else {
      // If pattern is "example.com", it should also match "www.example.com", "sub.example.com"
      if (hostname.endsWith('.' + cleanPattern)) {
        return true;
      }
    }

    // Handle localhost with wildcard port, e.g. localhost:*
    if (cleanPattern.startsWith('localhost:*') && hostname === 'localhost') {
      return true;
    }

    return false;
  }

  /**
   * Checks if a URL is permitted by any rule in the allowlist.
   * @param {string} urlString 
   * @param {Array<string>} allowlist 
   * @returns {boolean}
   */
  function isUrlAllowed(urlString, allowlist) {
    if (!urlString || !Array.isArray(allowlist) || allowlist.length === 0) {
      return false;
    }

    for (let i = 0; i < allowlist.length; i++) {
      if (matchUrlWithPattern(urlString, allowlist[i])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Extracts a user-friendly site identifier from a URL.
   * @param {string} urlString 
   * @returns {string} e.g. "example.com" or "localhost:3000" or "local-files"
   */
  function getSiteIdentifier(urlString) {
    if (!urlString) return '';
    if (urlString.startsWith('file://')) return 'local-files';
    try {
      const u = new URL(urlString);
      return u.host || u.hostname;
    } catch (e) {
      return '';
    }
  }

  return {
    normalizePattern: normalizePattern,
    matchUrlWithPattern: matchUrlWithPattern,
    isUrlAllowed: isUrlAllowed,
    getSiteIdentifier: getSiteIdentifier
  };
});
