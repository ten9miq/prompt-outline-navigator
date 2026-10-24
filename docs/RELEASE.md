# Gemini release preparation / Gemini対応のリリース準備

Prepared on **2026-10-24**. Status: **unreleased, local review only**.

現在のGemini対応は未公開です。ソースの版数は意図的に`1.6.3`を維持しています。公開済み`v1.6.3`のChatGPT向けZIPとは内容が異なり、同じ版数で新しい更新を提出してはいけません。過去の版数・ハッシュ・公開経過は[1.6.3の過去記録](RELEASE_1.6.3.md)に保存しています。

## Release contents / 更新内容

- Add `https://gemini.google.com/*` to content-script matches; keep the existing ChatGPT sites and `storage` permission.
- Build prompt/response-heading outlines from rendered Gemini history, follow streaming/remounts and SPA changes, and preserve light/dark behavior.
- Widen regular Gemini responses, sent-prompt bubbles, new/existing inputs and response action rows. Keep 32px response-wrapper gutters, reduced to 16px at viewport widths of 700px or less, while respecting native inner block spacing.
- Correct query margins, absolute desktop new-chat inputs, mobile input component margins, and the independent response-footer/action caps and centering.
- Keep Canvas/notebook content outside outline generation and width targeting. Preserve their UI coexistence, temporarily hide the TOC under mobile fullscreen Canvas, and wrap narrow inline code Canvas headers.
- Preserve ChatGPT outline, writing-block and discovered-history recovery behavior.

対応範囲と公開前に理解すべき制約は[Gemini対応と検証](GEMINI_SUPPORT.md)を参照してください。英日README、プライバシーポリシー、掲載原稿は同じ対応サイトと処理方針を記載します。

## Known limits / 既知の制約

Gemini outlines cover rendered turns only. Detached Gemini history is not retained or recovered; DOM-removal virtualization was not reproduced in the 20-turn live check. Do not claim ChatGPT-equivalent history recovery or unlimited-conversation verification.

Canvasとノートブックの内容自体は目次対象外です。実確認はノートブック1件・スライド型Canvas1件・単一HTMLのコードCanvas1件であり、全種類・全アカウント機能の保証ではありません。別注入機能のショートカット競合は対象拡張の幅補正解除後も再現し、相手側の設定やファイルは変更していません。

## Local review artifact / ローカル確認用成果物

| Item | Review state |
| --- | --- |
| Source version | `1.6.3`, unchanged during development |
| Review ZIP | `dist/prompt-outline-navigator-1.6.3-chrome-web-store-review.zip` |
| Checksum | `dist/prompt-outline-navigator-1.6.3-chrome-web-store-review.zip.sha256` |
| Build / exact ZIP verification | `npm run build`: 94 unit tests and 53 browser tests passed; all 14 packaged files matched source hashes |
| ZIP bytes / SHA-256 | `52,701 bytes` / `FBA9EBB745DAA5218E89E57ED22A0B062E49E1AB102D0BC61FDFDB916B29DDF6` |
| Submission status | Not submitted; this review ZIP must not be uploaded as an update |

Build the review package without overwriting the published-version submission ZIP:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:USERPROFILE 'AppData\Local\ms-playwright'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-store-package.ps1 -Review
```

The builder runs `npm run build`, verifies the exact manifest-derived ZIP file list and every file hash, and reports SHA-256. The package contains runtime scripts, CSS, manifest, declared icons and `LICENSE` only. Documentation, tests, dependencies, logs, generated conversations and private content are excluded. Use `-SkipTests` only immediately after successful checks of unchanged runtime.

この確認用ZIPは版数を上げずにコードレビュー・展開検証するためのものです。現在の本番用`dist/prompt-outline-navigator-1.6.3-chrome-web-store.zip`とそのチェックサムは、過去の公開成果物として上書きしません。

## Store listing and privacy / 掲載原稿とプライバシー

| Field | Prepared value / action |
| --- | --- |
| Existing store item | `nleamodjnjbpcemdbcemfpbaelkkmmpe`; use the existing item |
| Name | `Prompt Outline Navigator` |
| Short description | `A live table-of-contents and navigation sidebar for ChatGPT and Gemini conversations` |
| Detailed listing | [Japanese](../store-assets/listing.ja.txt), [English](../store-assets/listing.en.txt) |
| Homepage | `https://github.com/ten9miq/prompt-outline-navigator` |
| Support | `https://github.com/ten9miq/prompt-outline-navigator/issues` |
| Privacy source | [English](../PRIVACY.md), [Japanese](../PRIVACY.ja.md), dated `2026-10-24` |
| Public privacy URL | `https://github.com/ten9miq/prompt-outline-navigator/blob/main/PRIVACY.ja.md`; publish the updated source with the release before store submission |
| Store images | Existing fictional ChatGPT examples remain usable; see [asset notes](../store-assets/README.md) |

