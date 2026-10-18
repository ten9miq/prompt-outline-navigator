# Release preparation / リリース準備

Release target: **1.6.1**, prepared on **2026-10-18**. This patch release includes document outline label, composer width and hover activation fixes. Source metadata, submission ZIP, tag and GitHub release use the same version. GitHub release: https://github.com/ten9miq/prompt-outline-navigator/releases/tag/v1.6.1.

## Release contents / 更新内容

- For documents without a subject or level-one heading, use the first nonempty content line, preserving explicit line breaks and limiting the fallback label to 80 characters.
- Display outline entries in at most two lines, with the label available on hover.
- Detect Chat and Work composers through shared attributes, adjusting nested width caps within their pane independently of route or placement names. Follow attribute changes and multiple composers while preserving pane/dialog boundaries and unrelated fields.
- Expand the hover activation area from 6px to 20px and keep it behind the open sidebar so it does not intercept the pin button.
- Require dedicated Chrome for live-page investigation and verification.

文書の冒頭ラベルを短縮し、目次項目を最大2行に制限しました。Workの初回入力欄にも幅補正を適用し、共通属性で入力欄と親要素の幅制限を補正します。ホバー反応範囲を右端20pxへ拡大し、表示後のピン操作を妨げない重なり順にしました。

## Validation and artifacts / 検証と成果物

`npm run build` passed for 1.6.1: JavaScript syntax checks, **84 unit tests** and **22 Playwright browser tests**. The unchanged runtime was packaged immediately afterward with `-SkipTests`; the package builder verified all 14 manifest-derived files against the source hashes. Manifest, package and lockfile versions match.

Dedicated Chrome checks confirmed the specified document's label shortened from 201 to 32 characters and displayed in two lines, and that its TOC entry still navigates. Work's initial composer expanded from about 768px to 995px and stayed wide across Chat/Work switching without horizontal page overflow. Hover activation at 16px from the right edge, dismissal, navigation and pinning were verified with the browser fixture. Workspace Agent settings screens were unavailable and have not been verified; only composers exposing the same shared attributes are covered.

| Artifact | Status |
| --- | --- |
| Source version | `1.6.1` |
| Submission ZIP | `dist/prompt-outline-navigator-1.6.1-chrome-web-store.zip` |
| ZIP size | `46,425 bytes` |
| SHA-256 | `A4283B195C4367B07195E7F9AFCB2C1C34D7E3DDFD36DC774366C55C41898424` |
| Checksum file | `dist/prompt-outline-navigator-1.6.1-chrome-web-store.zip.sha256` |
| Tag / GitHub release | `v1.6.1` / `https://github.com/ten9miq/prompt-outline-navigator/releases/tag/v1.6.1` |

The package includes only manifest-referenced runtime files, icons and `LICENSE`. Private content, logs, dependencies, tests and documentation are excluded. Do not submit an older package for this update.

この版のZIPのファイル一覧と内容ハッシュを検証しました。実画面の確認とfixtureテストを区別し、この環境にないWorkspace Agent設定画面は検証済みとしていません。

Build the package when a new submission artifact is needed:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:USERPROFILE 'AppData\Local\ms-playwright'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-store-package.ps1
```

Use `-Review` for a review-only package. `-SkipTests` is allowed only immediately after successful checks of unchanged runtime; it still verifies the exact ZIP contents and hashes.

Existing sample screenshots were generated for 1.5.0 from fictional repository-owned content. Regenerate them with `node scripts/capture-store-screenshots.js` before using them in an updated listing. See [asset inventory](../store-assets/README.md).

## Store listing and privacy / 掲載原稿とプライバシー

| Field | Value |
| --- | --- |
| Existing store item | `nleamodjnjbpcemdbcemfpbaelkkmmpe`; do not create a duplicate |
| Name | `Prompt Outline Navigator` |
| Short description | Keep manifest description: `A live table-of-contents and navigation sidebar for ChatGPT conversations` |
| Detailed description | [Japanese](../store-assets/listing.ja.txt), [English alternative](../store-assets/listing.en.txt) |
| Homepage | `https://github.com/ten9miq/prompt-outline-navigator` |
| Support | `https://github.com/ten9miq/prompt-outline-navigator/issues` |
| Privacy policy | `https://github.com/ten9miq/prompt-outline-navigator/blob/main/PRIVACY.ja.md` |
| Policy effective date | `2026-10-15` in both language versions |

