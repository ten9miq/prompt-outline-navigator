この改修なら、**元拡張へStylus/UserScriptを単純に貼り付けるのではなく、TOCの更新・描画・現在位置追従・レイアウトを分離して整理する**のがよいです。

まず重要なのは、**GitHubの `main` は manifest上 v1.0.1ですが、Chrome Web Store版は v1.2.1** だという点です。([GitHub][1])
したがってCodexで実装を始めるときは、**実際に使用中の1.2.1を展開したソースを基準にする**ことを推奨します。GitHub版から始めると、1.2.1で追加された変更を失う可能性があります。

## 目標とする構成

最終形は、概念的には以下の5つに分けます。

```text
ChatGPTTOC
├─ ConversationObserver
│   └─ ChatGPT本文の追加・削除・変更を監視
│
├─ TocModel
│   └─ Prompt / Assistant / Heading の対応関係を保持
│
├─ TocRenderer
│   └─ TOCのDOMを生成・差分更新
│
├─ ActiveTracker
│   └─ IntersectionObserverで現在位置を追跡
│
└─ SidebarLayout
    └─ 右側領域確保・表示/非表示
```

ファイル分割まで行う必要はありません。最初は `content.js` 内で責務を分けるだけでも十分です。

---

# 1. 最初に1.2.1を基準化する

これは最初の作業にした方がいいです。

### 作業

1. 現在インストールしている **1.2.1の拡張ソースを取得**
2. GitHub版1.0.1とdiff
3. `upstream-1.2.1` のような初期commitを作成
4. そこから改修branchを作成

GitHub版は現在、`content.js`、`styles.css`、`manifest.json` を中心とした非常に小さい構成です。([GitHub][2])

この状態を残しておけばCodexにも、

```text
既存機能を壊さず、変更理由ごとにコミットする
```

と指示しやすくなります。

---

# 2. HTMLタグを含む見出しで壊れる問題を最優先で修正

これは原因がほぼ特定できます。

現在は見出しを

```js
text: heading.textContent.trim()
```

で取得しているので、**取得側は問題ありません**。ところが描画時に、

```js
<span class="toc-text">${node.text}</span>
```

として `innerHTML` に流し込んでいます。([GitHub][3])

Promptも同様に、

```js
<span class="toc-group-prompt">${group.prompt}</span>
```

です。([GitHub][3])

したがって例えば、

```text
<div>タグについて
```

という見出しがあれば、文字列ではなくHTMLとして解釈される可能性があります。

### 改修方針

`escapeHTML()` を追加するより、

**ユーザー由来・ChatGPT由来の文字列を `innerHTML` に渡さない**

ようにします。

```js
const text = document.createElement('span');
text.className = 'toc-text';
text.textContent = node.text;
```

を基本にします。

固定SVGなど、拡張自身が持っている定数だけは `innerHTML` を許容しても構いません。

### テストケース

最低限、

```text
<h1>タグ
<div>test</div>
A & B
"quoted"
< > & " '
<script>alert(1)</script>
```

をPrompt・H1〜H6それぞれで確認します。

---

# 3. 2秒ポーリングを廃止し「変更された回答だけ」更新

ここが今回の性能改善の中心です。

現在のGitHub版は、

```js
setInterval(..., 2000)
```

で最後のAssistantメッセージ全文の `textContent` を取得し、変化すると

```js
this.extractHeadings();
```

を呼びます。([GitHub][3])

しかも `extractHeadings()` はその都度、

```js
document.querySelectorAll('[data-message-author-role="user"]')
document.querySelectorAll('[data-message-author-role="assistant"]')
```

から**全会話を再構築**しています。([GitHub][3])

長い会話ほど無駄が増える構造です。

## 推奨方式

### 初期表示時

一度だけ、

```text
scanConversation()
```

を実行。

### 以後

`MutationObserver` で会話領域だけを見る。

```text
#thread
  ↓
assistant turn追加
  ↓
そのturnだけ解析
  ↓
TOCへgroupを1つ追加
```

さらに、

```text
既存assistant turn
  ↓
新しいH2がDOMへ追加
  ↓
そのH2だけTOCへ追加
```

とします。

---

## ただし「追加だけ」では不十分

