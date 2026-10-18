# Chrome Web Store Listing — Is & Are Replacer

> Last Updated: 2026-10-18

## Store Listing

**Extension Name** [REQUIRED]
Is & Are Replacer

**Short Description** [REQUIRED]
Scan text fields on allowlisted websites for sentences with "is" or "are", highlight them in yellow, and replace in one click.

**Detailed Description** [REQUIRED]
Is & Are Replacer helps writers, editors, and students quickly spot and convert present tense "is" and "are" verbs to past tense "was" and "were" directly inside text fields.

Key Features:
- Underlines and highlights the words "is" and "are" in yellow whenever they appear in a sentence.
- One-click replacement: simply click any highlighted "is" to replace it with "was", or "are" to replace it with "were".
- Preserves your sentences: case matching is maintained ("is" -> "was", "are" -> "were", "Is" -> "Was", "Are" -> "Were", "IS" -> "WAS", "ARE" -> "WERE") while keeping surrounding text intact.
- Smart word matching: matches whole words only; never interferes with words like "island", "issue", "area", "share", or "dismiss".
- Privacy-focused allowlist: the extension is strictly inactive by default and only runs on websites you explicitly approve.
- Easy website management: add or remove websites with a single click from the extension menu.
- Dynamic page support: automatically detects and highlights newly added text boxes and inputs as you browse.

How to use:
1. Click the Is & Are extension icon in your browser toolbar on any website you want to scan.
2. Click "Allow on This Website" to enable scanning.
3. Type or view text in any textbox or input field. Sentences containing "is" or "are" will show matching words underlined in bright yellow.
4. Click on the yellow highlighted word to replace it with its past tense form.

Privacy Note:
All text scanning and replacement occurs 100% locally on your computer inside your browser. No text, input values, or browsing activity is ever transmitted, logged, or shared.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Scans text fields on user-approved websites for the words "is" and "are" and enables one-click replacement with "was" and "were".

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128x128 PNG | Ready | icons/icon-128.png |
| Extension Icon | 48x48 PNG | Ready | icons/icon-48.png |
| Toolbar Icon | 16x16 PNG | Ready | icons/icon-16.png |
| Screenshot 1 [REQUIRED] | 1280x800 or 640x400 | Not created | |

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| storage | permissions | Used to store and synchronize user preferences and the list of user-approved websites across sessions. |
| tabs | permissions | Used to detect the active website domain so the user can allow or disallow the current site with a single click in the popup. |
| activeTab | permissions | Used to interact with the currently focused tab when the user opens the extension menu. |
| <all_urls> | host_permissions | Needed to scan text fields and display highlight overlays exclusively on websites the user has explicitly added to their allowlist. |

## Privacy & Data Use

### Data Collection

Does the extension collect user data? No

### Data Use Certification
- Data is NOT sold to third parties
- Data is NOT used for purposes unrelated to the extension's core functionality
- Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
https://github.com/0xLittleSpidy/is-are-replacer-extension/blob/main/PRIVACY.md

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]
0xLittleSpidy

**Contact Email** [REQUIRED]
developer@example.com

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.1.0 | 2026-10-18 | Added support for "are" -> "were" replacement and removed all emojis across UI and docs. | Draft |
| 1.0.0 | 2026-10-18 | Initial release with text scanning, yellow underline highlights, one-click replacement, and site allowlist management. | Draft |
