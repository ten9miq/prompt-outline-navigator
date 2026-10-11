# Chrome Web Store release preparation

Prepared: 2026-10-11. The owner subsequently reported submitting version `1.4.0` for Chrome Web Store review and authorized the Git commit, push and release tag. Store approval has not been verified. This record does not describe a GitHub Release object.

## Current state / 現在の状態

The release was prepared on `codex/follow-toc-tail` for integration into `main` and an annotated `v1.4.0` tag on the release merge commit, following the previous release convention. At the owner's explicit request, manifest, package, root lockfile metadata and version assertions use the final requested version `1.4.0`. The intermediate `1.3.33` submission artifacts were removed to avoid accidental upload. The [public listing](https://chromewebstore.google.com/detail/prompt-outline-navigator/nleamodjnjbpcemdbcemfpbaelkkmmpe) still showed `1.3.32` when rechecked before submission on 2026-10-11. The dashboard's drafts/review queue have not been inspected.

所有者の最終指定に従い、マージ前に`1.4.0`へ更新しました。途中で生成した`1.3.33`の提出用ZIPとチェックサムは誤提出防止のため削除しました。同じ公開に向けて重ねて版数を上げず、同じ版数でマージ・ストアZIP・tagを揃えます。旧`1.3.32`のreview ZIPを更新提出に使わないでください。所有者からストア審査へ提出済みとの報告を受け、Gitのcommit・push・release tagも許可されました。承認・公開完了は未確認で、GitHub Release objectの作成は今回の範囲に含めません。

## Review artifacts / 確認用成果物

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-store-package.ps1 -Review
```

This runs `npm run build` (syntax checks, unit tests and Playwright browser tests) and creates `dist/prompt-outline-navigator-<version>-chrome-web-store-review.zip`. Omit `-Review` to build the submission package, currently `dist/prompt-outline-navigator-1.4.0-chrome-web-store.zip`. `-SkipTests` is for packaging an unchanged runtime immediately after successful checks; it still validates the manifest-derived file list and compares every ZIP file's SHA-256 with its source. The ZIP contains only runtime files, icons, and `LICENSE`; no private conversation data, logs, dependencies, tests, or store material.

確認用ZIPは現時点のruntimeを収録します。実装の検証が済んだ直後だけ`-SkipTests`で重複テストを省略できますが、ZIPの完全なファイル一覧と各内容のSHA-256照合は省略されません。

Rebuild the two screenshots from fictional content with the current runtime:

```powershell
node scripts/capture-store-screenshots.js
```

Playwright Chromium must already be installed. All requests are fulfilled from repository files in an isolated browser; no live ChatGPT page or user profile is used. These are representative sample screenshots, not captures of a private account. They show the actual extension runtime on a simulated conversation layout. See [asset inventory](../store-assets/README.md).

スクリーンショットは架空の会話を使ったサンプル画面です。個人の会話、Space文書、dotメッセージは撮影していません。拡張機能の実runtimeを使っていますが、ChatGPTの実画面キャプチャとは区別します。

### Submission package verification / 提出用ZIPの検証

The normal package builder completed for `1.4.0` on 2026-10-11: syntax checks, 83 unit tests and 11 Playwright browser tests passed. `dist/prompt-outline-navigator-1.4.0-chrome-web-store.zip` has 14 files and 42,454 bytes. Its manifest is at the ZIP root, and every packaged file matches its source by SHA-256. Manifest/package/lockfile metadata and the version assertion are all `1.4.0`.

ZIP SHA-256: `621D3A4C5BC299352CCEEAC04778C718E1FB8E887D0B8D4F5ADF3FA5C7A22535`

提出用ZIPは検証済みです。その後、所有者からストア審査へ提出済みとの報告を受けました。ダッシュボードの状態を自動確認したものではありません。

### Earlier review snapshot (`1.3.32`) / 旧確認用ZIPの検証記録

`scripts/build-store-package.ps1 -Review` completed successfully on 2026-10-11: syntax checks, 83 unit tests and 11 Playwright browser tests passed. The review ZIP has 14 files and 42,454 bytes; its exact file list and every entry's content hash match the manifest-derived working sources. Screenshots rendered 2 prompt groups and 8 headings in each theme with zero page/console errors; required image dimensions passed existing tests. Both screenshots were visually inspected. No additional live ChatGPT retest was needed because the runtime was unchanged during this preparation; prior live verification covers conversation/Space/dot navigation and position stability.

ZIP SHA-256: `311FA6E7EDB84E516E4A9095790299D9D0FF272FA9AA8541244D0E946F32CC64`

確認用ZIPの検証は成功しています。今回の変更は公開準備用スクリプト・文書・画像だけで、runtimeを変更していないため実画面の再操作は行っていません。最終版数更新後は、その版数の成果物を再検証・再生成してください。この記録は今回の確認用ZIPにだけ対応します。

## Store listing / 掲載原稿

| Field | Draft |
| --- | --- |
| Item | Update existing item `nleamodjnjbpcemdbcemfpbaelkkmmpe`; do not create a duplicate |
| Name | `Prompt Outline Navigator` |
| Short description | Keep manifest description: `A live table-of-contents and navigation sidebar for ChatGPT conversations` (73 characters) |
| Detailed description | [Japanese](../store-assets/listing.ja.txt), [English alternative](../store-assets/listing.en.txt) |
| Category | Tools, matching the current public listing |
| Homepage | `https://github.com/ten9miq/prompt-outline-navigator` |
| Support | `https://github.com/ten9miq/prompt-outline-navigator/issues` |
| Privacy policy | `https://github.com/ten9miq/prompt-outline-navigator/blob/main/PRIVACY.ja.md` (current listing URL; publish the updated policy here before submission) |
| Content rating | No mature content supplied by the extension; screenshots contain only fictional research notes |

