# TOC Navigator for ChatGPT

[English](README.md) | [日本語](README.ja.md)

A live table-of-contents and navigation sidebar for ChatGPT conversations.

## Features

- Opens a dedicated 200px sidecar without moving ChatGPT's React root and remembers its open/closed state.
- Widens conversation responses and the composer through ChatGPT's content-width variable.
- Updates only changed turns and headings with `MutationObserver`.
- Tracks the current prompt and heading with `IntersectionObserver`.
- Keeps the active TOC entry visible inside the sidebar.
- Renders prompt and heading text with `textContent`, including text that looks like HTML.
- Supports nested heading collapse, prompt-group collapse, light/dark themes, and SPA navigation.

## Development

```powershell
npm test
npm run check
```

Load this directory with **Chrome > Extensions > Developer mode > Load unpacked**.

For a local browser regression page, open `tests/browser-fixture.html`. It checks initial display, literal HTML-like labels, incremental add/update/remove behavior, group insertion, and close/reopen layout handling.

## Origin

Based on [ChatGPT Table of Contents](https://github.com/WindZZzzZZzz/gpt-toc-extension) by Leo Z. The initial source snapshot is Chrome Web Store version 1.2.1.
