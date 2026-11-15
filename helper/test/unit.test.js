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
  assert.strictEqual(AllowlistUtils.normalizePattern('https://GitHub.com/path'), 'https://github.com/path');
  assert.strictEqual(AllowlistUtils.normalizePattern('  EXAMPLE.ORG/  '), 'example.org');
  assert.strictEqual(AllowlistUtils.normalizePattern('https://goo.com/abcd?ads=asa'), 'https://goo.com/abcd?ads=asa');

  // Exact path and query parameter matching
  const granularAllowlist = [
    'https://goo.com/abcd?ads=asa',
    'https://api.site.com/v1/auth'
  ];
  assert.strictEqual(AllowlistUtils.isUrlAllowed('https://goo.com/abcd?ads=asa', granularAllowlist), true);
  assert.strictEqual(AllowlistUtils.isUrlAllowed('https://goo.com/abcd?aew=dsd', granularAllowlist), false);
  assert.strictEqual(AllowlistUtils.isUrlAllowed('https://goo.com/abcd', granularAllowlist), false);
  assert.strictEqual(AllowlistUtils.isUrlAllowed('https://api.site.com/v1/auth', granularAllowlist), true);
  assert.strictEqual(AllowlistUtils.isUrlAllowed('https://api.site.com/v1/other', granularAllowlist), false);
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
  const syncStore = {};
  const localStore = {};
  global.chrome = {
    storage: {
      sync: {
        get: async (keys) => {
          const res = {};
          for (const k of keys) {
            if (syncStore[k] !== undefined) res[k] = syncStore[k];
          }
          return res;
        },
        set: async (obj) => {
          Object.assign(syncStore, obj);
        }
      },
      local: {
        get: async (keys) => {
          const res = {};
          for (const k of keys) {
            if (localStore[k] !== undefined) res[k] = localStore[k];
          }
          return res;
        },
        set: async (obj) => {
          Object.assign(localStore, obj);
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

  // Test Snippets CRUD with Multi-Answer support
  await StorageManager.saveSnippet({
    heading: 'Multi-Answer Question',
    description: 'Answer 1: Restart router',
    answers: [
      'Answer 1: Restart router',
      'Answer 2: Check cables',
      'Answer 3: Call ISP'
    ]
  });
  let snips = await StorageManager.getSnippets();
  assert.strictEqual(snips.length, 2);
  const multiAnswerSnip = snips.find(s => s.heading === 'Multi-Answer Question');
  assert.ok(multiAnswerSnip);
  assert.strictEqual(multiAnswerSnip.answers.length, 3);
  assert.strictEqual(multiAnswerSnip.answers[1], 'Answer 2: Check cables');
  assert.strictEqual(multiAnswerSnip.description, 'Answer 1: Restart router');

  // Verify backward compatibility: snippet without answers gets answers array generated
  await StorageManager.saveSnippet({ heading: 'Legacy Snippet', description: 'Single description string' });
  snips = await StorageManager.getSnippets();
  const legacySnip = snips.find(s => s.heading === 'Legacy Snippet');
  assert.ok(legacySnip);
  assert.deepStrictEqual(legacySnip.answers, ['Single description string']);

  await StorageManager.deleteSnippet(multiAnswerSnip.id);
  await StorageManager.deleteSnippet(legacySnip.id);
  snips = await StorageManager.getSnippets();
  assert.strictEqual(snips.length, 1);

  // Test Snippets Scale Past 22 Items Limit (Testing 50 items)
  for (let i = 2; i <= 50; i++) {
    await StorageManager.saveSnippet({
      id: `snip-scale-${i}`,
      heading: `Snippet ${i} Heading`,
      description: `Description option 1 for snippet ${i} with detailed instructions.`,
      answers: [
        `Description option 1 for snippet ${i} with detailed instructions.`,
        `Alternative option 2 for snippet ${i} with further notes.`
      ]
    });
  }
  const scaledSnippets = await StorageManager.getSnippets();
  assert.strictEqual(scaledSnippets.length, 50, 'StorageManager must reliably store and return 50+ snippets without quota limits');
  const snip50 = scaledSnippets.find(s => s.id === 'snip-scale-50');
  assert.ok(snip50, 'Snippet 50 must exist');
  assert.strictEqual(snip50.answers.length, 2);

  // Clean up scaled snippets
  for (let i = 2; i <= 50; i++) {
    await StorageManager.deleteSnippet(`snip-scale-${i}`);
  }
  const cleanedSnippets = await StorageManager.getSnippets();
  assert.strictEqual(cleanedSnippets.length, 1);

  // Test Sync-to-Local Snippet Migration
  localStore.snippets = undefined;
  syncStore.snippets = [
    { id: 'migrated-1', heading: 'Migrated Heading', description: 'Migrated text', answers: ['Migrated text'] }
  ];
  const migratedResult = await StorageManager.getSnippets();
  assert.strictEqual(migratedResult.length, 1);
  assert.strictEqual(migratedResult[0].heading, 'Migrated Heading');
  assert.ok(Array.isArray(localStore.snippets), 'Snippets must have been migrated to local storage');
  assert.strictEqual(localStore.snippets[0].heading, 'Migrated Heading');

  // Test Theme Management (Dark Theme Default)
  assert.strictEqual(await StorageManager.getTheme(), 'dark', 'Theme should default to dark');
  await StorageManager.setTheme('light');
  assert.strictEqual(await StorageManager.getTheme(), 'light');
  await StorageManager.setTheme('dark');
  assert.strictEqual(await StorageManager.getTheme(), 'dark');

  // Test Local File Configured State
  assert.strictEqual(await StorageManager.getFileConfigured(), false);
  await StorageManager.setFileConfigured(true);
  assert.strictEqual(await StorageManager.getFileConfigured(), true);

  // Test Per-Site Replacer & Storage Switches
  assert.strictEqual(await StorageManager.getSiteReplacerEnabled('example.com'), true);
  await StorageManager.setSiteReplacerEnabled('example.com', false);
  assert.strictEqual(await StorageManager.getSiteReplacerEnabled('example.com'), false);

  assert.strictEqual(await StorageManager.getSiteStorageEnabled('example.com'), true);
  await StorageManager.setSiteStorageEnabled('example.com', false);
  assert.strictEqual(await StorageManager.getSiteStorageEnabled('example.com'), false);

  // 12. Test Header Redaction & Truncation logic
  function testTransformHeaders(fullText, mode) {
    const tag = (mode === 'truncate') ? '[truncated]' : '[redacted]';
    let transformed = fullText.replace(/(cookie\s*:\s*)([^\r\n]+)/gi, (match, prefix, cookiesStr) => {
      const pairs = cookiesStr.split(';');
      const newPairs = pairs.map(pair => {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) return pair;
        const keyPart = pair.slice(0, eqIdx + 1);
        const valPart = pair.slice(eqIdx + 1);
        const trimmedVal = valPart.trim();
        const leadingSpaces = valPart.match(/^\s*/)[0];
        const trailingSpaces = valPart.match(/\s*$/)[0];

        let newVal;
        if (trimmedVal.length <= 6) {
          newVal = tag;
        } else {
          newVal = trimmedVal.slice(0, 3) + tag + trimmedVal.slice(-3);
        }
        return keyPart + leadingSpaces + newVal + trailingSpaces;
      });
      return prefix + newPairs.join(';');
    });

    transformed = transformed.replace(/(authorization\s*:\s*)([^\r\n]+)/gi, (match, prefix, authVal) => {
      const trimmedVal = authVal.trim();
      const leadingSpaces = authVal.match(/^\s*/)[0];
      const trailingSpaces = authVal.match(/\s*$/)[0];

      const authMatch = trimmedVal.match(/^([a-zA-Z0-9_-]+\s+)(.*)$/);
      let authScheme = '';
      let token = trimmedVal;
      if (authMatch) {
        authScheme = authMatch[1];
        token = authMatch[2];
      }

      let newToken;
      if (token.length <= 6) {
        newToken = tag;
      } else {
        newToken = token.slice(0, 3) + tag + token.slice(-3);
      }

      return prefix + leadingSpaces + authScheme + newToken + trailingSpaces;
    });

    return transformed;
  }

  // Test Cookie redaction
  const cookieInput = 'cookie: google=abcdef123xyz ; yahoo=abcdef456xyz';
  const cookieRedacted = testTransformHeaders(cookieInput, 'redact');
  assert.strictEqual(cookieRedacted, 'cookie: google=abc[redacted]xyz ; yahoo=abc[redacted]xyz');

  // Test Cookie truncation
  const cookieTruncated = testTransformHeaders(cookieInput, 'truncate');
  assert.strictEqual(cookieTruncated, 'cookie: google=abc[truncated]xyz ; yahoo=abc[truncated]xyz');

  // Test Authorization redaction with Bearer scheme
  const authInput = 'Authorization: bearer ada1234567xyz';
  const authRedacted = testTransformHeaders(authInput, 'redact');
  assert.strictEqual(authRedacted, 'Authorization: bearer ada[redacted]xyz');

  // Test short secret (<= 6 chars)
  const shortInput = 'Authorization: Bearer secret\ncookie: session=12345';
  const shortRedacted = testTransformHeaders(shortInput, 'redact');
  assert.strictEqual(shortRedacted, 'Authorization: Bearer [redacted]\ncookie: session=[redacted]');

  // 13. Test Category Rename and Delete (with Reassign and Purge options)
  await StorageManager.setCategories(['General', 'Billing', 'Support']);
  const billSnip = await StorageManager.saveSnippet({
    heading: 'Billing Invoice',
    category: 'Billing',
    description: 'Invoice details'
  });
  const supSnip = await StorageManager.saveSnippet({
    heading: 'Support Ticket',
    category: 'Support',
    description: 'Ticket details'
  });

  // Test rename category
  await StorageManager.renameCategory('Billing', 'Finance');
  assert.strictEqual((await StorageManager.getCategories()).includes('Finance'), true);
  assert.strictEqual((await StorageManager.getCategories()).includes('Billing'), false);
  const updatedBillSnip = (await StorageManager.getSnippets()).find(s => s.id === billSnip.id);
  assert.strictEqual(updatedBillSnip.category, 'Finance');

  // Test delete category with reassign to General
  await StorageManager.deleteCategory('Finance', true);
  assert.strictEqual((await StorageManager.getCategories()).includes('Finance'), false);
  const reassignedSnip = (await StorageManager.getSnippets()).find(s => s.id === billSnip.id);
  assert.strictEqual(reassignedSnip.category, 'General');

  // Test delete category with purge (delete snippets)
  await StorageManager.deleteCategory('Support', false);
  assert.strictEqual((await StorageManager.getCategories()).includes('Support'), false);
  const deletedSnip = (await StorageManager.getSnippets()).find(s => s.id === supSnip.id);
  assert.strictEqual(deletedSnip, undefined);

  // Test Per-Site Transform & Unwanted Headers switches
  assert.strictEqual(await StorageManager.getSiteTransformEnabled('example.com'), true);
  await StorageManager.setSiteTransformEnabled('example.com', false);
  assert.strictEqual(await StorageManager.getSiteTransformEnabled('example.com'), false);

  assert.strictEqual(await StorageManager.getSiteUnwantedHeadersEnabled('example.com'), true);
  await StorageManager.setSiteUnwantedHeadersEnabled('example.com', false);
  assert.strictEqual(await StorageManager.getSiteUnwantedHeadersEnabled('example.com'), false);

  // 14. Test Categories & Snippet Reordering
  assert.strictEqual((await StorageManager.getCategories()).includes('General'), true);
  await StorageManager.addCategory('Support');
  assert.strictEqual((await StorageManager.getCategories()).includes('Support'), true);

  const testSnip1 = await StorageManager.saveSnippet({
    heading: 'First Snippet',
    category: 'Support',
    description: 'First description'
  });
  const testSnip2 = await StorageManager.saveSnippet({
    heading: 'Second Snippet',
    category: 'General',
    description: 'Second description'
  });

  const reordered = await StorageManager.reorderSnippets([testSnip2.id, testSnip1.id]);
  const retrievedSnippets = await StorageManager.getSnippets();
  const idx2 = retrievedSnippets.findIndex(s => s.id === testSnip2.id);
  const idx1 = retrievedSnippets.findIndex(s => s.id === testSnip1.id);
  assert.strictEqual(idx2 < idx1, true, 'Second snippet should precede first snippet after reorder');

  // 15. Test Shortcuts CRUD
  const sc1 = await StorageManager.saveShortcut({ name: 'Copy', keys: 'Ctrl+C' });
  assert.strictEqual((await StorageManager.getShortcuts()).length, 1);
  assert.strictEqual((await StorageManager.getShortcuts())[0].name, 'Copy');
  await StorageManager.deleteShortcut(sc1.id);
  assert.strictEqual((await StorageManager.getShortcuts()).length, 0);

  // Test Site Shortcuts state
  assert.strictEqual(await StorageManager.getSiteShortcutsEnabled('example.com'), true);
  await StorageManager.setSiteShortcutsEnabled('example.com', false);
  assert.strictEqual(await StorageManager.getSiteShortcutsEnabled('example.com'), false);

  // 16. Test Unwanted Headers Cleaner Matching
  const unwantedHeaders = await StorageManager.getUnwantedHeaders();
  assert.strictEqual(unwantedHeaders.includes('sec-fetch-*'), true);
  assert.strictEqual(unwantedHeaders.includes('sec-ch-ua-*'), true);
  assert.strictEqual(unwantedHeaders.includes('Accept-Language'), true);

  function matchesHeader(line, pattern) {
    const cleanPat = pattern.trim().toLowerCase().replace(/:$/, '');
    const colonIdx = line.indexOf(':');
    const headerName = (colonIdx !== -1 ? line.slice(0, colonIdx) : line).trim().toLowerCase();
    if (cleanPat.endsWith('*')) {
      return headerName.startsWith(cleanPat.slice(0, -1));
    }
    return headerName === cleanPat;
  }

  const rawHeaders = [
    'Host: example.com',
    'sec-fetch-dest: empty',
    'sec-fetch-mode: cors',
    'sec-ch-ua-mobile: ?0',
    'X-pwnfox-color: red',
    'Accept-Language: en-US,en;q=0.9',
    'Upgrade-Insecure-Requests: 1',
    'Priority: u=1',
    'Accept-Encoding: gzip, deflate',
    'Content-Type: application/json'
  ];

  const cleaned = rawHeaders.filter(line => !unwantedHeaders.some(pat => matchesHeader(line, pat)));
  assert.strictEqual(cleaned.length, 2);
  assert.strictEqual(cleaned[0], 'Host: example.com');
  assert.strictEqual(cleaned[1], 'Content-Type: application/json');

  // 17. Test Import & Export with Merge Mode
  const exportPayload2 = await StorageManager.exportConfiguration();
  assert.strictEqual(Array.isArray(exportPayload2.allowlist), true);
  assert.strictEqual(Array.isArray(exportPayload2.shortcuts), true);
  assert.strictEqual(Array.isArray(exportPayload2.unwanted_headers), true);

  // Test merge mode
  const mergeFile = JSON.stringify({
    shortcuts: [{ id: 'sc-merged', name: 'Select All', keys: 'Ctrl+A' }]
  });
  await StorageManager.importConfiguration(mergeFile, 'merge');
  assert.strictEqual((await StorageManager.getShortcuts()).some(s => s.name === 'Select All'), true);

  console.log('[PASS] ALL UNIT TESTS PASSED!');
})();