ここは重要です。

ChatGPTでは生成中、

```text
## セ
## セキ
## セキュ
## セキュリティ
```

のように見出し自体のテキストが更新される場合があります。

そのため監視は二種類に分けた方がよいです。

### 構造変更

```js
childList: true
subtree: true
```

新しい、

* user turn
* assistant turn
* h1〜h6

だけを処理。

### 見出し文字列変更

```js
characterData: true
```

ただし、

```text
変更されたTextNode
        ↓
親が h1〜h6 か？
        ↓ yes
対応するTOC文字列だけ更新
```

に限定します。

通常の回答本文のtoken更新は無視します。

これなら、

> ストリーミング中だからMutationObserverが大量発火して逆に重くなる

という問題もかなり抑えられます。

---

# 4. 「全TOC再描画」もやめる

ここも性能上重要です。

現状は最終的に、

```js
tocContent.innerHTML = tocHTML;
```

でTOC全体を作り直しています。([GitHub][3])

これを、

```text
addGroup()
addHeading()
updateHeading()
removeHeading()
reconcileGroup()
```

に分けます。

例えば、

```js
headingElement -> tocElement
```

の対応を、

```js
WeakMap
```

で持たせます。

概念的には、

```js
this.headingToTocItem = new WeakMap();
this.turnToGroup = new WeakMap();
```

です。

そうすると、

```text
DOMのH2が変更
↓
WeakMapからTOC項目取得
↓
textContentだけ変更
```

で済みます。

---

# 5. 「回答再生成」だけは対象回答を再スキャン

完全な追加型にすると問題になるケースがあります。

例えば、

* 回答を再生成
* Prompt編集
* 会話branch変更
* Assistant回答の置換

です。

この場合は、

```text
全会話再構築
```

ではなく、

```text
変更されたAssistant turnだけ再解析
```

します。

つまり、

```js
reconcileAssistantTurn(turnElement)
```

を作って、

```text
現在のheading一覧
vs
保存済みheading一覧
```

だけ比較します。

この方式なら、

**通常生成 → incremental**

**特殊な置換 → scoped reconciliation**

にできます。

かなり堅牢です。

---

# 6. UserScriptの現在位置追従を本体へ統合

添付UserScriptの設計はそのまま利用価値があります。

現在、

* Heading用 `IntersectionObserver`
* Prompt用 `IntersectionObserver`
* active解除時のヒステリシス

を実装しています。

Promptについても同じ方式です。

## 本体統合では少し変更する

今のUserScriptはTOCが更新されるたび、

```js
rebindObservers()
```

して全Observerを作り直しています。

本体版では、

```text
H2追加
↓
ioHeadings.observe(newHeading)
```

だけにします。

削除なら、

```js
ioHeadings.unobserve(oldHeading)
```

です。

### 対応関係

現在は、

```js
data-group
data-heading
```

を使って再検索しています。

本体統合後は、

```js
headingToTocItem.get(heading)
```

で直接取得できます。

こちらの方がかなり単純です。

---

# 7. Active項目に合わせてTOC自身も追従させる

これは現在のUserScriptからさらに一段改善した方がいいです。

本文をスクロールして、

```text
H4
```

がactiveになったとき、

**TOC側でもそのH4が画面外なら自動スクロール**します。

ただし、

```js
item.scrollIntoView()
```

はページ本体まで動かす可能性があるため避けた方が安全です。

例えば、

```js
ensureTocItemVisible(item)
```

を作り、

```text
item.top < tocContent.top
    → tocContent.scrollTop -= 差分

item.bottom > tocContent.bottom
    → tocContent.scrollTop += 差分
```

とします。

これで、

> 本文の現在位置
>
> ↓
>
> TOCのactive表示
>
> ↓
>
> TOCもその場所へ自動追従

という動作になります。

---

# 8. ハイライト色・現在のStylus設定を本体CSSへ移植

現在のUserScriptではactiveを、

```css
.toc-item.active {
    background: #6940c5;
    border-left-color: #60a5fa;
    color: #fff;
}
```

としており、Promptにもactive表現があります。

これはそのまま `styles.css` へ移してよいです。

またStylusで現在、

