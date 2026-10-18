/**
 * Text scanning and replacement logic for "is" -> "was" and "are" -> "were".
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TextScanner = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WORD_REGEX = /\b(is|are)\b/gi;
  // Splits text into sentences by looking for [.!?] followed by whitespace/end-of-line or newlines
  const SENTENCE_REGEX = /[^.!?\r\n]+(?:[.!?]+(?=[\s\r\n]|$)|$)|[\r\n]+/g;

  /**
   * Returns appropriate replacement word preserving case.
   * @param {string} word 
   * @returns {string}
   */
  function getReplacementWord(word) {
    if (!word) return '';
    const lower = word.toLowerCase();

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
   * Identifies all sentences in text and detects whole-word occurrences of "is" and "are".
   * @param {string} text 
   * @returns {{
   *   hasMatches: boolean,
   *   sentencesWithIs: Array<{
   *     sentenceStart: number,
   *     sentenceEnd: number,
   *     sentenceText: string,
   *     matches: Array<{ start: number, end: number, word: string, replacement: string }>
   *   }>,
   *   allMatches: Array<{
   *     start: number,
   *     end: number,
   *     word: string,
   *     replacement: string,
   *     sentenceStart: number,
   *     sentenceEnd: number
   *   }>
   * }}
   */
  function scanText(text) {
    if (!text || typeof text !== 'string') {
      return { hasMatches: false, sentencesWithIs: [], allMatches: [] };
    }

    const sentencesWithIs = [];
    const allMatches = [];

    let sentenceMatch;
    SENTENCE_REGEX.lastIndex = 0;

    while ((sentenceMatch = SENTENCE_REGEX.exec(text)) !== null) {
      const sentenceText = sentenceMatch[0];
      const sentenceStart = sentenceMatch.index;
      const sentenceEnd = sentenceStart + sentenceText.length;

      // Skip whitespace-only matches
      if (!sentenceText.trim()) {
        continue;
      }

      WORD_REGEX.lastIndex = 0;
      const sentenceMatches = [];
      let wordMatch;

      while ((wordMatch = WORD_REGEX.exec(sentenceText)) !== null) {
        const word = wordMatch[0];
        const matchStart = sentenceStart + wordMatch.index;
        const matchEnd = matchStart + word.length;
        const replacement = getReplacementWord(word);

        const matchObj = {
          start: matchStart,
          end: matchEnd,
          word: word,
          replacement: replacement,
          sentenceStart: sentenceStart,
          sentenceEnd: sentenceEnd
        };

        sentenceMatches.push(matchObj);
        allMatches.push(matchObj);
      }

      if (sentenceMatches.length > 0) {
        sentencesWithIs.push({
          sentenceStart: sentenceStart,
          sentenceEnd: sentenceEnd,
          sentenceText: sentenceText,
          matches: sentenceMatches
        });
      }
    }

    return {
      hasMatches: allMatches.length > 0,
      sentencesWithIs: sentencesWithIs,
      allMatches: allMatches
    };
  }

  /**
   * Replaces the word at the specified [start, end] with "was" or "were", preserving case.
   * Preserves all other text surrounding the word.
   * @param {string} text 
   * @param {number} start 
   * @param {number} end 
   * @returns {{ newText: string, replacement: string, nextCursorPos: number }}
   */
  function replaceWordAt(text, start, end) {
    if (typeof text !== 'string' || start < 0 || end > text.length || start >= end) {
      return { newText: text, replacement: '', nextCursorPos: start };
    }

    const originalWord = text.substring(start, end);
    const replacement = getReplacementWord(originalWord);

    const newText = text.substring(0, start) + replacement + text.substring(end);
    return {
      newText: newText,
      replacement: replacement,
      nextCursorPos: start + replacement.length
    };
  }

  return {
    scanText: scanText,
    replaceWordAt: replaceWordAt,
    getReplacementWord: getReplacementWord
  };
});
