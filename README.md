# Prompt Outline Navigator

[English](README.md) | [日本語](README.ja.md)

A live table-of-contents and navigation sidebar for ChatGPT conversations.

Prompt Outline Navigator is an independent project and is not affiliated with or endorsed by OpenAI.

[Privacy Policy](PRIVACY.md)

[![Get it on the Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Get%20it-blue?logo=googlechrome)](https://chromewebstore.google.com/detail/prompt-outline-navigator/nleamodjnjbpcemdbcemfpbaelkkmmpe)

## Features

- Opens a full-height 200px sidecar without moving ChatGPT's React root and remembers its open/closed state. Its open button stays below the page header when the sidebar is closed.
- Detects supported content by its DOM structure rather than a URL allowlist: normal and GPT/project conversations, active Space documents, and dot message feeds. Document previews, navigation, quoted reply controls, and composers are excluded. Settings and operation dialogs temporarily hide both the sidebar and its open button and release the reserved width without changing the saved open/closed preference; document viewers remain supported.
- Widens conversation responses, the composer, and initial message composers on new-chat and project home screens independently of TOC visibility. Settings and operation dialogs suspend these width adjustments; Space documents and dot feeds keep their own content layout.
- Keeps wide tables and preformatted content accessible with scoped overflow and wrapping rules.
- Updates only changed turns and headings with `MutationObserver`.
- Retains discovered TOC entries, their conversation order, and their first resolved prompt labels when ChatGPT temporarily removes or remounts older turns, and reloads those turns when a retained entry is selected. Normal clicks use smooth scrolling and correct the position after scrolling ends; virtualized destination recovery uses immediate scrolling. New clicks and user scrolling cancel pending corrections.
- Shows a “Go to conversation start” TOC control while scrolled below the beginning. Selecting it scrolls to the start and may allow ChatGPT to reveal older virtualized turns. It indicates scroll position, not that the TOC is missing earlier entries; groups come from rendered message pairs.
- Selects the response region containing the navigation line, then tracks the nearest preceding heading only within that response. During transient ChatGPT remounts it retains the current selection instead of jumping to a distant prompt.
- Keeps the active TOC entry visible during page navigation. When new entries are added, the TOC follows them only if it was already at the end; otherwise it preserves the current TOC scroll position.
- Renders prompt and heading text with `textContent`, including text that looks like HTML.
- Supports nested heading collapse, prompt-group collapse, theme-adjusted hierarchy and active-prompt colors for light/dark modes, and SPA navigation.

## Development

```powershell
npm test
npm run test:unit
npm run test:browser
npm run check
```

`npm test` runs both the Node.js unit tests and the Playwright browser fixture. Browser tests require Node.js 20 or newer; install Playwright's Chromium once with `npx playwright install chromium`.

The content scripts are split by responsibility: shared helpers, content-source adapters, sidebar UI, conversation synchronization, navigation, active-position tracking, and the `content.js` bootstrap. Keep their order in `manifest.json` when adding or moving code.

Load this directory with **Chrome > Extensions > Developer mode > Load unpacked**.

The Playwright tests serve `tests/browser-fixture.html` at a simulated ChatGPT conversation URL in Chromium and check its anonymized conversation DOM, sidebar initialization, safe text rendering, incremental updates, virtualized turn retention, and close/reopen behavior. They also check document and message-feed adapters on unfamiliar URLs, preview exclusion, initial composer width and first-message DOM transitions, repeated upper/lower navigation, temporary page/dialog suspension for both saved visibility states without storage writes, and conversation-root replacement. `tests/layout-fixture.html` verifies conversation and unavailable-screen widths and the sidebar's top clearance at 1280px and 1920px viewport widths. Additional layout checks cover an app shell with an inline viewport width and a composer outside the conversation root. The layout fixture supports manual inspection in a browser; these checks do not replace testing on the live ChatGPT UI.

### Chrome Web Store package

Build a minimal review package containing only manifest-referenced runtime files and the license:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-store-package.ps1
```

The script runs `npm run build` (JavaScript syntax checks, unit and browser tests), verifies the exact ZIP file list and every packaged file against its source, and prints its SHA-256 hash. The output is written to `dist/prompt-outline-navigator-<version>-chrome-web-store.zip`. Use `-Review` for a review-only ZIP with a `-review` suffix. Use `-SkipTests` only immediately after successful checks of the unchanged runtime. Release versions are incremented once immediately before merging to `main`; a review ZIP using an already-published version must not be submitted as an update.

See [release preparation](docs/RELEASE.md) for listing drafts, privacy declarations, safe sample screenshots and final submission steps. Regenerate the sample screenshots with `node scripts/capture-store-screenshots.js`.

Version `1.4.0` has been prepared at the owner's request as the next store update. Its ZIP is `dist/prompt-outline-navigator-1.4.0-chrome-web-store.zip`; preparation does not submit or publish it.

## Origin

Based on [ChatGPT Table of Contents](https://github.com/WindZZzzZZzz/gpt-toc-extension) by Leo Z. The initial source snapshot is Chrome Web Store version 1.2.1.

## License

Released under the [MIT License](LICENSE). The original project's copyright notice is retained.
