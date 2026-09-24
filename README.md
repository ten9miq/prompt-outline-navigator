# Prompt Outline Navigator

[English](README.md) | [日本語](README.ja.md)

A live table-of-contents and navigation sidebar for ChatGPT conversations.

Prompt Outline Navigator is an independent project and is not affiliated with or endorsed by OpenAI.

[Privacy Policy](PRIVACY.md)

[![Get it on the Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Get%20it-blue?logo=googlechrome)](https://chromewebstore.google.com/detail/prompt-outline-navigator/nleamodjnjbpcemdbcemfpbaelkkmmpe)

## Features

- Opens a dedicated 200px sidecar without moving ChatGPT's React root and remembers its open/closed state.
- Widens conversation responses, the composer, and the project home new-chat area through ChatGPT's content-width variable.
- Keeps wide tables and preformatted content accessible with scoped overflow and wrapping rules.
- Updates only changed turns and headings with `MutationObserver`.
- Retains discovered TOC entries when ChatGPT temporarily removes older turns from the DOM, and reloads those turns when a retained entry is selected.
- Tracks the nearest preceding prompt or heading with `IntersectionObserver`, avoiding early jumps caused by ChatGPT's native prompt state.
- Keeps the active TOC entry visible inside the sidebar.
- Renders prompt and heading text with `textContent`, including text that looks like HTML.
- Supports nested heading collapse, prompt-group collapse, theme-adjusted hierarchy and active-prompt colors for light/dark modes, and SPA navigation.

## Development

```powershell
npm test
npm run check
```

The content scripts are split by responsibility: shared helpers, sidebar UI, conversation synchronization, navigation, active-position tracking, and the `content.js` bootstrap. Keep their order in `manifest.json` when adding or moving code.

Load this directory with **Chrome > Extensions > Developer mode > Load unpacked**.

For a local browser regression page, open `tests/browser-fixture.html`. It checks initial display, literal HTML-like labels, incremental add/update/remove behavior, group insertion, and close/reopen layout handling.

### Chrome Web Store package

Build a minimal review package containing only manifest-referenced runtime files and the license:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-store-package.ps1
```

The script runs JavaScript syntax checks and automated tests, verifies the ZIP contents, and prints its SHA-256 hash. The output is written to `dist/prompt-outline-navigator-<version>-chrome-web-store.zip`.

## Origin

Based on [ChatGPT Table of Contents](https://github.com/WindZZzzZZzz/gpt-toc-extension) by Leo Z. The initial source snapshot is Chrome Web Store version 1.2.1.

## License

Released under the [MIT License](LICENSE). The original project's copyright notice is retained.
