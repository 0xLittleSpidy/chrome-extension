# Project Rules and Guidelines

- Never use emoji in code, comments, documentation, commit messages, or user interfaces.
- Perform a mandatory live browser QA process (`npm run qa` or `npm test`) every time code is built or changed before committing and pushing. The QA process must start an HTTP server, launch Chromium with the unpacked extension loaded, open the test site, and verify all features end-to-end.
- Always commit and push changes immediately after verifying with the QA suite.
