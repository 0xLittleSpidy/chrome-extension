const assert = require('assert');
const TextScanner = require('../lib/text-scanner');
const AllowlistUtils = require('../lib/allowlist-utils');

console.log('--- RUNNING UNIT TESTS ---');

// 1. Test TextScanner whole word matching & sentences for "is" and "are"
{
  const text = 'This is a test. The island has water. They are happy today. This area is calm.';
  const res = TextScanner.scanText(text);

  assert.strictEqual(res.hasMatches, true);
  assert.strictEqual(res.sentencesWithIs.length, 3, 'Should match 3 sentences containing whole-word "is" or "are"');
  assert.strictEqual(res.allMatches.length, 3, 'Should have 3 occurrences: 2 "is" and 1 "are"');

  // Verify first match "is" -> "was"
  assert.strictEqual(res.allMatches[0].word, 'is');
  assert.strictEqual(res.allMatches[0].replacement, 'was');

  // Verify second match "are" -> "were"
  assert.strictEqual(res.allMatches[1].word, 'are');
  assert.strictEqual(res.allMatches[1].replacement, 'were');

  // Verify third match "is" -> "was"
  assert.strictEqual(res.allMatches[2].word, 'is');
  assert.strictEqual(res.allMatches[2].replacement, 'was');

  // Verify "island" and "area" are NOT matched
  assert.strictEqual(res.allMatches.some(m => m.word.toLowerCase() === 'island'), false);
  assert.strictEqual(res.allMatches.some(m => m.word.toLowerCase() === 'area'), false);

  // Verify replacement on first match ("is" -> "was")
  const rep1 = TextScanner.replaceWordAt(text, res.allMatches[0].start, res.allMatches[0].end);
  assert.strictEqual(rep1.newText, 'This was a test. The island has water. They are happy today. This area is calm.');

  // Verify replacement on second match ("are" -> "were")
  const rep2 = TextScanner.replaceWordAt(text, res.allMatches[1].start, res.allMatches[1].end);
  assert.strictEqual(rep2.newText, 'This is a test. The island has water. They were happy today. This area is calm.');
}

// 2. Test multiple "is" and "are" in one sentence
{
  const text = 'They are who they are, and he is who he is.';
  const res = TextScanner.scanText(text);
  assert.strictEqual(res.sentencesWithIs.length, 1);
  assert.strictEqual(res.allMatches.length, 4);
  assert.strictEqual(res.allMatches[0].word, 'are');
  assert.strictEqual(res.allMatches[1].word, 'are');
  assert.strictEqual(res.allMatches[2].word, 'is');
  assert.strictEqual(res.allMatches[3].word, 'is');
}

// 3. Test capitalization preservation for both "is" and "are"
{
  const text = 'Is it ready? Are they coming? What IS that? Who ARE they?';
  const res = TextScanner.scanText(text);
  assert.strictEqual(res.allMatches.length, 4);

  // Replace "Is" -> "Was"
  const rep1 = TextScanner.replaceWordAt(text, res.allMatches[0].start, res.allMatches[0].end);
  assert.strictEqual(rep1.newText.startsWith('Was it ready?'), true);

  // Replace "Are" -> "Were"
  const rep2 = TextScanner.replaceWordAt(text, res.allMatches[1].start, res.allMatches[1].end);
  assert.strictEqual(rep2.newText.includes('Were they coming?'), true);

  // Replace "IS" -> "WAS"
  const rep3 = TextScanner.replaceWordAt(text, res.allMatches[2].start, res.allMatches[2].end);
  assert.strictEqual(rep3.newText.includes('What WAS that?'), true);

  // Replace "ARE" -> "WERE"
  const rep4 = TextScanner.replaceWordAt(text, res.allMatches[3].start, res.allMatches[3].end);
  assert.strictEqual(rep4.newText.endsWith('Who WERE they?'), true);
}

// 4. Test non-matching words with "is" and "are" substrings
{
  const text = 'The island is isolated, dismiss the issue in this area where parents share fare.';
  const res = TextScanner.scanText(text);
  assert.strictEqual(res.allMatches.length, 1, 'Only the standalone "is" should match');
  assert.strictEqual(res.allMatches[0].start, 11);
}

// 5. Test empty / whitespace / punctuation only
{
  assert.strictEqual(TextScanner.scanText('').hasMatches, false);
  assert.strictEqual(TextScanner.scanText('   ').hasMatches, false);
  assert.strictEqual(TextScanner.scanText('!??.').hasMatches, false);
}

// 6. Test AllowlistUtils
{
  const allowlist = ['example.com', 'localhost:8080', 'test.org', 'file://*'];

  // Matches domain & subdomains
  assert.strictEqual(AllowlistUtils.isUrlAllowed('https://example.com/page', allowlist), true);
  assert.strictEqual(AllowlistUtils.isUrlAllowed('http://sub.example.com', allowlist), true);
  assert.strictEqual(AllowlistUtils.isUrlAllowed('http://localhost:8080/dashboard', allowlist), true);
  assert.strictEqual(AllowlistUtils.isUrlAllowed('file:///home/user/test.html', allowlist), true);

  // Does NOT match non-allowlisted domains
  assert.strictEqual(AllowlistUtils.isUrlAllowed('https://google.com', allowlist), false);
  assert.strictEqual(AllowlistUtils.isUrlAllowed('https://notexample.com', allowlist), false);
  assert.strictEqual(AllowlistUtils.isUrlAllowed('http://localhost:3000', allowlist), false);

  // Normalization
  assert.strictEqual(AllowlistUtils.normalizePattern('https://GitHub.com/path'), 'github.com');
  assert.strictEqual(AllowlistUtils.normalizePattern('  EXAMPLE.ORG/  '), 'example.org');
}

console.log('[PASS] ALL UNIT TESTS PASSED!');
