# Release preparation / リリース準備

Release target: **1.6.2**, prepared on **2026-10-22**. This patch stabilizes outline discovery and document/conversation lifecycle handling. Manifest, package, lockfile, store ZIP, merge, tag and GitHub release use the same version.

## Release contents / 更新内容

- Discover conversation-ID roots, attachment-only prompts, staged response bodies, raw Markdown writing blocks and rich editors.
- Keep headings under their original prompt through partial writing revisions, collapsed documents, delayed expansion and remounts.
- Resolve nested message identities, deduplicate responses, correct delayed prompt labels and retain resolved labels for the same prompt ID.
- Preserve virtualized history and conversation order across same-conversation root replacement; remove hidden alternatives and answers replaced in the same live response slot.
- Reconcile affected responses without rebuilding unrelated outlines for ordinary text tokens. Cancel pending navigation on a new click or conversation change.
- Preserve existing permissions, local-only processing and sidebar settings.

目次生成を個別の見出し検出だけでなく、本文の状態判定・対応付け・履歴保持・更新・移動まで見直しました。部分修正で折りたたまれた元文書の見出しを保持し、展開・再描画後に移動します。通常会話、文章エディタ、独立文書、フィードを回帰検証しています。

## Validation and artifacts / 検証と成果物

`npm run build` passed for 1.6.2: syntax checks, **90 unit tests** and **41 Playwright browser tests**. The unchanged runtime was packaged immediately afterward with `-SkipTests`; all 14 manifest-derived files and hashes were verified. Light/dark sample screenshots were regenerated from fictional repository-owned content and inspected.

Dedicated Chrome checks confirmed outline generation in an ordinary conversation and a project conversation containing partial writing revisions. The original document retained 11 headings and its revision retained 17; selecting an old heading expanded its document, reached the target within about 0.31px, and showed no scroll drift in the subsequent observation. Special transitions such as virtualization, delayed attributes and regenerated answers were tested with anonymized fixtures, not new live posts. See [the reliability audit](TOC_RELIABILITY.md).

| Artifact | Status |
| --- | --- |
| Source version | `1.6.2` |
| Submission ZIP | `dist/prompt-outline-navigator-1.6.2-chrome-web-store.zip` |
| ZIP size | `49,928 bytes` |
| SHA-256 | `22AA4AF858708343B0CD19AAC5174560422142FDB4F7344180CE3C60172743C8` |
| Checksum file | `dist/prompt-outline-navigator-1.6.2-chrome-web-store.zip.sha256` |
| Tag / GitHub release | `v1.6.2` / `https://github.com/ten9miq/prompt-outline-navigator/releases/tag/v1.6.2` |

The package contains only manifest-referenced runtime files, icons and `LICENSE`. Logs, private content, dependencies, tests and documentation are excluded. Upload this exact ZIP for the release.

この版のZIPのファイル一覧と内容ハッシュを検証しました。テスト用の非同期更新・再生成・仮想化の状態遷移と、既存会話での実画面検証を区別しています。

Build another submission artifact only when required:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:USERPROFILE 'AppData\Local\ms-playwright'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-store-package.ps1
```

Use `-Review` for a review-only ZIP. `-SkipTests` is allowed only immediately after successful checks of unchanged runtime; exact file-list and hash checks still run. Sample screenshots are generated with `node scripts/capture-store-screenshots.js`.

## Store listing and privacy / 掲載原稿とプライバシー

| Field | Value |
| --- | --- |
| Existing store item | `nleamodjnjbpcemdbcemfpbaelkkmmpe`; do not create a duplicate |
| Name | `Prompt Outline Navigator` |
| Short description | `A live table-of-contents and navigation sidebar for ChatGPT conversations` |
| Detailed description | [Japanese](../store-assets/listing.ja.txt), [English alternative](../store-assets/listing.en.txt) |
| Homepage | `https://github.com/ten9miq/prompt-outline-navigator` |
| Support | `https://github.com/ten9miq/prompt-outline-navigator/issues` |
| Privacy policy | `https://github.com/ten9miq/prompt-outline-navigator/blob/main/PRIVACY.ja.md` |
| Policy effective date | `2026-10-15`; unchanged in both languages |
| Existing distribution | Public listing in Japanese; preserve the dashboard's existing regions and pricing |

Single purpose: provide a local outline and in-page navigation for supported ChatGPT conversations, documents and message feeds.

