# Release preparation / リリース準備

Release target: **1.5.0**, prepared on **2026-10-15** at the owner's request. This is a minor-version update from 1.4.0. The same version is used for the manifest, package metadata, submission ZIP, release merge and annotated tag `v1.5.0`.

## Release contents / 更新内容

- Keep the sidebar's saved manual open/closed state and reserved width across page transitions and dialogs.
- Detect attachment-only prompts so their response headings appear in the outline.
- Resize the left boundary and save the width locally (default 200px, range 160–600px). Double-click the boundary to hide; hover over the right edge to preview and select entries without resizing the page.
- Drag the title bar to move down temporarily. Double-click the title to reset width and vertical position. Home never resets the width.
- Show “Go to conversation start” only when earlier conversation turns are omitted from the rendered DOM.
- Retain DOM-based conversation/Space/dot support, safe local rendering and smooth navigation.

目次の自動退避を廃止し、ページ遷移やダイアログでも手動開閉状態と予約幅を維持します。添付だけの入力に続く回答にも対応します。境界のドラッグによる幅変更・保存、境界ダブルクリックでの非表示、右端ホバーでの一時表示、タイトルのドラッグとダブルクリックによる位置・幅のリセットを追加しました。Homeは幅を変更しません。過去ターンが未描画の場合だけ先頭移動ボタンを表示します。

## Validation and artifacts / 検証と成果物

The normal package builder ran `npm run build`: syntax checks, **84 unit tests** and **15 Playwright browser tests** passed for 1.5.0. The manifest-derived ZIP file list and every entry's SHA-256 were checked against its source.

| Artifact | Value |
| --- | --- |
| Submission ZIP | `dist/prompt-outline-navigator-1.5.0-chrome-web-store.zip` |
| Version | `1.5.0` |
| Runtime files | `14` |
| Size | `44,568 bytes` |
| SHA-256 | `E06CCF55F9F3DC64C48A2A8F4A554590170910DF135FBB99D5C40E89C597E93E` |
| Tag | `v1.5.0` on the release merge commit |
| GitHub release location | `https://github.com/ten9miq/prompt-outline-navigator/releases/tag/v1.5.0` |

The ZIP contains only manifest-referenced runtime files, icons and `LICENSE`. Private content, logs, dependencies, tests and documentation are excluded. Its manifest is at the ZIP root. Do not submit an old 1.3.32 or 1.4.0 package for this update.

ソースとZIPの完全なファイル一覧・内容ハッシュを照合しています。個人の会話、ログ、テスト、開発依存などはZIPに含めません。旧版ZIPを更新提出に使わないでください。

Rebuild only if packaged sources change:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:USERPROFILE 'AppData\Local\ms-playwright'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-store-package.ps1
```

Use `-Review` for a review-only package. `-SkipTests` is allowed only immediately after successful checks of unchanged runtime; it still verifies the exact ZIP contents and hashes.

Both sample screenshots were regenerated from fictional repository-owned content with the current runtime using `node scripts/capture-store-screenshots.js`: light/dark themes, 1280x800, 2 prompt groups, 8 headings and no page/console errors. They are simulated samples, not private ChatGPT account captures. See [asset inventory](../store-assets/README.md).

Runtime behavior was also checked in dedicated Chrome before the version-only update: search/layout stability, attachment response headings, page transitions, resizing/persistence, vertical dragging, hover selection and title reset. Unrendered-turn detection is additionally covered by the anonymized browser fixture; it depends on ChatGPT's DOM and is not a history-API guarantee.

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
3. Resize by dragging the left boundary; reload to confirm the saved width. Drag the title down and double-click it to reset width to 200px and vertical position to 0px.
4. Double-click the left boundary to hide, hover at the rightmost 6px to select an entry in the temporary preview, and move out to hide it again. Hovering does not resize the page. The TOC button restores the pinned sidebar.
5. Navigate to the start page or settings and open/dismiss a search dialog. The saved manual sidebar state and reservation remain stable. A page without supported content keeps the sidebar with an empty-state message.

拡張固有のログイン・課金はありません。審査者自身のChatGPTアカウントと機密情報のない会話で確認できます。ログイン情報や私的な会話URLは審査資料へ記載しません。

## Publication status and final steps / 公開範囲と最終工程

The requested release workflow prepares the final version, merges to `main`, pushes the annotated tag and publishes the matching GitHub release with the ZIP. Chrome Web Store upload/submission is a separate operation; preparation or a GitHub release does not prove store submission, approval or availability.

1. Keep the final version `1.5.0` unchanged through merge, tag, package and release. Do not increment it again during this release.
2. Publish the updated listing/privacy documents with the release sources.
3. For a store submission, check the currently uploaded dashboard version, existing listing, distribution/publication settings and privacy declarations, then upload this ZIP and submit only within the owner's requested scope.
4. Record the store's actual submission/approval result separately. No store approval is asserted in this preparation record.

今回のZIP作成やGitHub側の公開だけでは、Chrome Web Storeへの審査提出・承認・ストア公開を意味しません。ストア側の操作と結果は別途確認します。

## Previous release / 前回版

Version 1.4.0 was tagged on merge commit `84f15df` and has a GitHub release dated 2026-10-11. The owner previously reported submitting it for store review; approval has not been verified here. This 1.5.0 record replaces the old preparation instructions, not that historical outcome.