* Sidebar 200px
* ChatGPTテーマ色への追従
* 12px文字
* H2〜H6のインデント縮小
* padding縮小
* Prompt最大5行

などを設定しています。 

この**TOCに関係する部分だけ** `styles.css` へ移植します。

Stylusのその他の、

```css
#thread
.markdown
table
prompt-textarea
```

などは今回の拡張に入れない方がいいです。

---

# 9. 右サイドバーを「ChatGPTの上に重ねる」のをやめる

ここも今回の大きな変更です。

現在の元拡張は、

```css
#chatgpt-toc-sidebar {
    position: fixed;
    right: 0;
    width: 300px;
}
```

です。([GitHub][4])

つまりChatGPTの画面とは無関係に**上から被せています**。

Stylusではその対策として、

```css
body > div > div.flex {
    padding-right: 200px;
}
```

を入れています。

ただしこれではChatGPTのDOM構造次第で、

* Agent
* Activities
* Canvas系
* 右側パネル

まで影響する可能性があります。

## 推奨レイアウト

TOCそのものは引き続き、

```text
body
 ├─ ChatGPT app root
 └─ #chatgpt-toc-sidebar
```

の**兄弟要素**にします。

React管理下へTOCを入れません。

そしてChatGPTのapp rootに拡張側から専用classを付けます。

```text
body
 ├─ .chatgpt-toc-app-root
 └─ #chatgpt-toc-sidebar
```

開いているときだけ、

```css
.chatgpt-toc-open .chatgpt-toc-app-root {
    width: calc(100% - var(--chatgpt-toc-width));
}
```

相当の領域を確保します。

概念としては、

```text
┌──────────────────────────────┬───────────┐
│                              │           │
│          ChatGPT             │   TOC     │
│                              │  200px    │
│ Agent等の右ペインもこの中    │           │
│                              │           │
└──────────────────────────────┴───────────┘
```

です。

これならChatGPT Agentが右側UIを出しても、

```text
ChatGPTの右UI
↓
そのさらに右側
↓
TOC
```

になります。

### 避けたい方式

Reactのrootをこちらで別DOMへ `appendChild()` してラップするのは避けます。

ChatGPT側のReactがDOM構造を前提としている可能性があるためです。

**既存rootを移動せず、classを付けて幅だけ予約する**方が安全です。

---

# 10. TOCは初期状態でOPEN

ここは現在と逆にします。

現状コードは、

```js
this.isVisible = false;
```

から開始しています。([GitHub][3])

これを、

```js
this.isVisible = true;
```

相当に変更します。

### 起動時

```text
ページ表示
↓
TOC作成
↓
OPEN
↓
ChatGPT app rootの右側200pxを予約
```

### ×クリック

```text
×
↓
sidebar hidden
↓
予約していた200pxを解除
↓
TOCボタン表示
```

### TOCボタン

再び開く。

---

# 11. 表示状態は最初は保存しない方がよい

要件が、

> デフォルトでは表示

なので、まずは

```text
リロード → OPEN
```

でよいと思います。

つまり、

```text
×を押した
↓
現在ページでは閉じる

F5
↓
再び開く
```

です。

これなら `chrome.storage` 権限も不要です。

現在のmanifestも `permissions: []` です。([GitHub][1])

後から必要なら、

```text
「最後の開閉状態を保存」
```

を別機能として追加できます。

---

# 12. ChatGPTのDOM依存部分を一か所へ集約

これは今後の保守性のためにかなり重要です。

例えば、

```js
const SELECTORS = {
    thread: '#thread',
    userMessage: '[data-message-author-role="user"]',
    assistantMessage: '[data-message-author-role="assistant"]',
    headings: 'h1,h2,h3,h4,h5,h6'
};
```

のようにします。

特に、

```text
Prompt N
Assistant N
```

を単純に配列indexで対応させる現行方式は、Agentや特殊turnが挟まると壊れる可能性があります。

現行コードは実際、

```js
userPrompts[messageIndex]
```

で対応付けています。([GitHub][3])

ここは可能なら、

```text
Conversation turn
 ├─ user
 └─ assistant
```

というDOM上の順序から対応を決める方式へ変更します。

Codexには、

