# Gemini support and verification / Gemini対応と検証

Gemini support is included in the locally prepared 1.7.0 sources and release package, but has not been published. The published v1.6.3 package predates these changes. See [release preparation](RELEASE.md).

Gemini対応を含む1.7.0のソースと正式リリース用パッケージをローカルで準備していますが、公開はしていません。公開済みv1.6.3には含まれません。[リリース準備](RELEASE.md)を参照してください。

## Scope / 対応範囲

| Area | Behavior |
| --- | --- |
| Site access | `https://gemini.google.com/*`; the existing ChatGPT hosts remain supported |
| Outline | Rendered conversation prompts and response headings, including attachment-only prompt groups |
| Incremental changes | Streaming headings, response replacement/remounts, delayed source markers, SPA conversation changes |
| Layout in regular `/app` chats | Responses, sent prompts, initial/existing composers and response actions use the available chat-pane width |
| Response gutters | The extension adds 32px per side, or 16px at viewport widths of 700px or less; native inner block spacing remains |
| Canvas and notebooks | Their contents are not outline sources or width-adjustment targets; coexistence layout is checked |
| Mobile Canvas | Fullscreen overlays temporarily hide the TOC/hover trigger without changing the saved mode; inline code headers wrap their controls |

The extension uses page DOM structures, not conversation-history APIs. Gemini history is recognized through `infinite-scroller.chat-history` or `data-test-id="chat-history-container"`, pairing `user-query` with `model-response model-response-content`. Role labels, thinking panels and controls are excluded from response headings. This depends on the current site DOM and may need maintenance after site updates.

履歴APIは使わず、描画済みDOMから目次を作ります。通常会話の履歴領域だけを対象にし、思考パネル・読み上げ用ラベル・操作部分を除外します。新規画面の絶対配置やモバイル入力部品のmarginを幅に含め、回答下の評価・コピー行も本文の実文字位置へ揃えます。ボタンの並び順と意味は変更しません。

## History limitation / 履歴保持の制約

**Gemini turns detached from the DOM are not retained or recovered.** ChatGPT's discovered-history retention and destination recovery are separate behavior and are unchanged.

**GeminiでDOMから切断されたターンの目次保持・クリック復旧は未対応です。** 切断ターンを保持しない方針は、URL更新とDOM更新が前後するSPA遷移で旧会話の項目が残る問題を避けるためのものです。未再現の仮想化を根拠に、この方針を無効化していません。

The live long-conversation check reached 20 inputs/20 responses, 32,248 response characters and 58 headings. All 20 turn nodes remained connected, including the same eight nodes captured at the beginning; ID disappearance and same-ID remount counts were zero. Nineteen older turns used `content-visibility:auto`. That is rendering deferral, not evidence of DOM-removal virtualization. This check does not establish ChatGPT-equivalent recovery or behavior at an unlimited conversation length.

20ターンの実検証では、見出しの件数・順序・一意性、生成中の更新、先頭・中間・末尾の往復、移動後の安定、active追跡を確認しました。ただしDOM削除型の仮想化は発生せず、削除時の正常動作を確認したものではありません。末尾ではスクロール下限が優先され、activeはクリック項目を固定せず現在位置の判定線に従います。

## Verification boundary / 検証範囲

| Evidence | Confirmed scope |
| --- | --- |
| Live Chrome 155.0.8059.85 | Regular/new conversations, response/prompt/input/action geometry and button hit areas; 1643px and 640px viewport checks |
| Live long conversation | 20 turns, 58 headings; 1280×900 viewport, rendered scroll height 33,352px; original node/ID tracking and stable navigation |
| Live Canvas/notebook | One notebook and its source dialog, one slide Canvas, and one generated single-HTML code Canvas; embedded/fullscreen and code/preview layouts |
| `tests/gemini.spec.js` | Anonymous DOM fixtures for source detection, prompt pairing, streaming/remounts, SPA ordering in an isolated world, new-chat/width/action layout, and Canvas controls |

Generated test conversations contain dummy material and are not release assets. Private conversation URLs, account data and live screenshots are excluded from public documentation and store materials. Feedback, sharing and export operations were not executed; button geometry and center hit testing were used. The code demo's local counter and region scrolling were tested without uploading real files.

実画面とfixtureは別の証拠です。fixtureの人工的なDOM置換を、実サービスの仮想化再現とは扱いません。ノートブックの全機能、すべてのCanvas種類、すべてのアカウント構成やブラウザー版を検証したものではありません。詳細な経過は[信頼性監査](TOC_RELIABILITY.md)に記録しています。

## Other page customizations / 他のページ拡張との競合

An additional `enhancer-shortcuts-row` injected with a style named `notebooklm-enhancer-gemini-styles` overlapped Gemini's selected Canvas chip with an extra Deep Research button. The overlap was unchanged when this extension's layout classes were removed. The injected row is not created by this repository; its product name and settings were not inferred or changed. This is a known external customization conflict, not a repaired defect or a claim of compatibility with every extension.

別の注入機能によるショートカット競合は、対象拡張の幅補正を外しても再現しました。相手側の正式な製品名を推測せず、他拡張の設定やファイルは変更していません。ブラウザーの見た目の問題すべてを、この拡張の不具合と断定しないでください。

## Updating an installation / 更新時の確認

Reload the unpacked extension and then reload existing Gemini tabs. An update can request access to `gemini.google.com`. A new tab without supported content shows an empty outline; the saved pinned/hover preference still applies, except while the native mobile fullscreen Canvas overlay temporarily covers that surface.

展開済み拡張を再読み込みした後は、既存のGeminiタブも再読み込みします。追加サイトへの許可を確認し、未対応の内容に目次がないことと、入力欄や操作部分が壊れていることを区別して確認してください。
