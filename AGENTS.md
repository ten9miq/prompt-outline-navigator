# Repository instructions

## README maintenance

- Keep `README.md` as the English documentation and `README.ja.md` as its Japanese counterpart.
- When features, installation, usage, development steps, compatibility, or project origin change, update both README files in the same commit.
- Keep the two README files equivalent in meaning and section structure. Do not copy stale facts from one language version.
- Preserve commands, file paths, code identifiers, version numbers, and URLs exactly unless the underlying value changes.
- Keep the language-switch links near the top of both README files working.

## Version management

- Keep `manifest.json`, `package.json`, and version assertions unchanged while developing on feature or fix branches.
- Increment the version exactly once, immediately before merging the completed branch into `main`.
- Use that single version for the merge commit, store package, tag, and GitHub release.
- Do not increment the version for individual commits or intermediate branches.