Single purpose: provide a local outline and in-page navigation for supported ChatGPT conversations, documents and message feeds.

| Dashboard field | Copy-ready rationale |
| --- | --- |
| `storage` | Stores only the sidebar open/closed preference and width in `chrome.storage.local`. Content, temporary vertical position and hover visibility are not stored. |
| Site access | Content scripts run only on `https://chatgpt.com/*` and `https://chat.openai.com/*` to read rendered supported content and provide outline navigation. |
| Remote code | No remote code, dynamic code evaluation, analytics SDKs or new permissions. All runtime JavaScript and CSS are bundled. |
| Data usage | Retain `Personal communications` and `Website content` disclosures for locally processed content. No developer collection, transmission, sale or third-party sharing. |
| Certifications | No sale, unrelated-purpose transfer, or creditworthiness/lending use of data. |

既存の日本語掲載を更新する原稿です。データはブラウザー内だけで処理しますが、既存のPersonal communications／Website contentの申告を外す理由にはしません。追加権限はなく、保存値は開閉状態と横幅だけです。配布範囲や言語の追加は、ダッシュボードの現在の設定を確認してから行います。

## Reviewer steps / 審査手順

1. Install the update and reload a supported ChatGPT page. Use a non-sensitive conversation with headings; attachment-only input is also supported.
2. Select upper/lower outline entries and check scrolling/highlighting. Active Space documents and dot feeds depend on account feature availability.
3. Resize by dragging the left boundary; reload to confirm the saved width. Double-click the boundary to reset width to 200px. Drag the title down and double-click it to reset vertical position to 0px while preserving width.
4. Unpin using the header pin button, hover at the rightmost 20px to select an entry in the temporary preview, and move out to hide it again. Hovering does not resize the page. The crossed-out pin button restores the pinned sidebar. Boundary/title double-click resets preserve hover mode; no floating TOC button is shown.
5. Navigate to the start page or settings and open/dismiss a search dialog. The saved manual sidebar state and reservation remain stable. A page without supported content keeps the sidebar with an empty-state message.

拡張固有のログイン・課金はありません。審査者自身のChatGPTアカウントと機密情報のない会話で確認できます。ログイン情報や私的な会話URLは審査資料へ記載しません。

## Publication status and final steps / 公開範囲と最終工程

The owner requested pushing the commits and publishing a GitHub release with the verified ZIP and SHA-256 checksum. Chrome Web Store upload and submission remain separate; no store submission or approval is asserted here.

1. Keep the final version `1.6.1` unchanged through merge, tag, package and release. Do not increment it again during this release.
2. Publish the updated listing/privacy documents with the release sources.
3. For a store submission, check the currently uploaded dashboard version, existing listing, distribution/publication settings and privacy declarations, then upload this ZIP and submit only within the owner's requested scope.
4. Record the store's actual submission/approval result separately. No store approval is asserted in this preparation record.

今回のZIP作成やGitHub側の公開だけでは、Chrome Web Storeへの審査提出・承認・ストア公開を意味しません。ストア側の操作と結果は別途確認します。

## Previous releases / 過去版

Version 1.6.0 has a GitHub release dated 2026-10-15. Its verified ZIP was 45,920 bytes with SHA-256 `FFF623509F07ACA7A9C4A2207B3BEDAEB008E255C5E996CFF86473122C02DBE9`; 84 unit tests and 19 browser tests passed. These values describe 1.6.0, not the current package.

Version 1.4.0 was tagged on merge commit `84f15df` and has a GitHub release dated 2026-10-11. The owner previously reported submitting it for store review; approval has not been verified here. The 1.5.0 package was 44,568 bytes with SHA-256 `E06CCF55F9F3DC64C48A2A8F4A554590170910DF135FBB99D5C40E89C597E93E`. These are historical artifact values.