> `data-testid` / `data-turn` 等、現在のChatGPT DOMを確認し、最も安定したturn単位のselectorを利用する。特定のTailwind生成classには依存しない。

と指示するのがよいです。

---

# 実装順序

私はこの順番を推奨します。

| Phase | 改修                             | 理由           |
| ----- | ------------------------------ | ------------ |
| 0     | v1.2.1の実ソースを取得・baseline commit | 土台を確定        |
| 1     | `innerHTML` の安全化               | DOM破壊問題を先に排除 |
| 2     | TOC内部モデル整理                     | 後続の差分更新の基盤   |
| 3     | 2秒polling廃止                    | 性能改善         |
| 4     | Assistant単位のincremental更新      | 全スキャン排除      |
| 5     | 回答再生成用reconcile                | 特殊ケース対応      |
| 6     | IntersectionObserver統合         | 現在位置表示       |
| 7     | TOC自身の自動追従                     | UX改善         |
| 8     | StylusのTOC CSS統合               | 見た目確定        |
| 9     | 右側をsidecar化                    | Agent等との競合解消 |
| 10    | 初期OPEN / × / 再OPEN             | 表示制御         |
| 11    | 回帰・性能テスト                       | 完成           |

この順なら、どこかで不具合が出ても原因を切り分けやすいです。

---

# Codexに特に守らせたい設計条件

実装時の中核条件はこのあたりです。

```text
- setIntervalによる継続的なTOC更新を使用しない。
- 初期ロード時のみ全Conversationをscanする。
- 通常更新はMutationRecordから変更されたturn/headingのみ処理する。
- Assistant本文の通常token追加ではTOC更新を行わない。
- heading内部のcharacterData変更時だけTOCラベルを更新する。
- 回答置換時は対象assistant turnのみreconcileする。
- 全TOCのinnerHTML再生成を通常更新経路では行わない。
- Prompt/Heading文字列をinnerHTMLへ直接挿入しない。
- textContentを使用する。
- Heading DOMとTOC DOMの対応をMap/WeakMapで保持する。
- IntersectionObserverを追加headingごとにobserve/unobserveする。
- active変更時はTOCスクロール領域だけを自動追従させる。
- ChatGPT React rootをreparentしない。
- TOCはChatGPT app rootの外側に配置する。
- TOC表示中はapp rootの横幅を縮め、右側領域を予約する。
- 初期状態はTOC表示。
- ×で非表示、既存TOCボタンから再表示可能にする。
- ChatGPTの生成class名への依存を極力避ける。
```

## テスト項目

特に以下はCodexにテストさせた方がいいです。

* H1〜H6が混在
* `<div>` 等を含む見出し
* `<script>` という**文字列**
* 日本語・英語・絵文字
* 見出しなし
* 生成途中で見出しが追加される
* 長い回答
* 50〜100以上の会話turn
* 回答再生成
* Prompt編集
* 会話branch変更
* 新しい会話へSPA遷移
* Agent表示
* ChatGPT側右サイドUI表示
* TOCを閉じる→開く
* Light/Dark
* 折りたたみ状態
* active中の項目がTOC表示領域外になった場合
* TOCを開いた状態でウィンドウ幅変更

---

## 特に重要な2点

今回の改修で、私はこの2点を「単なる機能追加」ではなく**構造変更**として扱います。

**1. `MutationObserver` に変えるだけでは不十分**

```text
MutationObserver
↓
毎回 extractHeadings()
```

では、ポーリングがObserverになっただけで、むしろ生成中の更新回数が増える可能性があります。

必ず、

```text
MutationRecord
↓
何が変化したか判定
↓
該当項目だけ差分更新
```

まで実装すべきです。

**2. 右側200pxの確保をStylusの `padding-right` 移植だけで済ませない**

今回の「Agent等の右側UIに隠れない」という要件を考えると、

```text
ChatGPTそのものの利用可能領域
+
TOC専用領域
```

というsidecar型に変えた方が長期的に安定します。

---

この設計なら、現在のStylusとUserScriptは最終的にほぼ不要になり、**拡張単体で「常時表示・差分更新・現在位置ハイライト・自動追従・HTML安全化・右側領域確保」まで完結**できます。

