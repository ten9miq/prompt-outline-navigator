# Repository instructions

## Browser investigation and verification

- For live-page investigation and verification, follow `docs/CHROME_DEVTOOLS_MCP.md` and use the dedicated Google Chrome profile `%LOCALAPPDATA%\Chrome-MCP-Test` with remote debugging port `9222` through Chrome DevTools MCP.
- If that dedicated Chrome is not running, launch it using the documented procedure. If it is already running, verify the executable and process arguments before reusing it; do not launch a duplicate instance.
- Open the requested URL in the dedicated Chrome. Do not inspect or operate existing tabs in the user's everyday browsers (including Brave), even when they already contain the requested URL, unless the user explicitly requests that browser or tab.
- If MCP cannot connect, check the documented Chrome startup and connection steps. Do not fall back to the user's everyday browser tabs. Report unresolved connection or login requirements; the user completes login and authentication challenges in the dedicated Chrome.
- Do not terminate unrelated browsers, remove profile locks, or change their settings to free the debug port.

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
