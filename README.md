# Prompt Outline Navigator

[English](README.md) | [日本語](README.ja.md)

A live table-of-contents and navigation sidebar for ChatGPT and Gemini conversations.

Prompt Outline Navigator is an independent project and is not affiliated with or endorsed by OpenAI or Google.

**Release:** Gemini support is available in [v1.7.0](https://github.com/ten9miq/prompt-outline-navigator/releases/tag/v1.7.0). The GitHub release includes the formal ZIP and checksum. Version 1.7.0 was submitted to the Chrome Web Store on 2026-10-24 and is awaiting review; the currently published store version remains 1.6.3.

[Privacy Policy](PRIVACY.md)

[![Get it on the Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Get%20it-blue?logo=googlechrome)](https://chromewebstore.google.com/detail/prompt-outline-navigator/nleamodjnjbpcemdbcemfpbaelkkmmpe)

## Supported sites

| Content | ChatGPT | Gemini |
| --- | --- | --- |
| Site access | `https://chatgpt.com/*`, `https://chat.openai.com/*` | `https://gemini.google.com/*` |
| Conversation outline | Normal and GPT/project conversations | Rendered conversation history |
| Other outline sources | Active Space documents and dot feeds | Canvas and notebooks are not outline sources |
| Width adjustments | Responses and composers, including initial/project-home inputs | Responses, sent prompts, inputs and response actions in regular `/app` chats |
| History removed from the DOM | Discovered entries are retained and recovery is attempted | Detached turns are not retained or recovered |

## Features

- Opens a sidecar at the top of the screen without reparenting the site's app root. Hover over its left boundary for the same resize cursor and subtle border highlight as the ChatGPT sidebar. Drag it to resize it (default 200px, range 160–600px); its width and open/closed state are saved locally. Narrow windows temporarily limit the displayed width without overwriting the saved width. Double-click the boundary to reset its width to 200px without changing the display mode. While hidden, hovering over the rightmost 20px of the window previews the TOC over the page so entries remain selectable without resizing the page. Leaving the preview hides it again. The header pin button switches between pinned and hover modes, showing a pin or crossed-out pin for the current mode. Pinning reserves space again; no floating TOC button is shown. Focus the boundary and use Left/Right to resize or Enter to hide. Home keeps its normal upward navigation and never changes the width.
- Detects supported content by its DOM structure rather than a URL allowlist: ChatGPT conversations (including GPT/project conversations), active Space documents and dot feeds, plus Gemini conversation history. Document previews, navigation, quoted reply controls, and composers are excluded. Attachment-only prompts are supported. Reserved width follows the saved manual open/closed state; hover previews do not change it. The saved state is maintained, including across page transitions, settings, and overlays. Pages without supported content show an empty-state message in the same sidebar. Drag the title bar downward to move the sidebar temporarily without changing the reserved width. Double-click the title bar to return to the top while preserving the width and hover mode. Focus the title and press Home to return to the top without changing the width. Up/Down keys move it by 10px. The position is not saved and resets on page transitions or reloads.
- In ChatGPT, keeps writing editors embedded in a conversation under their original prompt instead of replacing the conversation TOC. Editor entries use the email subject, a level-one heading, or the first nonempty content line (up to 80 characters, respecting explicit line breaks). Real headings (including ARIA headings) take priority; when an editor has none, short numbered paragraphs whose entire text is bold are used as section entries. Ordinary emphasis, quoted/list/table content, previews, and composers are excluded from this fallback. Multiple embedded editors, edits, and remounts are supported; standalone documents retain their own TOC.
- On ChatGPT, always enables width adjustments for conversation responses and composers, including initial composers on Chat, Work, and project home screens, independently of TOC visibility or the detected TOC source. Composers are identified by the shared `data-chatgpt-composer` / `data-thread-find-composer` attributes rather than a URL or placement value; nested width caps inside their pane are adjusted as well. Multiple composers and attribute changes are supported. Opening a writing editor does not disable these adjustments. Pane and dialog boundaries, unrelated settings fields, Space documents, and dot feeds keep their own layout. Unavailable Workspace Agent settings screens have not been verified; their composers are covered only if they expose the same shared attributes.
- Keeps wide tables and preformatted content accessible with scoped overflow and wrapping rules.
- Updates only changed turns and headings with `MutationObserver`.
- Retains discovered TOC entries, their conversation order, and their first resolved prompt labels when ChatGPT temporarily removes or remounts older turns, and reloads those turns when a retained entry is selected. Normal clicks use smooth scrolling and correct the position after scrolling ends; virtualized destination recovery uses immediate scrolling. If loading earlier history shifts a cached destination, recovery narrows the search using the order of currently rendered turns. New clicks and user scrolling cancel pending corrections.
- Shows a “Go to conversation start” TOC control only when earlier conversation turns are omitted from the rendered DOM, detected through the current virtualizer layout or cached earlier groups. Scrolling within fully rendered content does not show it. Selecting it scrolls to the start so ChatGPT can reveal earlier turns; it disappears when those turns are rendered again. Detection depends on the ChatGPT DOM structure and does not use a conversation-history API.
- Selects the response region containing the navigation line, then tracks the nearest preceding heading only within that response. During transient ChatGPT remounts it retains the current selection instead of jumping to a distant prompt.
- Keeps the active TOC entry visible during page navigation. When new entries are added, the TOC follows them only if it was already at the end; otherwise it preserves the current TOC scroll position.
- Renders prompt and heading text with `textContent`, including text that looks like HTML. TOC entries display at most two lines; hovering over the label shows its text before visual clipping.
- Supports nested heading collapse, prompt-group collapse, theme-adjusted hierarchy and active-prompt colors for light/dark modes, and SPA navigation.

ChatGPT conversation detection accepts both boolean and conversation-ID root markers, prioritizes visible explicit conversation roots, and falls back to a marked conversation scroll pane when necessary. Response bodies can be discovered before role markers or message IDs arrive. Nested wrappers and remounts are deduplicated by message identity; delayed prompt recognition corrects the label without overwriting a resolved label for the same prompt ID. Rendered responses are retained even when their prompt is temporarily missing.

Outline inclusion and navigation readiness share one content-state policy. In ChatGPT, cached history survives virtualization and replacement of the root within the same conversation; connected hidden alternatives and an answer replaced in the same live response slot are removed. Conversation order is retained when only a sparse set of turns is rendered. Ordinary response tokens do not rebuild outlines; editor changes are coalesced at 120ms intervals and reconcile only affected responses. These safeguards depend on the rendered ChatGPT DOM and do not fetch conversation history.

Writing blocks displayed as raw Markdown, including read-only copies in branched local conversations, also expose a document entry and `#`–`######` heading entries. Fenced code is excluded. Navigation uses text ranges to reach the heading line without inserting elements into the document or changing its text. Switching between raw and rich editor views rebuilds the outline; hidden branch copies, previews, and composers remain excluded.

When a partial writing revision collapses the original document, its headings stay under the original prompt. The exception applies only to the document region linked to its own expand button, not unrelated hidden content. Selecting a heading in that region expands the original document and waits for any remount before scrolling. Collapsed headings are excluded from active-position tracking until expanded.

### Gemini behavior and limitations

Gemini groups sent prompts with their response headings and follows streaming headings, remounts, SPA conversation changes, and light/dark themes. Screen-reader labels, thinking panels, toolbars, navigation and composers are excluded from the outline. Attachment-only prompts remain usable as groups.

In regular `/app` chats, the available pane width is used for responses, sent-prompt bubbles, initial/existing inputs, and response action rows. The response wrapper adds 32px of inner padding per side, or 16px at viewport widths of 700px or less; Gemini's native block spacing is preserved. Lists, quotes, code and tables keep their structure. Native input margins are included in the sizing so fields and buttons stay inside the pane.

Canvas content and notebooks are not indexed or widened. Their layout coexistence has been checked: mobile fullscreen Canvas temporarily hides the TOC and its hover trigger without changing the saved mode, and closing it restores that mode. Narrow inline code Canvas headers wrap their controls to keep sharing, expansion and closing accessible.

A live 20-turn conversation (about 32,000 response characters and 58 headings) was checked for updates, navigation and order. All turns remained in the DOM using `content-visibility:auto`; DOM-removal virtualization did not occur. Gemini entries for truly detached turns are **not retained or recovered**, so this is not a claim of ChatGPT-equivalent history recovery. See [Gemini support and verification](docs/GEMINI_SUPPORT.md) for the boundaries and known third-party shortcut conflict.

## Development

```powershell
npm test
npm run test:unit
npm run test:browser
npm run check
```

`npm test` runs both the Node.js unit tests and the Playwright browser fixture. Browser tests require Node.js 20 or newer; install Playwright's Chromium once with `npx playwright install chromium`.

The content scripts are split by responsibility: shared helpers, content-source adapters, sidebar UI, conversation synchronization, navigation, active-position tracking, and the `content.js` bootstrap. Keep their order in `manifest.json` when adding or moving code.

The [TOC reliability audit and regression matrix (Japanese)](docs/TOC_RELIABILITY.md) records the content-state rules, earlier implementation comparisons, protected transitions, and the boundary between fixture and live-page verification. `tests/toc-lifecycle.spec.js` exercises complete state transitions as well as incremental-update isolation.

Load this directory with **Chrome > Extensions > Developer mode > Load unpacked**.

For the Windows workflow used to develop against the live ChatGPT UI, see [Chrome DevTools MCP development and verification (Japanese)](docs/CHROME_DEVTOOLS_MCP.md). It covers a dedicated Chrome profile, Codex connection setup, extension/page reloads, geometry and scrolling measurements, and Console error attribution.

Live-page investigation and verification use that dedicated Chrome (`%LOCALAPPDATA%\Chrome-MCP-Test`, debug port `9222`) through Chrome DevTools MCP. The agent launches it when needed, or verifies and reuses the same dedicated instance. Open target URLs there; do not use existing tabs in everyday browsers such as Brave unless the user explicitly requests them. If connection fails, troubleshoot the documented setup instead of falling back to everyday browser tabs. The user completes login and authentication challenges in the dedicated Chrome.

The Playwright tests serve `tests/browser-fixture.html` at a simulated ChatGPT conversation URL in Chromium and check its anonymized conversation DOM, sidebar initialization, safe text rendering, incremental updates, virtualized turn retention, and pin/unpin behavior, including boundary/title resets that preserve hover mode. They also check document and message-feed adapters on unfamiliar URLs, preview exclusion, initial composer width and first-message DOM transitions, repeated upper/lower navigation, stable sidebar visibility and reserved width across page transitions and modal/non-modal overlays for both saved visibility states without storage writes, attachment-only prompts with long responses, and conversation-root replacement. `tests/layout-fixture.html` verifies conversation and unavailable-screen widths and the sidebar's top clearance at 1280px and 1920px viewport widths. Additional layout checks cover an app shell with an inline viewport width and a composer outside the conversation root. The layout fixture supports manual inspection in a browser; these checks do not replace testing on the live ChatGPT UI.

Regression fixtures also cover conversation-ID roots, attachment-only prompts with nested message wrappers, delayed source/role/editor attributes, missing prompts, distinct responses within one turn, same-root conversation changes, and outline updates during continuous editor changes.

`tests/gemini.spec.js` uses anonymous Gemini DOM fixtures for prompt pairing, response-only heading extraction, heading/prompt navigation, streaming updates, response replacement and remounts, attachment-only prompts, late history markers, SPA changes, light/dark themes, and response/query/input widths across pinned, hover, and narrow layouts, with Canvas and notebook exclusions. These fixture checks are separate from live Gemini verification. After reloading the unpacked extension, reload existing Gemini tabs as well; an updated installation may require permission for `gemini.google.com`.

### Chrome Web Store package

Build a minimal review package containing only manifest-referenced runtime files and the license:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-store-package.ps1
```

The script runs `npm run build` (JavaScript syntax checks, unit and browser tests), verifies the exact ZIP file list and every packaged file against its source, and prints its SHA-256 hash. The output is written to `dist/prompt-outline-navigator-<version>-chrome-web-store.zip`. Use `-Review` for a review-only ZIP with a `-review` suffix. Use `-SkipTests` only immediately after successful checks of the unchanged runtime. Release versions are incremented once immediately before merging to `main`; a review ZIP using an already-published version must not be submitted as an update.

See [release preparation](docs/RELEASE.md) for listing drafts, privacy declarations, safe sample screenshots and final submission steps. Regenerate the sample screenshots with `node scripts/capture-store-screenshots.js`.

The published [v1.6.3 release](https://github.com/ten9miq/prompt-outline-navigator/releases/tag/v1.6.3) contains the ChatGPT cached-history navigation fix. Its original ZIP is `dist/prompt-outline-navigator-1.6.3-chrome-web-store.zip`; Gemini support is available separately in [v1.7.0](https://github.com/ten9miq/prompt-outline-navigator/releases/tag/v1.7.0). The Gemini update uses `1.7.0`. See [release preparation](docs/RELEASE.md) for its formal ZIP and remaining publication steps. The [1.6.2 release](https://github.com/ten9miq/prompt-outline-navigator/releases/tag/v1.6.2) improved outline discovery, partial writing revisions, message identity and virtualized-history handling.

The previous version `1.6.0` and its verified store package were prepared at the owner's request. The ZIP is `dist/prompt-outline-navigator-1.6.0-chrome-web-store.zip`. See the [GitHub release](https://github.com/ten9miq/prompt-outline-navigator/releases/tag/v1.6.0) for downloads; Chrome Web Store submission is separate.

## Origin

Based on [ChatGPT Table of Contents](https://github.com/WindZZzzZZzz/gpt-toc-extension) by Leo Z. The initial source snapshot is Chrome Web Store version 1.2.1.

## License

Released under the [MIT License](LICENSE). The original project's copyright notice is retained.
