# Release 1.7.0 / Gemini対応のリリース準備

Prepared on **2026-10-24**. Status: **GitHub release published; Chrome Web Store submission not performed**.

Gemini対応を含む正式リリース用の版数は`1.7.0`です。機能コミットでは1.6.3を維持し、完成したbranchのローカルmain統合直前の版数準備で一度だけ1.7.0へ更新したものです。公開済み`v1.6.3`のChatGPT向け成果物は上書きしません。過去の版数・ハッシュ・公開経過は[1.6.3の過去記録](RELEASE_1.6.3.md)に保存しています。

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

## Formal release artifact / 正式リリース用成果物

| Item | Status |
| --- | --- |
| Source version | `1.7.0` |
| Submission ZIP | `dist/prompt-outline-navigator-1.7.0-chrome-web-store.zip` |
| Checksum | `dist/prompt-outline-navigator-1.7.0-chrome-web-store.zip.sha256` |
| Build / exact ZIP verification | `npm run build`: 94 unit tests and 53 browser tests passed; all 14 packaged files matched source hashes |
| ZIP bytes / SHA-256 | `52,702 bytes` / `D94EDB7310E433B7EDEADBEEACDC57F06148B9BB440CD1389B5B7196A1275FE9` |
| Publication status | [GitHub v1.7.0](https://github.com/ten9miq/prompt-outline-navigator/releases/tag/v1.7.0), published `2026-10-24T13:26:33Z`; not submitted to Chrome Web Store |

Build the formal package from the finalized versioned source:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:USERPROFILE 'AppData\Local\ms-playwright'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-store-package.ps1
```

The builder runs `npm run build`, verifies the exact manifest-derived ZIP file list and every file hash, and reports SHA-256. The package contains runtime scripts, CSS, manifest, declared icons and `LICENSE` only. Documentation, tests, dependencies, logs, generated conversations and private content are excluded. Use `-SkipTests` only immediately after successful checks of unchanged runtime.

`1.7.0` is the single version for this package, the local main merge, and any later authorized tag/GitHub release. The package is checked against the merged runtime without rebuilding it merely to change documentation or Git history.

### Previous local review / 以前の確認用ZIP

`dist/prompt-outline-navigator-1.6.3-chrome-web-store-review.zip` was a review-only build before the version increment: 52,701 bytes, SHA-256 `FBA9EBB745DAA5218E89E57ED22A0B062E49E1AB102D0BC61FDFDB916B29DDF6`. It must not be used as the Gemini store update. The historical submission ZIP `dist/prompt-outline-navigator-1.6.3-chrome-web-store.zip` and its checksum remain unchanged.

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

追加ホストへのアクセスをストア申告へ反映します。保存データとローカル処理の方針は変わりません。Chrome Web Storeの設定・掲載内容・公開状態は変更していません。

## Reviewer checks / レビュー確認項目

1. Load the unpacked checkout or extract the 1.7.0 submission ZIP, then reload ChatGPT and Gemini tabs. Confirm the added Gemini site access using the reviewer's own account.
2. In Gemini, check prompt pairing, headings, incremental updates and upper/middle/lower navigation. Compare the outline with rendered content, including attachment-only groups.
3. Check pinned/hover modes, resizing and reload persistence. Inspect response text, prompts, new-chat/existing inputs and response action rows at normal and narrow widths; inspect actual text/controls, not only document scrollWidth.
4. Check notebook/source-dialog and Canvas coexistence where available. Canvas/notebook content should not become a new outline source; narrow inline and fullscreen controls must remain reachable.
5. Recheck representative ChatGPT conversations, writing blocks and virtualized-history destinations. Gemini's detached-history limitation must remain explicit.
6. Use anonymous fixtures via `npm test` for deterministic transitions. Do not include account credentials, private conversation URLs, feedback submissions or private screenshots in review material.

## Local source and remaining publication steps / ローカル統合と残りの公開手順

The feature commit keeps version 1.6.3. A single version-preparation commit selects 1.7.0 immediately before the local main merge; commit identities are recorded in Git history. Local commits, versioning, main integration and formal package creation are authorized by this preparation request.

mainとannotated tag `v1.7.0`をpushし、GitHub releaseを公開しました。tagはリリースmerge `d1d32f124c20d0d415b2e8d7bbb543af07801348`を指します。正式ZIPとチェックサムの2件をGitHubからdownloadし、ローカルとのhash一致を確認しました。Chromeウェブストア提出は行っていません。

1. GitHub publication is complete: tag `v1.7.0` identifies the verified release merge and the ZIP/checksum are attached. A subsequent documentation-only commit records this state; it does not move the release tag or change the package.
2. Publish the updated privacy source and prepare the Gemini listing/site-access disclosures. Preserve unrelated distribution, regions and pricing.
3. Before an authorized Chrome Web Store submission, inspect current public/draft versions and pending reviews; do not infer current dashboard state from the historical 1.6.3 record.
4. Upload this finalized versioned ZIP only in the authorized store workflow and record submission, review and publication separately.
5. Do not describe the local ZIP, a GitHub release, or a store submission as an approved/published store update until the actual result confirms it.

## Previous release record / 過去版の記録

[Version 1.6.3](RELEASE_1.6.3.md) records the published ChatGPT history-navigation patch, its original ZIP/hash and earlier releases. The last store state recorded there was pending review on 2026-10-23; this preparation did not recheck or change the live dashboard.
