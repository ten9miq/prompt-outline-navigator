# Prompt Outline Navigator

[English](README.md) | [日本語](README.ja.md)

ChatGPTの会話に、リアルタイムで更新される目次とナビゲーション用サイドバーを追加します。

Prompt Outline Navigatorは独立したプロジェクトであり、OpenAIとの提携や、OpenAIによる承認を受けたものではありません。

[プライバシーポリシー](PRIVACY.ja.md)

[![Chromeウェブストアで入手](https://img.shields.io/badge/Chrome%20Web%20Store-入手-blue?logo=googlechrome)](https://chromewebstore.google.com/detail/prompt-outline-navigator/nleamodjnjbpcemdbcemfpbaelkkmmpe)

## 機能

- ChatGPTのReactルートを移動せず、画面全高の専用200pxサイドバーを表示し、開閉状態を保存します。閉じた状態の開くボタンはページヘッダーの下に置きます。
- URL許可リストではなく本文のDOM構造で、通常・GPT・プロジェクト会話、開いているSpace文書、dotのメッセージ一覧を検出します。文書プレビュー、ナビゲーション、引用返信の操作部分、入力欄は除外します。設定画面と操作ダイアログでは、保存済みの開閉設定を変えずに目次と開くボタンを一時退避し、予約幅も解除します。文書ビューアーは目次の対象として扱います。
- 目次の表示とは独立して、会話の回答本文・入力欄と、新規チャット・プロジェクトホームの初回入力欄を幅広く表示します。設定画面と操作ダイアログでは幅補正も一時停止し、Space文書とdotは専用の本文配置を維持します。
- 幅の広い表や整形済みテキストが隠れないよう、対象を限定したスクロールと折り返しを適用します。
- `MutationObserver`を使用し、変更された会話ターンと見出しだけを更新します。
- ChatGPTが過去のターンを一時的にDOMから外して再マウントしても、発見済みの目次項目、会話内の順序、最初に取得したプロンプトラベルを保持し、選択時に対象ターンを読み込みます。 通常クリックは滑らかに移動し、スクロール完了後に位置を補正します。仮想化した移動先の復旧は即時移動で行い、新しいクリックやユーザーのスクロールで保留中の補正を中止します。
- 会話の先頭より下へスクロールしている間は、目次に「会話の先頭へ移動」を表示します。選択すると先頭へスクロールし、ChatGPTが仮想化した過去ターンを読み込める場合があります。この項目はスクロール位置を示し、目次に未収録の過去ターンがあることを判定するものではありません。目次グループは表示中のメッセージ組から作ります。
- 判定線を含む回答領域を先に確定し、その回答内だけで直前の見出しを追跡します。ChatGPTがDOMを一時的に再マウントしている間は、離れたPROMPTへ飛ばず現在の選択を保持します。
- ページ移動中は現在位置に対応するTOC項目へ自動追従します。新しい項目の追加時は、TOCが末尾にあった場合だけ新しい末尾へ追従し、途中を閲覧していた場合はTOCのスクロール位置を維持します。
- HTMLのように見える文字列を含め、プロンプトと見出しを`textContent`で安全に描画します。
- 見出し階層とプロンプトグループの折りたたみ、ライト・ダーク別に調整した階層色と選択中のPROMPT色、SPA内のページ遷移に対応します。

## 開発

```powershell
npm test
npm run test:unit
npm run test:browser
npm run check
```

`npm test`はNode.jsの単体テストとPlaywrightのブラウザーfixtureテストを実行します。ブラウザーテストにはNode.js 20以降が必要です。初回に`npx playwright install chromium`でPlaywright用Chromiumをインストールしてください。

コンテンツスクリプトは、共通ヘルパー、本文検出用adapter、サイドバーUI、会話同期、移動処理、現在位置追跡、`content.js`の初期化処理に責務を分けています。コードを追加・移動するときは、`manifest.json`の読み込み順を維持してください。

Chromeの「拡張機能」画面でデベロッパーモードを有効にし、このディレクトリを「パッケージ化されていない拡張機能を読み込む」から選択します。

PlaywrightテストはChromium内の模擬ChatGPT会話URLで`tests/browser-fixture.html`を配信し、匿名化した会話DOM、サイドバー初期化、安全なテキスト描画、差分更新、仮想化ターンの保持、開閉動作を確認します。未知のURLでの文書・メッセージadapter、プレビュー除外、初回入力欄の幅と最初のメッセージ生成時のDOM遷移、上下移動、保存状態が開・閉の両方でページやダイアログへの一時退避が設定を書き換えないこと、会話ルートの置換も確認します。`tests/layout-fixture.html`はビューポート幅1280px・1920pxで会話・非対象画面の幅と、サイドバー上端の余白を検証します。インラインでビューポート幅が指定されたアプリ枠と、会話ルート外の入力欄を含む配置も追加で検証します。レイアウトfixtureはブラウザーで手動確認できます。これらの確認はChatGPT実画面での検証を代替するものではありません。

### Chrome Web Store用パッケージ

manifestから参照される実行ファイルとライセンスだけを含む、審査用の最小パッケージを生成します。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-store-package.ps1
```

スクリプトは`npm run build`（JavaScriptの構文検査、unit test、browser test）を実行し、ZIPの完全なファイル一覧と各ファイルの内容を元のソースと照合してSHA-256ハッシュを表示します。出力先は`dist/prompt-outline-navigator-<version>-chrome-web-store.zip`です。`-Review`を付けると末尾に`-review`を付けた確認用ZIPを生成します。`-SkipTests`は、変更のないruntimeの検証が成功した直後だけ使用してください。版数は`main`へのマージ直前に一度だけ更新し、公開済みの版数を使った確認用ZIPを更新提出に使わないでください。

掲載原稿、プライバシー申告、個人情報を含まないサンプル画像と公開前の手順は[公開準備](docs/RELEASE.md)を参照してください。サンプル画像は`node scripts/capture-store-screenshots.js`で再生成できます。

所有者の依頼により、次のストア更新向けに版数`1.4.0`を準備しました。ZIPは`dist/prompt-outline-navigator-1.4.0-chrome-web-store.zip`です。この準備だけでは提出や公開は行いません。

## 由来

Leo Zによる[ChatGPT Table of Contents](https://github.com/WindZZzzZZzz/gpt-toc-extension)を基にしています。初期ソースにはChromeウェブストア版1.2.1のスナップショットを使用しました。

## ライセンス

[MIT License](LICENSE)で公開しています。元プロジェクトの著作権表示を維持しています。
