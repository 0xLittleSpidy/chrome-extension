/**
 * Text scanning and replacement logic for Helper Extension.
 * Supports dynamic user-configured replacement rules with case preservation,
 * whole-word matching, and backward-compatible defaults.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TextScanner = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Splits text into sentences by looking for [.!?] followed by whitespace/end-of-line or newlines
  const SENTENCE_REGEX = /[^.!?\r\n]+(?:[.!?]+(?=[\s\r\n]|$)|$)|[\r\n]+/g;

  const DEFAULT_RULES = [
    { id: 'rule-default-is-was', find: 'is', replace: 'was', matchCase: true, wholeWord: true },
    { id: 'rule-default-are-were', find: 'are', replace: 'were', matchCase: true, wholeWord: true }
  ];

  /**
   * Safely escapes regex special characters.
   */
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Preserves the casing of original word onto replacement word.
   */
  function preserveCase(original, replacement) {
    if (!original || !replacement) return replacement;
    if (original === original.toUpperCase()) {
      return replacement.toUpperCase();
    }
    if (original[0] === original[0].toUpperCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement.toLowerCase();
  }

  /**
   * Legacy helper for "is" and "are" word replacement.
   */
  function getReplacementWord(word, customRules) {
    if (!word) return '';
    const lower = word.toLowerCase();

    if (Array.isArray(customRules) && customRules.length > 0) {
      for (const rule of customRules) {
        if (!rule || !rule.find) continue;
        if (rule.find.toLowerCase() === lower) {
          return rule.matchCase ? preserveCase(word, rule.replace) : rule.replace;
        }
      }
    }

    if (lower === 'is') {
      if (word === 'Is') return 'Was';
      if (word === 'IS') return 'WAS';
      return 'was';
    }

    if (lower === 'are') {
      if (word === 'Are') return 'Were';
      if (word === 'ARE') return 'WERE';
      return 'were';
    }

    return word;
  }

  /**
   * Compiles dynamic rules into regexes.
   */
  function compileRule(rule) {
    if (!rule || !rule.find) return null;
    const escaped = escapeRegex(rule.find.trim());
    if (!escaped) return null;

    const pattern = rule.wholeWord !== false ? `\\b${escaped}\\b` : escaped;
    const flags = 'gi';
    try {
      return {
        rule: rule,
        regex: new RegExp(pattern, flags)
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Scans text with dynamic rules.
   * If rules is empty or omitted, falls back to DEFAULT_RULES.
   */
  function scanTextWithRules(text, rules) {
    if (!text || typeof text !== 'string') {
      return { hasMatches: false, sentencesWithIs: [], allMatches: [] };
    }

    const activeRules = Array.isArray(rules) && rules.length > 0 ? rules : DEFAULT_RULES;
    const compiledRules = activeRules.map(compileRule).filter(Boolean);

    if (compiledRules.length === 0) {
      return { hasMatches: false, sentencesWithIs: [], allMatches: [] };
    }

    const sentencesWithMatches = [];
    const allMatches = [];

    let sentenceMatch;
    SENTENCE_REGEX.lastIndex = 0;

    while ((sentenceMatch = SENTENCE_REGEX.exec(text)) !== null) {
      const sentenceText = sentenceMatch[0];
      const sentenceStart = sentenceMatch.index;
      const sentenceEnd = sentenceStart + sentenceText.length;

      if (!sentenceText.trim()) {
        continue;
      }

      const sentenceMatches = [];

      for (const compiled of compiledRules) {
        compiled.regex.lastIndex = 0;
        let match;

        while ((match = compiled.regex.exec(sentenceText)) !== null) {
          const matchedWord = match[0];
          const matchStart = sentenceStart + match.index;
          const matchEnd = matchStart + matchedWord.length;

          const replacement = compiled.rule.matchCase
            ? preserveCase(matchedWord, compiled.rule.replace)
            : compiled.rule.replace;

          sentenceMatches.push({
            start: matchStart,
            end: matchEnd,
            word: matchedWord,
            replacement: replacement,
            ruleId: compiled.rule.id,
            sentenceStart: sentenceStart,
            sentenceEnd: sentenceEnd
          });
        }
      }

      // Sort matches by start position and eliminate exact overlaps
      if (sentenceMatches.length > 0) {
        sentenceMatches.sort((a, b) => a.start - b.start);
        const filteredMatches = [];
        let lastEnd = -1;

        for (const m of sentenceMatches) {
          if (m.start >= lastEnd) {
            filteredMatches.push(m);
            lastEnd = m.end;
          }
        }

        if (filteredMatches.length > 0) {
          sentencesWithMatches.push({
            sentenceStart: sentenceStart,
            sentenceEnd: sentenceEnd,
            sentenceText: sentenceText,
            matches: filteredMatches
          });
          allMatches.push(...filteredMatches);
        }
      }
    }

    return {
      hasMatches: allMatches.length > 0,
      sentencesWithIs: sentencesWithMatches,
      allMatches: allMatches
    };
  }

  /**
   * Backward-compatible scanText for existing unit and integration tests.
   */
  function scanText(text) {
    return scanTextWithRules(text, DEFAULT_RULES);
  }

  /**
   * Replaces the word at the specified [start, end] with the replacement.
   */
  function replaceWordAt(text, start, end, specificReplacement) {
    if (typeof text !== 'string' || start < 0 || end > text.length || start >= end) {
      return { newText: text, replacement: '', nextCursorPos: start };
    }

    let replacement = specificReplacement;
    if (replacement === undefined || replacement === null) {
      const originalWord = text.substring(start, end);
      replacement = getReplacementWord(originalWord);
    }

    const newText = text.substring(0, start) + replacement + text.substring(end);
    return {
      newText: newText,
      replacement: replacement,
      nextCursorPos: start + replacement.length
    };
  }

  return {
    scanText: scanText,
    scanTextWithRules: scanTextWithRules,
    replaceWordAt: replaceWordAt,
    getReplacementWord: getReplacementWord,
    preserveCase: preserveCase,
    DEFAULT_RULES: DEFAULT_RULES
  };
});