| Dashboard field | Rationale |
| --- | --- |
| `storage` | Saves only sidebar open/closed preference and width in `chrome.storage.local`. Content, temporary vertical position and hover visibility are not stored. |
| Site access | Content scripts run only on `https://chatgpt.com/*` and `https://chat.openai.com/*` to read rendered content and provide navigation. |
| Remote code | No remote code, dynamic code evaluation, analytics SDKs or new permissions in the extension. |
| Data usage | Retain `Personal communications` and `Website content` disclosures for locally processed content. No developer collection, transmission, sale or third-party sharing. |
| Certifications | No sale, unrelated-purpose transfer, or creditworthiness/lending use of data. |

既存の日本語掲載を更新します。権限やデータの扱いは変わらないため、既存の申告を維持します。ストアのアクセス集計設定と、拡張本体からの通信・解析の有無は区別します。

## Reviewer steps / 審査手順

1. Install the update and reload a supported ChatGPT page. Use an existing non-sensitive conversation with headings; attachment-only input is supported.
2. Select upper/lower outline entries and check scrolling. Active Space documents and dot feeds depend on account feature availability.
3. In a writing conversation with an earlier collapsed document, select one of its outline headings. The original document should expand and navigation should wait for the content to be ready.
4. Resize the sidebar, reload to confirm saved width, and check pin/hover modes. Boundary/title resets preserve display mode.
5. Navigate between conversations, a start page and settings. Manual visibility and reserved width remain stable. Unsupported content shows the empty state.
6. For deterministic lifecycle verification, run `npm test`; private conversation URLs and login credentials are not required.

拡張固有のログイン・課金はありません。審査者自身のChatGPTアカウントと機密情報のない会話で確認できます。ログイン情報や私的な会話URLは審査資料に含めません。

## Publication status and final steps / 公開範囲と最終工程

On 2026-10-22 (JST), the completed branch was merged into `main` as `b189231` and tagged `v1.6.2`. The GitHub release is published with the verified ZIP and checksum. Version 1.6.2 was uploaded to the existing Chrome Web Store item, the Japanese listing and sample screenshots were updated, and review instructions were saved. Existing privacy declarations, free/public distribution and regions were preserved. Submission completed with automatic publication after approval selected; the dashboard confirmed **審査待ち (pending review)**. Store approval and public availability of 1.6.2 are not yet confirmed.

2026年10月22日（日本時間）にGitHub公開とChrome Web Storeへの審査提出まで完了しました。ストアは承認後に自動公開する設定です。審査提出と公開完了は区別し、1.6.2のストア公開済みとは扱っていません。

The owner requested the complete publication workflow: commit and merge, one version increment, verified ZIP/checksum, GitHub release, and update upload/review submission to the existing Chrome Web Store item. Store approval and public availability must be confirmed separately from upload or GitHub publication.

1. Merge the completed branch using version `1.6.2`, then tag the merge as `v1.6.2`.
2. Push release sources/tag and publish the GitHub release with the verified ZIP and checksum.
3. The dashboard's published and draft versions were both confirmed as `1.6.1` before this update. Upload 1.6.2, update the Japanese listing/screenshots, and retain the existing privacy and distribution settings.
4. Submit for review with publication after approval, preserving the public listing. Record the actual submission result separately.
5. Do not describe the store update as published until the dashboard/public listing confirms it.

この準備記録そのものは、Chrome Web Storeの審査承認・ストア公開を意味しません。GitHubの公開結果とストアの審査・公開結果を分けて報告します。

## Previous releases / 過去版

Version 1.6.1 was prepared on 2026-10-18 and is published in Chrome Web Store (confirmed on 2026-10-22). Its original verified ZIP was 46,425 bytes with SHA-256 `A4283B195C4367B07195E7F9AFCB2C1C34D7E3DDFD36DC774366C55C41898424`; 84 unit tests and 22 browser tests passed.

Version 1.6.0 has a GitHub release dated 2026-10-15. Its ZIP was 45,920 bytes with SHA-256 `FFF623509F07ACA7A9C4A2207B3BEDAEB008E255C5E996CFF86473122C02DBE9`; 84 unit tests and 19 browser tests passed.

Version 1.5.0 used a 44,568-byte ZIP with SHA-256 `E06CCF55F9F3DC64C48A2A8F4A554590170910DF135FBB99D5C40E89C597E93E`. Version 1.4.0 was tagged on merge commit `84f15df` and released on 2026-10-11.