Single purpose: provide a local outline and in-page navigation for ChatGPT and Gemini conversations, plus supported ChatGPT documents and feeds.

| Disclosure | Preparation |
| --- | --- |
| `storage` | Store only sidebar mode and width in `chrome.storage.local` |
| Site access | Add `https://gemini.google.com/*`; preserve `https://chatgpt.com/*` and `https://chat.openai.com/*` |
| Data use | Local page processing only; retain communications/content disclosure, with no developer collection, transmission, sale or sharing |
| Remote code | No remote code, analytics or new permission categories |
| Distribution | Inspect and preserve current regions, pricing and publication settings when submission is separately authorized |

追加ホストへのアクセスをストア申告へ反映します。保存データとローカル処理の方針は変わりません。現時点でストア設定・掲載内容・公開状態は変更していません。

## Reviewer checks / レビュー確認項目

1. Load the unpacked checkout or extract the review ZIP, then reload ChatGPT and Gemini tabs. Confirm the added Gemini site access using the reviewer's own account.
2. In Gemini, check prompt pairing, headings, incremental updates and upper/middle/lower navigation. Compare the outline with rendered content, including attachment-only groups.
3. Check pinned/hover modes, resizing and reload persistence. Inspect response text, prompts, new-chat/existing inputs and response action rows at normal and narrow widths; inspect actual text/controls, not only document scrollWidth.
4. Check notebook/source-dialog and Canvas coexistence where available. Canvas/notebook content should not become a new outline source; narrow inline and fullscreen controls must remain reachable.
5. Recheck representative ChatGPT conversations, writing blocks and virtualized-history destinations. Gemini's detached-history limitation must remain explicit.
6. Use anonymous fixtures via `npm test` for deterministic transitions. Do not include account credentials, private conversation URLs, feedback submissions or private screenshots in review material.

## Final release steps / 今後の公開手順

These steps are not performed by this preparation task.

1. Review the completed changes, including `tests/gemini.spec.js`, and record them in the approved release source/branch. Existing unrelated logs and old checksums are not release content.
2. Immediately before merging the completed branch into `main`, choose and increment the next version **once** across manifest, package, lockfile and version assertions. Do not reuse `1.6.3` for the Gemini update.
3. Build a fresh submission ZIP without `-Review` from those finalized sources, verify its file list and hashes, and use the same version for the merge, package, tag and GitHub release.
4. Commit/merge/push/tag and publish a GitHub release only when separately requested. Attach the finalized ZIP and checksum; the local review ZIP is not that release artifact.
5. For an authorized Chrome Web Store submission, first inspect current public/draft versions and pending reviews, publish the updated privacy source, update Gemini listing/site-access disclosures, and preserve unrelated distribution settings.
6. Upload the finalized versioned ZIP and record submission/review/publication separately. Do not describe a submission as an approved or published store release.

版数変更、commit、merge、push、tag、GitHub公開、Chromeウェブストアへの提出は今回行っていません。最終公開前には、その時点のコードとストア状態を確認します。

## Previous release record / 過去版の記録

[Version 1.6.3](RELEASE_1.6.3.md) records the published ChatGPT history-navigation patch, its original ZIP/hash and earlier releases. The last store state recorded there was pending review on 2026-10-23; this preparation did not recheck or change the live dashboard.
