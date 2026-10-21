const assert = require('assert');
const TextScanner = require('../lib/text-scanner');
const AllowlistUtils = require('../lib/allowlist-utils');
const StorageManager = require('../lib/storage-manager');

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

// 7. Test Dynamic User-Configured Rules in TextScanner
{
  const customRules = [
    { id: 'rule-fast-slow', find: 'fast', replace: 'slow', matchCase: true, wholeWord: true },
    { id: 'rule-quick-steady', find: 'quick', replace: 'steady', matchCase: true, wholeWord: true }
  ];

  const text = 'The FAST runner was quick to stop. Breakfast is not fast food.';
  const res = TextScanner.scanTextWithRules(text, customRules);

  assert.strictEqual(res.hasMatches, true);
  assert.strictEqual(res.allMatches.length, 3);

  // Match 1: "FAST" -> "SLOW" (case preservation uppercase)
  assert.strictEqual(res.allMatches[0].word, 'FAST');
  assert.strictEqual(res.allMatches[0].replacement, 'SLOW');

  // Match 2: "quick" -> "steady"
  assert.strictEqual(res.allMatches[1].word, 'quick');
  assert.strictEqual(res.allMatches[1].replacement, 'steady');

  // Match 3: "fast" -> "slow"
  assert.strictEqual(res.allMatches[2].word, 'fast');
  assert.strictEqual(res.allMatches[2].replacement, 'slow');

  // Verify "Breakfast" does NOT match "fast" because of wholeWord: true
  const breakfastText = 'We eat breakfast every morning.';
  const bfRes = TextScanner.scanTextWithRules(breakfastText, customRules);
  assert.strictEqual(bfRes.hasMatches, false);

  // Test substring rule with wholeWord: false
  const substringRules = [
    { id: 'rule-foo-bar', find: 'foo', replace: 'bar', matchCase: false, wholeWord: false }
  ];
  const subRes = TextScanner.scanTextWithRules('Good seafood is fresh.', substringRules);
  assert.strictEqual(subRes.hasMatches, true);
  assert.strictEqual(subRes.allMatches[0].word, 'foo');
}

// 8. Test StorageManager JSON Import / Export Validation
(async () => {
  // Test export structure
  const exportPayload = {
    version: 1,
    appName: 'Helper',
    exportedAt: new Date().toISOString(),
    allowlist: ['example.com', 'test.org'],
    snippets: [
      { id: 's1', heading: 'Email Signature', description: 'Best regards,\nUser', updatedAt: 12345 }
    ],
    replacer_rules: [
      { id: 'r1', find: 'cat', replace: 'dog', matchCase: true, wholeWord: true }
    ]
  };

  // Mock chrome.storage for Node environment test
  const storageStore = {};
  global.chrome = {
    storage: {
      sync: {
        get: async (keys) => {
          const res = {};
          for (const k of keys) {
            if (storageStore[k] !== undefined) res[k] = storageStore[k];
          }
          return res;
        },
        set: async (obj) => {
          Object.assign(storageStore, obj);
        }
      }
    }
  };

  // Test import valid config
  await StorageManager.importConfiguration(JSON.stringify(exportPayload));
  const importedList = await StorageManager.getAllowlist();
  assert.deepStrictEqual(importedList, ['example.com', 'test.org']);

  const importedSnippets = await StorageManager.getSnippets();
  assert.strictEqual(importedSnippets.length, 1);
  assert.strictEqual(importedSnippets[0].heading, 'Email Signature');

  const importedRules = await StorageManager.getReplacerRules();
  assert.strictEqual(importedRules.length, 1);
  assert.strictEqual(importedRules[0].find, 'cat');

  // Test invalid import payloads
  await assert.rejects(
    async () => StorageManager.importConfiguration('INVALID JSON STRING'),
    /Invalid JSON format/
  );

  await assert.rejects(
    async () => StorageManager.importConfiguration(JSON.stringify({})),
    /No valid settings, snippets, or rules found/
  );

  // Test Snippets CRUD
  await StorageManager.saveSnippet({ heading: 'Test Heading', description: 'Test Content' });
  let snips = await StorageManager.getSnippets();
  assert.strictEqual(snips.length, 2);
  const createdSnippet = snips.find(s => s.heading === 'Test Heading');
  assert.ok(createdSnippet);

  await StorageManager.deleteSnippet(createdSnippet.id);
  snips = await StorageManager.getSnippets();
  assert.strictEqual(snips.length, 1);

  // Test Per-Site Replacer & Storage Switches
  assert.strictEqual(await StorageManager.getSiteReplacerEnabled('example.com'), true);
  await StorageManager.setSiteReplacerEnabled('example.com', false);
  assert.strictEqual(await StorageManager.getSiteReplacerEnabled('example.com'), false);

  assert.strictEqual(await StorageManager.getSiteStorageEnabled('example.com'), true);
  await StorageManager.setSiteStorageEnabled('example.com', false);
  assert.strictEqual(await StorageManager.getSiteStorageEnabled('example.com'), false);

  console.log('[PASS] ALL UNIT TESTS PASSED!');
})();
