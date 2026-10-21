---
trigger: always_on
---

# Auto Commit and Push Rule

## Core Directive
Whenever code, documentation, configuration, or any repository files are created, modified, refactored, or deleted:
1. Always stage all modified and newly created files using `git add`.
2. Commit the staged changes immediately with a clear, concise, and descriptive commit message that accurately reflects the modifications made.
3. Push the commit immediately to the remote repository on the active working branch (e.g. `git push origin <branch>`).

## Execution Guidelines
- Stage and commit all relevant changes once a modification or task step is complete.
- Do not leave dirty working directory states or uncommitted code changes behind at the end of a turn or task.
- Commit messages must follow project guidelines: use plain ASCII text only, and strictly avoid emojis or decorative unicode symbols.
- Verify git status and ensure remote push succeeds. If conflicts or errors occur during push, resolve them promptly.