Use Japanese for the existing Japanese listing. The English text is a translation draft; verify the dashboard's available locale configuration before adding another language. No manifest localization was added. Preserve the existing distribution unless the owner chooses otherwise. Proposed privacy updates are in `PRIVACY.md` and `PRIVACY.ja.md`; finalize their effective date when releasing.

## Privacy practices / プライバシー申告

Single purpose:

> Provide a local outline and in-page navigation for supported ChatGPT conversations, documents, and message feeds.

単一目的：対応するChatGPTの会話・文書・メッセージフィードに、端末内で処理する目次とページ内移動機能を提供すること。

| Dashboard field | Copy-ready rationale |
| --- | --- |
| `storage` | Stores only the boolean sidebar open/closed preference in `chrome.storage.local`. Content is not stored in extension storage. |
| Site access / host justification | Content scripts run only on `https://chatgpt.com/*` and `https://chat.openai.com/*` to read rendered prompts, headings, active documents and message feeds, build their outline, and navigate within the page. No other sites are accessed. |
| Remote code | No remote code. All JavaScript and CSS are bundled with the extension. No remote scripts, dynamic code evaluation or analytics SDKs. |
| Data usage | Retain `Personal communications` and `Website content`, matching the current listing: content is processed locally for the outline/navigation feature. No developer collection, transmission, sale or third-party sharing. |
| Certifications | Data is not sold; not used/transferred for unrelated purposes; not used/transferred for creditworthiness or lending decisions. These match the inspected runtime. |

端末内だけで処理する場合もデータ取り扱いの開示が必要です。「外部送信なし」を理由に既存のPersonal communications／Website contentを外さないでください。runtimeには外部通信・リモートコード・追加権限がなく、保存値は開閉状態の真偽値だけです。Manifest V3の標準CSPを利用し、カスタムCSP・background/service worker・外部依存runtimeはありません。

## Reviewer notes / 審査向け手順

The extension requires a supported ChatGPT page with rendered content. The empty start page does not show a TOC, although its conversation composer is widened. Reviewers can use their own ChatGPT account and a non-sensitive conversation containing headings. No extension-specific login, payment or subscription exists. Space/dot depend on feature availability in the reviewer's ChatGPT account; do not promise access to those services.

1. Open an existing conversation with headings on `https://chatgpt.com/` and reload after installing the update.
2. Confirm prompt/heading groups, click an upper and lower heading, and check the active highlight and smooth movement.
3. Close/reopen the sidebar and reload to confirm its saved preference.
4. Open and dismiss ChatGPT settings: sidebar and open button temporarily retreat, then the previous state returns.
5. If available, open an active Space document or dot feed; preview cards/composers do not generate outline entries.

審査者は自身のChatGPTアカウントで、機密情報を含まない既存会話を確認できます。ログイン情報や私的な会話URLを審査資料へ記載しません。

## Release notes draft / 更新内容案

English: Support DOM-based content detection for conversations, active Space documents and dot feeds. Temporarily retreat during settings/operation dialogs while preserving sidebar preferences. Use a full-height sidebar, widen initial new-chat/project composers, and improve navigation: smooth scrolling completes before correction, while virtualized recovery remains immediate and later clicks/user scrolling cancel old corrections.

日本語：URL制限に代えて本文構造で検出し、通常会話・プロジェクト会話・Spaceのアクティブな文書・dotフィードに対応。設定・操作ダイアログでは開閉状態を保ったまま一時退避。目次を画面上端から表示し、新規会話とプロジェクトの初回入力欄も拡幅。通常クリックは滑らかな移動完了後に位置補正し、仮想化復旧は即時移動を維持。新しいクリックやユーザーのスクロールで古い補正を中止。

## Final steps requiring release authorization / 公開前の残工程

1. Review the current changes and store drafts. Confirm the latest uploaded dashboard version and candidate release version.
2. The owner-requested version update to `1.4.0` is already complete; do not repeat it for this release. Commit/merge under the repository's release procedure when authorized; publish the updated privacy policies.
3. The full checks and submission ZIP must correspond to that final version. Rebuild only if sources change after verification. Verify the ZIP manifest, hash and source/version agreement. Keep the same version for the tag and GitHub release.
4. Update the existing store item with that final ZIP, descriptions and safe images. Check privacy disclosures and current public policy URL. Review the dashboard's distribution/publication choices, then submit for review only with explicit release authorization.

The agent performed no store upload or submission during preparation; the owner subsequently reported submission. Signing/developer-account/dashboard requirements and the review outcome remain managed by the store and account owner.

## Official references (checked 2026-10-11)

- [Package preparation and increasing versions](https://developer.chrome.com/docs/webstore/prepare)
- [Store listing fields](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Required image sizes](https://developer.chrome.com/docs/webstore/images)
- [Purpose, permissions and privacy declarations](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Local data processing still requires disclosure](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
