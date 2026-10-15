# Prompt Outline Navigator

[English](README.md) | [日本語](README.ja.md)

A live table-of-contents and navigation sidebar for ChatGPT conversations.

Prompt Outline Navigator is an independent project and is not affiliated with or endorsed by OpenAI.

[Privacy Policy](PRIVACY.md)

[![Get it on the Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Get%20it-blue?logo=googlechrome)](https://chromewebstore.google.com/detail/prompt-outline-navigator/nleamodjnjbpcemdbcemfpbaelkkmmpe)

## Features

- Opens a sidecar at the top of the screen without moving ChatGPT's React root. Hover over its left boundary for the same resize cursor and subtle border highlight as the ChatGPT sidebar. Drag it to resize it (default 200px, range 160–600px); its width and open/closed state are saved locally. Narrow windows temporarily limit the displayed width without overwriting the saved width. Double-click the boundary to reset its width to 200px without changing the display mode. While hidden, hovering over the rightmost 6px of the window previews the TOC over the page so entries remain selectable without resizing the page. Leaving the preview hides it again. The header pin button switches between pinned and hover modes, showing a pin or crossed-out pin for the current mode. Pinning reserves space again; no floating TOC button is shown. Focus the boundary and use Left/Right to resize or Enter to hide. Home keeps its normal upward navigation and never changes the width.
- Detects supported content by its DOM structure rather than a URL allowlist: normal and GPT/project conversations, active Space documents, and dot message feeds. Document previews, navigation, quoted reply controls, and composers are excluded. Attachment-only prompts are supported. Reserved width follows the saved manual open/closed state; hover previews do not change it. The saved state is maintained, including across page transitions, settings, and overlays. Pages without supported content show an empty-state message in the same sidebar. Drag the title bar downward to move the sidebar temporarily without changing the reserved width. Double-click the title bar to return to the top while preserving the width and hover mode. Focus the title and press Home to return to the top without changing the width. Up/Down keys move it by 10px. The position is not saved and resets on page transitions or reloads.
- Keeps writing editors embedded in a conversation under their original prompt instead of replacing the conversation TOC. Editor entries use the email subject, a level-one heading, or the opening text. Real headings (including ARIA headings) take priority; when an editor has none, short numbered paragraphs whose entire text is bold are used as section entries. Ordinary emphasis, quoted/list/table content, previews, and composers are excluded from this fallback. Multiple embedded editors, edits, and remounts are supported; standalone documents retain their own TOC.
- Always enables width adjustments for conversation responses, the composer, and initial message composers on new-chat and project home screens, independently of TOC visibility or the detected TOC source. Opening a writing editor does not disable these adjustments. The width rules remain scoped to conversation content and composers; Space documents and dot feeds keep their own content layout.
- Keeps wide tables and preformatted content accessible with scoped overflow and wrapping rules.
- Updates only changed turns and headings with `MutationObserver`.
- Retains discovered TOC entries, their conversation order, and their first resolved prompt labels when ChatGPT temporarily removes or remounts older turns, and reloads those turns when a retained entry is selected. Normal clicks use smooth scrolling and correct the position after scrolling ends; virtualized destination recovery uses immediate scrolling. New clicks and user scrolling cancel pending corrections.
- Shows a “Go to conversation start” TOC control only when earlier conversation turns are omitted from the rendered DOM, detected through the current virtualizer layout or cached earlier groups. Scrolling within fully rendered content does not show it. Selecting it scrolls to the start so ChatGPT can reveal earlier turns; it disappears when those turns are rendered again. Detection depends on the ChatGPT DOM structure and does not use a conversation-history API.
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

For the Windows workflow used to develop against the live ChatGPT UI, see [Chrome DevTools MCP development and verification (Japanese)](docs/CHROME_DEVTOOLS_MCP.md). It covers a dedicated Chrome profile, Codex connection setup, extension/page reloads, geometry and scrolling measurements, and Console error attribution.

The Playwright tests serve `tests/browser-fixture.html` at a simulated ChatGPT conversation URL in Chromium and check its anonymized conversation DOM, sidebar initialization, safe text rendering, incremental updates, virtualized turn retention, and pin/unpin behavior, including boundary/title resets that preserve hover mode. They also check document and message-feed adapters on unfamiliar URLs, preview exclusion, initial composer width and first-message DOM transitions, repeated upper/lower navigation, stable sidebar visibility and reserved width across page transitions and modal/non-modal overlays for both saved visibility states without storage writes, attachment-only prompts with long responses, and conversation-root replacement. `tests/layout-fixture.html` verifies conversation and unavailable-screen widths and the sidebar's top clearance at 1280px and 1920px viewport widths. Additional layout checks cover an app shell with an inline viewport width and a composer outside the conversation root. The layout fixture supports manual inspection in a browser; these checks do not replace testing on the live ChatGPT UI.

### Chrome Web Store package

Build a minimal review package containing only manifest-referenced runtime files and the license:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-store-package.ps1
```

The script runs `npm run build` (JavaScript syntax checks, unit and browser tests), verifies the exact ZIP file list and every packaged file against its source, and prints its SHA-256 hash. The output is written to `dist/prompt-outline-navigator-<version>-chrome-web-store.zip`. Use `-Review` for a review-only ZIP with a `-review` suffix. Use `-SkipTests` only immediately after successful checks of the unchanged runtime. Release versions are incremented once immediately before merging to `main`; a review ZIP using an already-published version must not be submitted as an update.

See [release preparation](docs/RELEASE.md) for listing drafts, privacy declarations, safe sample screenshots and final submission steps. Regenerate the sample screenshots with `node scripts/capture-store-screenshots.js`.

Version `1.6.0` and its verified store package are prepared at the owner's request. The ZIP is `dist/prompt-outline-navigator-1.6.0-chrome-web-store.zip`. See the [GitHub release](https://github.com/ten9miq/prompt-outline-navigator/releases/tag/v1.6.0) for downloads; Chrome Web Store submission is separate.

## Origin

Based on [ChatGPT Table of Contents](https://github.com/WindZZzzZZzz/gpt-toc-extension) by Leo Z. The initial source snapshot is Chrome Web Store version 1.2.1.

## License

Released under the [MIT License](LICENSE). The original project's copyright notice is retained.
