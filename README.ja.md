# TOC Navigator for ChatGPT

[English](README.md) | [日本語](README.ja.md)

ChatGPTの会話に、リアルタイムで更新される目次とナビゲーション用サイドバーを追加します。

## 機能

- ChatGPTのReactルートを移動せず、専用の200pxサイドバーを表示し、開閉状態を保存します。
- ChatGPTのコンテンツ幅変数を利用し、回答本文と入力欄を幅広く表示します。
- `MutationObserver`を使用し、変更された会話ターンと見出しだけを更新します。
- `IntersectionObserver`を使用し、現在表示しているプロンプトと見出しを追跡します。
- 現在位置に対応するTOC項目が、サイドバー内に表示され続けるよう自動追従します。
- HTMLのように見える文字列を含め、プロンプトと見出しを`textContent`で安全に描画します。
- 見出し階層とプロンプトグループの折りたたみ、ライト・ダーク別に調整した階層色と選択中のPROMPT色、SPA内のページ遷移に対応します。

## 開発

```powershell
npm test
npm run check
```

Chromeの「拡張機能」画面でデベロッパーモードを有効にし、このディレクトリを「パッケージ化されていない拡張機能を読み込む」から選択します。

ローカルのブラウザー回帰テストには`tests/browser-fixture.html`を使用します。初期表示、HTMLのように見えるラベルの文字列処理、項目の差分追加・更新・削除、グループ追加、サイドバーの開閉に伴うレイアウト変更を確認できます。

## 由来

Leo Zによる[ChatGPT Table of Contents](https://github.com/WindZZzzZZzz/gpt-toc-extension)を基にしています。初期ソースにはChromeウェブストア版1.2.1のスナップショットを使用しました。
