# Privacy Policy for Prompt Outline Navigator

[English](PRIVACY.md) | [日本語](PRIVACY.ja.md)

Effective date: September 6, 2026

Prompt Outline Navigator is a browser extension that creates a table of contents for conversations displayed on ChatGPT. This policy explains how the extension handles data.

## Data processed

To provide its table-of-contents and navigation features, the extension reads the following content from supported ChatGPT pages:

- User prompt text
- Assistant response text and headings
- The current prompt position exposed by ChatGPT's page interface

This content is processed locally in the browser only. It is not collected by the developer, transmitted to an external server, sold, or shared with third parties.

## Data stored

The extension stores only a boolean preference indicating whether its sidebar is open or closed. This preference is stored locally using `chrome.storage.local`.

Conversation content is not written to extension storage. It remains in page memory only while the supported ChatGPT page is open and is discarded when the page is closed or reloaded.

The sidebar preference remains until the user removes the extension, clears the extension's stored data, or changes the preference through the extension.

## Permissions

The extension uses:

- `storage`: to remember the sidebar's open or closed state.
- Access to `https://chatgpt.com/*` and `https://chat.openai.com/*`: to detect prompts and headings and display navigation on supported ChatGPT pages.

## Remote code and external services

The extension does not download or execute remote code and does not send data to the developer or any analytics, advertising, or other third-party service.

The extension operates on ChatGPT pages, which are provided by OpenAI and are governed by OpenAI's own terms and privacy policy. Prompt Outline Navigator is an independent project and is not affiliated with or endorsed by OpenAI.

## Changes to this policy

If the extension's data handling changes, this policy and the Chrome Web Store privacy disclosures will be updated before the changed version is published.

## Contact

Questions about this policy can be submitted through the project's [GitHub Issues](https://github.com/ten9miq/chatgpt-toc-navigator/issues).
