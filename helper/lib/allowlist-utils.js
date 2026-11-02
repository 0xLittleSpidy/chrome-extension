/**
 * Allowlist management and URL matching utilities.
 * Supports domain, wildcard subdomain, exact path, and query parameter matching.
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
   * If entry specifies paths or query parameters, preserves them for exact URL matching.
   * If bare domain, normalizes host.
   * @param {string} input 
   * @returns {string} Normalized domain, path/parameter URL, or empty string if invalid.
   */
  function normalizePattern(input) {
    if (!input || typeof input !== 'string') return '';
    let pattern = input.trim();

    // Special wildcards and file URLs
    if (pattern === '*' || pattern === '<all_urls>' || pattern.startsWith('file://') || pattern === 'local-files') {
      return pattern.toLowerCase();
    }

    // Wildcard domain pattern (*.domain.com)
    if (pattern.startsWith('*.')) {
      return pattern.toLowerCase();
    }

    const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(pattern);
    const patternWithoutScheme = pattern.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
    const slashIdx = patternWithoutScheme.indexOf('/');
    const questionIdx = patternWithoutScheme.indexOf('?');

    const hasPathOrParam = questionIdx !== -1 || (slashIdx !== -1 && slashIdx < patternWithoutScheme.length - 1);

    if (hasPathOrParam) {
      try {
        const u = new URL(hasProtocol ? pattern : ('https://' + pattern));
        const protocol = hasProtocol ? (u.protocol.toLowerCase() + '//') : '';
        const host = u.host.toLowerCase();
        let pathname = u.pathname;
        if (pathname.length > 1 && pathname.endsWith('/')) {
          pathname = pathname.slice(0, -1);
        }
        return protocol + host + pathname + u.search;
      } catch (e) {
        return pattern.toLowerCase();
      }
    }

    // Bare host or domain
    let clean = pattern.toLowerCase().replace(/^https?:\/\//i, '');
    if (clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
    const idx = clean.indexOf('/');
    if (idx !== -1) {
      clean = clean.substring(0, idx);
    }
    return clean;
  }

  /**
   * Checks if a given URL matches an allowlist pattern.
   * For path or parameter patterns, performs exact matching.
   * For domain patterns, performs domain/subdomain matching.
   * @param {string} urlString 
   * @param {string} pattern 
   * @returns {boolean}
   */
  function matchUrlWithPattern(urlString, pattern) {
    if (!urlString || !pattern) return false;
    urlString = urlString.trim();
    pattern = pattern.trim();

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
    const hostWithPort = urlObj.host.toLowerCase();

    // Wildcard all
    if (pattern === '*' || pattern === '<all_urls>') {
      return true;
    }

    const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(pattern);
    const patternWithoutScheme = pattern.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
    const slashIdx = patternWithoutScheme.indexOf('/');
    const questionIdx = patternWithoutScheme.indexOf('?');
    const hasPathOrParam = questionIdx !== -1 || (slashIdx !== -1 && slashIdx < patternWithoutScheme.length - 1);

    if (hasPathOrParam) {
      try {
        const patternObj = new URL(hasProtocol ? pattern : `${urlObj.protocol}//${pattern}`);

        // Compare scheme if explicitly specified in pattern
        if (hasProtocol && patternObj.protocol.toLowerCase() !== urlObj.protocol.toLowerCase()) {
          return false;
        }

        // Compare host
        if (patternObj.host.toLowerCase() !== hostWithPort && patternObj.hostname.toLowerCase() !== hostname) {
          return false;
        }

        // Compare pathname (normalize trailing slash)
        const normUrlPath = (urlObj.pathname.length > 1 && urlObj.pathname.endsWith('/'))
          ? urlObj.pathname.slice(0, -1)
          : urlObj.pathname;
        const normPatternPath = (patternObj.pathname.length > 1 && patternObj.pathname.endsWith('/'))
          ? patternObj.pathname.slice(0, -1)
          : patternObj.pathname;

        if (normUrlPath.toLowerCase() !== normPatternPath.toLowerCase()) {
          return false;
        }

        // Compare query parameters
        const urlParams = Array.from(urlObj.searchParams.entries()).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
        const patternParams = Array.from(patternObj.searchParams.entries()).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

        if (urlParams.length !== patternParams.length) {
          return false;
        }

        for (let i = 0; i < urlParams.length; i++) {
          if (urlParams[i][0] !== patternParams[i][0] || urlParams[i][1] !== patternParams[i][1]) {
            return false;
          }
        }

        return true;
      } catch (e) {
        return false;
      }
    }

    // Bare domain matching
    let cleanPattern = pattern.toLowerCase().replace(/^https?:\/\//i, '');
    const cleanSlash = cleanPattern.indexOf('/');
    if (cleanSlash !== -1) {
      cleanPattern = cleanPattern.substring(0, cleanSlash);
    }

    // Exact hostname or host:port match
    if (hostname === cleanPattern || hostWithPort === cleanPattern) {
      return true;
    }

    // Wildcard subdomain, e.g. *.example.com
    if (cleanPattern.startsWith('*.')) {
      const baseDomain = cleanPattern.substring(2);
      if (hostname === baseDomain || hostname.endsWith('.' + baseDomain)) {
        return true;
      }
    } else {
      if (hostname.endsWith('.' + cleanPattern)) {
        return true;
      }
    }

    // Localhost with wildcard port, e.g. localhost:*
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
   * Retrieves the specific pattern in the allowlist that matches the URL, if any.
   * @param {string} urlString 
   * @param {Array<string>} allowlist 
   * @returns {string|null}
   */
  function getMatchingPattern(urlString, allowlist) {
    if (!urlString || !Array.isArray(allowlist) || allowlist.length === 0) {
      return null;
    }

    for (let i = 0; i < allowlist.length; i++) {
      if (matchUrlWithPattern(urlString, allowlist[i])) {
        return allowlist[i];
      }
    }
    return null;
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
    getMatchingPattern: getMatchingPattern,
    getSiteIdentifier: getSiteIdentifier
  };
});
