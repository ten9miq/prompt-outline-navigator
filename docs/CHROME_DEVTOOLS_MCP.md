# Chrome DevTools MCPで実画面を確認しながら開発する

Windows／PowerShell／Codexで、この拡張機能を専用Chromeへ読み込み、ChatGPT実画面を確認する手順。2026年10月11日の開発で使った方法を記録しています。Chrome・MCP・ChatGPTの更新でツールやDOMが変わるため、接続先と公開されたツール定義を毎回確認してください。

## 1. 準備と操作範囲

リポジトリを開き、既存変更を確認します。以下はユーザーフォルダー内の`git\chatgpt-toc-navigator`へcloneしている前提です。別の場所なら`$tocRepository`を実際の保存先に置き換えるか、既に開いたリポジトリで`$tocRepository = (Get-Location).Path`としてください。

```powershell
$tocRepository = Join-Path $env:USERPROFILE 'git\chatgpt-toc-navigator'
Set-Location -LiteralPath $tocRepository
git status --short --branch
git diff --stat
node --version
npm --version
```

Node.jsはPlaywrightに必要な20以降を使用します。初回は`npm ci`と`npx playwright install chromium`で開発依存とブラウザーを用意します。既存の作業者の差分は保持し、開発途中で版数を変更しません。commit・push・公開は、動作確認の依頼とは別に指示されたときに行います。[公開手順](RELEASE.md)と`AGENTS.md`も参照してください。

検証では既存会話・文書の閲覧、スクロール、目次クリック、設定ダイアログの開閉を使用します。会話の投稿・編集・削除、Spaceエディターへの文字入力、設定値の変更は行いません。ログイン・認証確認はユーザー自身が操作します。私的な本文を含むスクリーンショットやログをGitやストアへ掲載しません。

## 2. 専用Chromeを起動する

今回安定して使えたのは、永続的な専用プロファイルと固定のdebug portへの接続です。通常Chromeのプロファイルをコピーせず、専用Chrome内でユーザーがChatGPTへログインします。専用プロファイルを次回も使うと、そのログイン状態や導入した拡張を再利用できます。ただしセッションの有効期限はChatGPT側の仕様に従います。

まず9222の使用状況を確認します。

```powershell
Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

通常Chromeの`chrome://inspect/#remote-debugging`でremote debuggingを有効にしている場合は、ユーザーがOFFにして同じポートを空けます。別のChromeやBraveが待ち受けていると、MCPは意図と異なるブラウザーへ接続します。勝手に既存ブラウザーを終了したり、プロファイルのロックを削除したりしません。

9222が空いている状態で、ユーザーがPowerShellから起動します。Chromeのインストール場所が異なる場合は実際の実行ファイルへ置き換えてください。

```powershell
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' `
  --remote-debugging-port=9222 `
  "--user-data-dir=$env:LOCALAPPDATA\Chrome-MCP-Test"
```