次にCodexで実装へ移る段階では、**この内容をそのまま `PLAN.md` / Codex向け実装指示へ落とし込み、各Phaseの完了条件まで定義してから実装させる**のが適しています。

[1]: https://github.com/WindZZzzZZzz/gpt-toc-extension/blob/main/manifest.json "gpt-toc-extension/manifest.json at main · WindZZzzZZzz/gpt-toc-extension · GitHub"
[2]: https://github.com/WindZZzzZZzz/gpt-toc-extension "GitHub - WindZZzzZZzz/gpt-toc-extension: a Chrome extension that displays a table of contents for ChatGPT generated content in a right sidebar · GitHub"
[3]: https://github.com/WindZZzzZZzz/gpt-toc-extension/blob/main/content.js "gpt-toc-extension/content.js at main · WindZZzzZZzz/gpt-toc-extension · GitHub"
[4]: https://github.com/WindZZzzZZzz/gpt-toc-extension/blob/main/styles.css "gpt-toc-extension/styles.css at main · WindZZzzZZzz/gpt-toc-extension · GitHub"
今回の改修内容だと、単なる「Table of Contents」より **「ナビゲーション機能を強化したTOC」** という位置づけなので、名前もそれが伝わるものがよいです。

### 第一候補

**ツール名**

> **TOC Navigator for ChatGPT**

**リポジトリ名**

> `chatgpt-toc-navigator`

これが一番バランスがいいと思います。

今回追加する機能が、

* 常時表示サイドバー
* 現在位置ハイライト
* TOCの自動追従
* 差分更新
* ChatGPT UIと競合しないレイアウト
* 見出しDOMの安全な処理

なので、単なる「TOC」より **Navigator** の方が実態に合います。

また、`ChatGPT TOC Navigator` より **`TOC Navigator for ChatGPT`** の方が、「ChatGPT公式機能」と誤認されにくい名称です。

---

### 他の候補

| ツール名                          | リポジトリ名                      | 印象                       |
| ----------------------------- | --------------------------- | ------------------------ |
| **TOC Navigator for ChatGPT** | `chatgpt-toc-navigator`     | **おすすめ。機能を最も正確に表す**      |
| **ChatGPT TOC Sidebar**       | `chatgpt-toc-sidebar`       | シンプル。右サイド表示を強調           |
| **ChatGPT TOC Enhanced**      | `chatgpt-toc-enhanced`      | 元拡張の改良版であることが明確          |
| **ChatGPT Outline Navigator** | `chatgpt-outline-navigator` | TOCより一般的で洗練された印象         |
| **Outline for ChatGPT**       | `outline-for-chatgpt`       | Chrome拡張として分かりやすい        |
| **ChatGPT TOC Plus**          | `chatgpt-toc-plus`          | 短いが、ChatGPT Plusと少し紛らわしい |
| **ChatGPT TOC Extended**      | `chatgpt-toc-extended`      | fork/派生版らしい名前            |
| **ChatGPT TOC Next**          | `chatgpt-toc-next`          | 大幅改修版という印象だが少し抽象的        |

### 「Enhanced」はfork感が強い

元の

> `ChatGPT Table of Contents`

をかなり尊重したいなら、

> **ChatGPT Table of Contents Enhanced**

リポジトリ：

```text
chatgpt-table-of-contents-enhanced
```

でもよいです。

ただ、今後独自機能を増やしていくなら、ずっと「Enhanced」と名乗るより、

```text
gpt-toc-extension
        ↓ fork
chatgpt-toc-navigator
```

のように独立した名前にした方が扱いやすいです。

---

## 私ならこうする

```text
Chrome拡張名:
TOC Navigator for ChatGPT

GitHub:
chatgpt-toc-navigator
```

README冒頭では、

```text
TOC Navigator for ChatGPT
An enhanced table-of-contents and navigation sidebar for ChatGPT.

Based on ChatGPT Table of Contents by WindZZzzZZzz.
```

という位置付けにします。

これなら元プロジェクトへの帰属も明確にしつつ、独自プロジェクトとして育てられます。

特に今回のように**元拡張の「目次生成」だけでなく、現在位置追跡やページレイアウト管理まで担うようになるなら `Navigator` がかなり適切**だと思います。
