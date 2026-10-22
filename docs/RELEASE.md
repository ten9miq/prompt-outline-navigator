# Release preparation / リリース準備

Release target: **1.6.3**, prepared on **2026-10-23**. This patch fixes cached TOC navigation after earlier history changes the coordinates in long conversations. Manifest, package, lockfile, store ZIP, merge, tag and GitHub release use the same version.

## Release contents / 更新内容

- When a cached destination does not remount at its remembered coordinate, narrow the search using currently rendered turn order.
- Support both heading and prompt navigation, normal and reverse scrollers, and cancellation by a new click, user scrolling or conversation change.
- Add regression fixtures for prepended history, late tail remounts and position stability after a wheel scroll; add unit checks for search direction and request isolation.
- Preserve existing permissions, local-only processing and sidebar settings.

長い会話で上の履歴を読み込むと保持済み項目の座標がずれ、最下部の目次をクリックしても本文へ到達できない問題を修正しました。古い座標で対象が再表示されない場合は、描画中のターンの順序から探索範囲を絞り込みます。

## Validation and artifacts / 検証と成果物

The package builder ran `npm run build` for 1.6.3: syntax checks, **92 unit tests** and **43 Playwright browser tests** passed. All 14 manifest-derived ZIP files and hashes were verified against the release source. The two new browser regression cases failed against the pre-fix navigation implementation and passed after the fix. Existing sample screenshots are unchanged.

Dedicated Chrome checks on 2026-10-22 reproduced the issue in an existing long project conversation: loading earlier history increased the scroll height from about 15,400px to 34,300px, but the old code repeatedly selected a stale coordinate without rendering the destination. After the fix, the last heading remounted within about 1.5 seconds and stayed at the resulting position; a subsequent PageUp changed the position and showed no delayed return. The fixture tests separately verify prompt/heading alignment and wheel scrolling. Private conversation content and URLs are excluded from release artifacts. See [the earlier reliability audit](TOC_RELIABILITY.md) for the broader lifecycle checks.

| Artifact | Status |
| --- | --- |
| Source version | `1.6.3` |
| Submission ZIP | `dist/prompt-outline-navigator-1.6.3-chrome-web-store.zip` |
| ZIP size | `50,455 bytes` |
| SHA-256 | `7F965F4732BF12DA08257939D210214D8057BA331B12013384C0690ECF01961E` |
| Checksum file | `dist/prompt-outline-navigator-1.6.3-chrome-web-store.zip.sha256` |
| Tag / GitHub release | `v1.6.3` / `https://github.com/ten9miq/prompt-outline-navigator/releases/tag/v1.6.3` |

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

The 1.6.3 release workflow commits the navigation fix, increments the version once immediately before merging into `main`, tags the merge as `v1.6.3`, and publishes a GitHub release containing the verified ZIP and checksum. Chrome Web Store upload, review submission and store publication are separate steps and are not performed as part of this GitHub release.

1.6.3は修正のコミット、版数の更新、mainへのマージ、タグと検証済みZIP・チェックサムを含むGitHubリリースを対象とします。Chrome Web Storeへのアップロード・審査提出・ストア公開は今回のGitHubリリースとは別工程です。

1. Merge the completed branch using version `1.6.3`, then tag the merge as `v1.6.3`.
2. Push release sources/tag and publish the GitHub release with the verified ZIP and checksum.
3. For a separately requested store submission, first check the current published/draft versions and any pending review. Preserve existing privacy, distribution, regions and pricing.
4. Upload the verified ZIP and submit for review only as part of that store workflow. Record the actual submission result separately.
5. Do not describe the store update as published until the dashboard/public listing confirms it.

この準備記録そのものは、Chrome Web Storeの審査承認・ストア公開を意味しません。GitHubの公開結果とストアの審査・公開結果を分けて報告します。

## Previous releases / 過去版

Version 1.6.2 was merged as `b189231` and tagged/released on 2026-10-22 (JST). Its ZIP was 49,928 bytes with SHA-256 `22AA4AF858708343B0CD19AAC5174560422142FDB4F7344180CE3C60172743C8`; 90 unit tests and 41 browser tests passed. It improved outline discovery, partial writing revisions, message identity and virtualized-history handling. The existing store item received the update, Japanese listing, sample screenshots and reviewer instructions. On 2026-10-22 the dashboard confirmed pending review with automatic publication after approval; approval/public availability has not been rechecked for the 1.6.3 GitHub release.

Version 1.6.1 was prepared on 2026-10-18 and is published in Chrome Web Store (confirmed on 2026-10-22). Its original verified ZIP was 46,425 bytes with SHA-256 `A4283B195C4367B07195E7F9AFCB2C1C34D7E3DDFD36DC774366C55C41898424`; 84 unit tests and 22 browser tests passed.

Version 1.6.0 has a GitHub release dated 2026-10-15. Its ZIP was 45,920 bytes with SHA-256 `FFF623509F07ACA7A9C4A2207B3BEDAEB008E255C5E996CFF86473122C02DBE9`; 84 unit tests and 19 browser tests passed.

Version 1.5.0 used a 44,568-byte ZIP with SHA-256 `E06CCF55F9F3DC64C48A2A8F4A554590170910DF135FBB99D5C40E89C597E93E`. Version 1.4.0 was tagged on merge commit `84f15df` and released on 2026-10-11.