既に同じ専用プロファイルのChromeが起動している場合は、二重起動せずそのプロセスの引数を確認します。Chrome 136以降のdebug port利用では通常のデータディレクトリを指定できず、別の`--user-data-dir`が必要です。[Chrome公式の変更説明](https://developer.chrome.com/blog/remote-debugging-port)

接続先を読み取りだけで確認します。

```powershell
$debugListeners = @(Get-NetTCPConnection -LocalPort 9222 -State Listen)
foreach ($chromeDebugOwner in ($debugListeners.OwningProcess | Sort-Object -Unique)) {
  Get-CimInstance Win32_Process -Filter "ProcessId=$chromeDebugOwner" |
    Select-Object ProcessId,ExecutablePath,CommandLine
}
Invoke-RestMethod 'http://127.0.0.1:9222/json/version' |
  Select-Object Browser,webSocketDebuggerUrl
```

期待するのはGoogle Chromeのプロセス、`--remote-debugging-port=9222`、`--user-data-dir=...\Chrome-MCP-Test`の組み合わせです。`/json/version`の応答だけではプロファイルは証明できないため、プロセス引数と併せて確認します。必要なら`/json/list`でタブ一覧も読めますが、私的なURLやタイトルを報告書へそのまま転載しません。

debug portはブラウザーを操作できる接続口です。外部へ公開せず、専用プロファイルには検証に必要なサイトだけを開きます。[MCP公式の接続説明](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/advanced-usage.md#connecting-to-a-running-chrome-instance)

## 3. Codexから同じChromeへ接続する

Codexのユーザー設定`%USERPROFILE%\.codex\config.toml`の該当サーバーを編集します。既存の同名テーブルを更新し、重複追加しません。プロジェクト設定`.codex/config.toml`などに上書きがある場合も確認してください。[Codex公式MCP設定](https://developers.openai.com/codex/mcp)、[設定の優先順位](https://developers.openai.com/codex/config-basic)

```toml
[mcp_servers.chrome-devtools]
enabled = true
command = "powershell"
env_vars = ["USERPROFILE"]
args = [
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  "& npx.cmd -y chrome-devtools-mcp@latest --categoryExtensions=true ('--workspace=' + (Join-Path $env:USERPROFILE 'git/chatgpt-toc-navigator')) --browser-url=http://127.0.0.1:9222"
]
```

Codexの`args`はサーバーへ渡す文字列の配列です。`command = "npx"`のままTOMLへ`$env:USERPROFILE`や`%LOCALAPPDATA%`を書いても、PowerShellのような環境変数展開を期待できません。上記は明示的にPowerShellを起動し、その中でパスを解決して`npx.cmd`へ渡す例です。別のclone先を使う場合は`Join-Path`の部分も合わせます。これは手順書の設定例で、現在の実設定を自動変更するものではありません。[Codexのargs／env_vars仕様](https://developers.openai.com/codex/config-reference)

`--workspace`は`--filesystemRoot`の別名で、MCPのファイル操作に許可するディレクトリです。`--browser-url`は起動済みChromeへの接続先、`--categoryExtensions=true`は拡張操作ツールの有効化です。[MCP公式オプション](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md)

### workspaceとChromeプロファイルを共通化できるか

| 指定 | 役割 | この手順の保存先 |
| --- | --- | --- |
| Chromeの`--user-data-dir` | Chromeのログイン状態・履歴・拡張等を保存するプロファイル | `$env:LOCALAPPDATA\Chrome-MCP-Test` |
| MCPの`--workspace` | 拡張の導入元やスクリーンショット等、MCPのローカルファイル操作を許可する範囲 | 開発するリポジトリ |

同じ文字列を指定すること自体は可能ですが、プロファイルの共通化にはなりません。workspaceを`Chrome-MCP-Test`だけへ変更しても、Chromeの接続先やprofile保存先は変わらず、ファイル許可の範囲がprofileディレクトリになります。リポジトリ外のprofileをMCPの作業場所にする必要はありません。

現在のMCPは明示workspaceとクライアントから提供されたMCP rootsを合算し、`install_extension`のpathもローカルファイル検証の対象です。そのためrepoがクライアントrootsにも含まれない環境では、profileだけのworkspaceにするとrepoからの導入が拒否される可能性があります。[rootsの実装](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/src/index.ts)、[拡張導入のファイル検証](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/src/tools/extensions.ts)

**専用Chromeのprofileは全プロジェクトで共通、MCPのworkspaceは作業repoごとに指定する**のがこの手順の推奨です。共通の画像・trace置き場が必要ならprofileと別の専用ディレクトリを作り、`--workspace`を追加指定できます。オプションは複数指定可能です。repoを置く場所の違いは上記PowerShellのパス解決部分だけで調整します。

クライアントが作業repoをMCP rootsとして提供していることを確認できる場合は、明示的な`--workspace`を省略する選択もできます。ただし提供の有無はクライアント依存で、省略しても常にrepoへアクセスできるとは限りません。この手順ではその前提に依存せず、repoを明示します。

この接続方式では`--autoConnect`を外します。autoConnectはChrome 144以降の既存セッションに接続する方式で、接続要求ごとにChromeの許可ダイアログが出ます。固定port方式は別の接続方法です。[Chrome公式のautoConnect説明](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session)

拡張操作にはChromeとMCP双方の対応が必要です。公式オプション説明にはChrome 149のリリースまでautoConnect／browserUrl等では使えないという記述が残っています。今回のChrome 155環境ではbrowser-url経由の`install_extension`・`reload_extension`が成功しました。これは検証時点の実績で、すべての版への保証ではありません。ツールが出ない／非対応エラーになる場合は、現在の版とツール定義を確認し、必要ならユーザーが`chrome://extensions`から手動で「パッケージ化されていない拡張機能を読み込む」を使用します。

設定保存だけでは稼働中MCPの引数は変わりません。利用中のCodexクライアントを再起動するなど、MCP接続を作り直してから`list_pages`で確認します。今回も再起動後に接続先が切り替わりました。特定の「Restart」ボタンがあると仮定せず、利用中クライアントに合わせます。`@latest`は将来更新されるため、問題調査時は使用したChrome／MCP版も記録します。

反映が怪しい場合の読み取り例：

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'chrome-devtools-mcp' } |
  Select-Object ProcessId,CommandLine
```

ブラウザー操作担当は一人にします。親agentと子agentが同時にクリックしないよう、ページIDと操作の所有を引き継ぎます。browser-urlで同じChromeへ接続できても、同時操作の競合は防げません。

## 4. 拡張を導入し、変更ごとに再読み込みする

以下はMCPツール名と引数の例です。ターミナルコマンドではありません。利用環境で公開されたツールの定義を優先します。[公式ツール一覧](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md)

| 順序 | ツールと引数 | 確認すること |
| --- | --- | --- |
| 1 | `list_pages({})` | 専用Chromeの期待するタブがある。`about:blank`だけなら接続先とログイン状態を切り分ける |
| 2 | `list_extensions({})` | 対象の名前・ID・版数・enabledを確認する。他の拡張は変更しない |
| 3 | `install_extension`に開始時に解決したrepoの絶対pathを渡す | 未導入時だけ、ZIPではなく展開済みリポジトリを導入する |
| 4 | `navigate_page({"pageId":1,"type":"url","url":"https://chatgpt.com/"})` | `1`は実際のページIDに置き換える。ユーザーが必要なログインを行う |
| 5 | `take_snapshot({"pageId":1})` | 目次と本文の状態を取得する。クリックには最新snapshotのUIDを使う |

**コード変更後は`reload_extension({"id":"一覧で取得したID"})`、続いて`navigate_page({"pageId":1,"type":"reload"})`の両方を行います。** 拡張のreloadだけで、既存タブの古いcontent scriptが最新版へ切り替わったと判断しません。snapshotと`list_extensions`で再確認します。

repoのルートで、導入toolへ渡すJSONを生成する例：

```powershell
@{ path = (Get-Location).Path } | ConvertTo-Json -Compress
```

この出力を`install_extension`の引数として使用します。MCPのJSON引数には`$env:USERPROFILE`をそのまま渡さず、PowerShellで解決済みの絶対pathを渡してください。

拡張ID・ページID・UIDは固定しません。今回は対象IDが`nlidfonjkinijhhmlndcbfdjdnejdgfl`でしたが、次回は必ず一覧から取得します。snapshot後にSPA遷移やDOM更新があれば、クリック前にsnapshotを取り直します。

## 5. 小さく修正し、自動テストと実画面を分けて検証する

1. 変更前に症状を一度観測し、期待する挙動と原因候補を記録する。
2. 原因に対応する最小の修正と、必要な回帰テストを加える。
3. 変更に応じたチェックを実行する。
4. 最新拡張とページを再読み込みし、失敗していた操作と影響範囲を確認する。
5. 成功した項目を理由なく繰り返さず、未確認・失敗は残課題として報告する。

```powershell
npm run check
npm test
git diff --check
```

Playwrightブラウザーの保存場所を明示する必要がある環境では、インストールと実行に同じ値を使います。

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:LOCALAPPDATA 'ms-playwright'
# 初回に未インストールなら npx playwright install chromium
npm test
```

`npm test`はunit testとPlaywright fixtureの両方です。fixture成功はChatGPT実画面成功とは区別します。文書だけの変更ならリンク・関連文書テスト・差分検査を行い、実装や成功済みブラウザーテストを無意味に再実行しません。機能・利用・開発手順が変わる場合はREADME英日を同期します。

## 6. 実画面の受入項目

本文の対応判定は`src/source-adapters.js`のDOM構造によります。URLは検証対象の識別用で、URLだけから対応・非対応を断定しません。

| 対象・操作 | 期待と観測 |
| --- | --- |
| 通常会話 `/c/...`、GPT／プロジェクト会話 `/g/.../c/...` | 添付だけの入力も含めてpromptと回答の見出しが生成される。上→下→上で通常クリックの滑らかな途中位置、終点、その後1～2秒の位置維持を確認 |
| 過去本文の仮想化 | 発見済み項目を保持。移動先がDOMにないことを確認してcached項目を選び、復旧・到達・位置維持を確認。即時処理の指定をコード／fixtureでも確認し、実画面で未測定の速さは断定しない |
| Go to conversation start | 上側のターンが仮想化でDOMから外れた場合だけ表示。全ターンが描画済みなら中間・末尾でも表示しない。先頭へ移動しただけでは消さず、上側のターンが再描画されたら消す。DOMの予約余白による判定と保持済み過去groupの判定はfixtureでも確認 |
| Spaceの開いている文書 | 表示中の`[data-markdown-copy-content] .ProseMirror`を対象にする。card preview・thumbnail・composerを混ぜず、見出しの上下へ移動できる |
| dotのメッセージフィード | `article[data-message-id]`と同じIDの内側本文を組として検出する。引用返信button等を除外し、本文が所有するスクロール領域で上下へ移動 |
| 新規会話／プロジェクト開始前 | 本文がなくても手動開閉の状態と予約幅を維持し、目次枠に項目なしを表示。会話用入力欄の拡幅は適用。既存会話との往復で状態を確認。送信直後は投稿せずfixtureで検証する |
| 検索・選択操作・非モーダルチャット | 目次・予約幅・会話の幅補正を維持。表示やホバーで幅が往復しない。保存設定を書き換えない。開・閉の両方を確認。設定URLへの遷移時も手動開閉の状態と予約幅を維持 |
| ヘッダーと横幅 | 目次上端は通常0px、閉状態toggleの上端は48px。タイトルのドラッグで一時移動し、予約幅が変わらないことを確認。タイトルのダブルクリックで幅200pxと上端0pxを同時に復元し、幅のリセットを保存。Homeは幅を変えず上へ移動し、ページ遷移・再読み込みでは上下位置だけ0pxに戻ることを確認。共有button・×のhit位置、本文とcomposerの幅、横overflowを確認。Space／dotへ会話用幅CSSを適用しない |
| 幅変更と右端ホバー | 左境界のドラッグで160～600pxへ変更し、再読み込み後も幅を保持。狭い画面の一時制限が保存幅を上書きしない。境界ダブルクリックで閉じ、右端6pxへホバーすると本文を再配置せず重ねて表示。項目選択が動作し、領域外へ出ると隠れる。ホバーだけでは保存設定を書き換えない |
| SPA往復 | 会話→プロジェクト会話→開始前→文書／feed→会話。対応本文へ復帰し、目次の重複・前ページ項目の混入・状態消失がない |
| Console | reloadと必要なSPA遷移後にerrorを確認。本文nullに対するquerySelectorAll等のruntimeエラーと、サイト／他拡張のエラーを分ける |

画面サイズ、読み込み済みの本文、アカウントの機能で幅や項目数は変わります。固定pxや全件取得を普遍的な条件にせず、同じ画面・ビューポート・開閉状態でbefore／afterを比較します。

## 7. evaluate_scriptで測る

以下はツールへ渡す`function`の例です。ページ内の本文を編集しません。`pageId`は対象タブ、読み取りだけの処理には`waitForStableDom:false`を使えます。content scriptはisolated worldで動くため、ページ側から`globalThis.TOCNavigator`へアクセスできると仮定しません。

### 配置・本文構造・hit位置

```javascript
() => {
  const sidebar = document.getElementById('chatgpt-toc-sidebar');
  const toggle = document.getElementById('chatgpt-toc-toggle');
  const visible = el => !!el && !el.closest('[hidden],[aria-hidden="true"]') &&
    el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const rect = el => el ? (() => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, width: r.width };
  })() : null;
  const hits = [...document.querySelectorAll('button')]
    .filter(el => {
      const r = el.getBoundingClientRect();
      return visible(el) && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth &&
        /share|共有|close|閉じる/i.test(el.getAttribute('aria-label') || '');
    })
    .map(el => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { label: el.getAttribute('aria-label'), rect: rect(el), centerHitsButton: !!hit && el.contains(hit) };
    });
  return {
    viewport: { width: innerWidth, height: innerHeight },
    sidebarVisible: visible(sidebar), toggleVisible: visible(toggle), sidebar: rect(sidebar),
    groups: document.querySelectorAll('#chatgpt-toc-sidebar .toc-group').length,
    headings: document.querySelectorAll('#chatgpt-toc-sidebar .toc-item').length,
    sourceKinds: {
      conversation: document.querySelectorAll('[data-chatgpt-conversation-selection-target],#thread').length,
      documentCandidates: document.querySelectorAll('[data-markdown-copy-content] .ProseMirror:not([data-composer-markdown])').length,
      feedCandidates: document.querySelectorAll('article[data-message-id]:has([data-message-id])').length
    },
    main: rect(document.querySelector('main')),
    composers: [...document.querySelectorAll('[data-chatgpt-composer],#prompt-textarea')].filter(visible).map(rect),
    bodyClasses: { reserved: document.body.classList.contains('chatgpt-toc-open'), wide: document.body.classList.contains('chatgpt-toc-wide') },
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    hits
  };
}
```

`sourceKinds`は候補数で、拡張が最終採用したrootの証明ではありません。候補にhidden・preview等が混在する場合は現在のadapterの除外条件と照合します。ボタンのラベルが別名ならsnapshotで対象を選び、同じ中心座標のhit確認をします。幅拡張のクラスと目次の予約幅は独立です。

### smoothの途中位置と移動後の安定性

MCPのclick呼び出し完了後だけに位置を測ると、短いanimationを見逃します。次の例は1回の`evaluate_script`内で目次クリックとRAF観測を行います。**既に描画済みの見出し**を選び、`label`を実際の見出しへ置き換えます。

```javascript
async () => {
  const label = '検証に使う見出し';
  const item = [...document.querySelectorAll('#chatgpt-toc-sidebar .toc-item')]
    .find(el => el.textContent.trim() === label);
  const target = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .find(el => el.textContent.trim() === label && el.getClientRects().length &&
      !el.closest('#chatgpt-toc-sidebar,nav,button,[role="dialog"],[data-composer-markdown],[class*="PagePreview-"],[class*="PageThumbnail-"]'));
  if (!item || !target) return { measured: false, reason: '描画済みの目次と本文見出しを選び直す' };
  const start = target.getBoundingClientRect().top;
  const samples = [];
  const started = performance.now();
  item.click();
  await new Promise(resolve => {
    const capture = now => {
      samples.push({ ms: Math.round(now - started), top: target.getBoundingClientRect().top, connected: target.isConnected });
      if (now - started >= 4500 || !target.isConnected) resolve();
      else requestAnimationFrame(capture);
    };
    requestAnimationFrame(capture);
  });
  const end = target.getBoundingClientRect().top;
  const connectedAtEnd = target.isConnected;
  await new Promise(resolve => setTimeout(resolve, 1500));
  const delayed = target.getBoundingClientRect().top;
  return {
    start, end, delayed, connectedAtEnd, connectedDelayed: target.isConnected,
    intermediate: connectedAtEnd && samples.some(s => s.connected &&
      s.top > Math.min(start, end) + 2 && s.top < Math.max(start, end) - 2),
    stable: target.isConnected && Math.abs(delayed - end) <= 2,
    firstSamples: samples.slice(0, 8)
  };
}
```

この例は約6秒観測します。途中で本文がremountした場合は対象の再取得が必要で、`intermediate:false`だけで即時移動と断定しません。過去メッセージ追加でdotのscrollTop基準が変わる場合も、上例のような見出しの画面内位置で評価します。重複見出しがある場合は、選んだ本文group内に対象を限定してから測定してください。

新しいクリックが前のクリックに勝つこと、ユーザーのwheel／スクロールキーで古い補正を中止することも、navigation変更時に確認します。メインworldの`scrollTo`を一時差し替えてもisolated worldの呼び出しを捕捉できるとは限らないため、呼び出しログが空であることを「移動なし」の証拠にしません。

## 8. Consoleエラーと接続問題の切り分け

Consoleの例：`list_console_messages({"pageId":1,"types":["error"],"includeStackTraces":true})`。直近navigation以降を確認し、過去のエラーと比較する必要があるときだけ`includePreservedMessages:true`を使用します。必要なら`get_console_message`で詳細を確認します。

| 症状 | 次に確認すること |
| --- | --- |
| `about:blank`だけ／違うブラウザー | 9222 owner、専用profile引数、実タブ、MCPの稼働args。設定反映前とログイン前を区別する |
| `/json/version`が404 | inspect／autoConnect方式のserver表示とHTTP debug endpointを同一視しない。専用Chromeのdebug port、owner、browser-urlを確認する |
| 「私はロボットではありません」がループ | ユーザーが専用Chromeで認証する。以前はMCPが自動起動したprofileでループした。チェックを迂回したり認証を代行したりしない |
| プロファイル使用中のエラー | MCP自動起動プロファイルを複数agentが競合していないか確認。ブラウザー終了／lock削除で解決しようとせず、操作担当と接続先を揃える |
| 拡張toolがない／install失敗 | categoryExtensions、Chrome／MCPの版、展開済み絶対path、workspaceとtool制約を確認。必要ならユーザーが手動導入する |
| 修正が反映されない | extension reloadとpage reload、enabled・version・読込元を確認。版数だけでは途中のコード更新を識別できない |
| 古いUIDでクリック失敗 | 最新snapshotから取り直す。DOM更新やnavigationを挟んだUIDを使い続けない |
| `chrome:` URLへのnavigateが拒否 | 今回もツールで拒否された。ユーザーにその設定画面を開いてもらう。禁止URLをスクリプト等で迂回しない |
| resource 404 | 失敗URLとinitiatorを確認。extension runtimeの欠落、サイトのresource、外部サービスを分ける。本文内容をログへ転記しない |
| sandbox内localStorage SecurityError | scriptURL・stack・frameからsite／対象extension／他extensionを帰属させる。文字列だけでこの拡張の不具合と判断しない |

今回のlocalStorageエラーは別のジェスチャー拡張に帰属しました。この拡張は`chrome.storage.local`で開閉設定を保存し、localStorageを参照しません。ただし「コードに参照がない」だけで発生元を確定したとは扱いません。

MCPがsource／stackを返さない場合は、対象だけを一時的に外したA/B確認が許可されているときに限り実施し、必ず同じ展開元から復元・enabledを確認します。他の拡張は変更しません。A/Bは対象拡張への依存の有無を示すもので、正確な発生scriptの証明とは区別します。

それでも帰属が必要な場合は、公式CDP／Puppeteerのconsole・pageerrorやtraceの情報を、許可された接続先に限って受動観測します。追加debug接続にChromeの許可が必要ならユーザーが承認します。接続待ちは15秒程度で打ち切り、同じtimeoutを繰り返さず別の有益な観測へ進みます。接続制限を迂回せず、特定できなければ未特定として残します。

## 9. 次回依頼と結果の記録

Codexへの依頼例：

```text
docs/CHROME_DEVTOOLS_MCP.mdに沿って、この拡張を専用Chromeで確認しながら修正してください。
接続はbrowser-url http://127.0.0.1:9222です。接続先と拡張のID・enabledを最初に確認してください。
既存変更を保持し、必要な修正・対象拡張の導入／再読み込み・ページ閲覧と目次操作・テストを許可します。
会話や文書の投稿／編集／削除、認証の代行、他の拡張やChrome設定の変更は行わないでください。
版数変更・commit・push・公開は今回の範囲に含めません。
問題を直したら自動テストと実画面を分けて報告し、未確認事項も明示してください。
```

結果は次の最小情報で残します。

```text
変更: 原因、変更ファイル、期待する挙動
環境: Chrome/MCP/extension版、接続方式、viewport、対象画面の種類
自動検証: 実行コマンドと結果（fixtureと実画面を区別）
実画面: TOC生成、上下移動の途中/終点/遅延位置、遷移中の手動開閉状態維持、幅/hit、Consoleの範囲
限界: 仮想化速度が未測定、送信直後はfixtureのみ、利用できないaccount機能など
保存状態: 既存差分、版数、commit/pushの有無、対象拡張の復元状態
```

## 参照

外部仕様は2026年10月11日に確認しました。最新ツールの引数は実際のMCP定義を優先してください。

- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [接続・永続プロファイル](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/advanced-usage.md)
- [オプションと拡張categoryの条件](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md)
- [ツール定義](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md)
- [Chrome debug portのprofile制約](https://developer.chrome.com/blog/remote-debugging-port)
- [autoConnectの許可フロー](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session)
- [Codex MCP設定](https://developers.openai.com/codex/mcp)
