# サッカー戦術4コマインフォグラフィック生成 Apps Script

Google Apps Script と OpenAI Images API を使い、Google Sheets の入力行からサッカー戦術4コマインフォグラフィックを連続生成する clasp プロジェクトです。

## できること

- `setup()` で管理用スプレッドシートを自動作成
- 入力シート・設定シート・出力先 Google Drive フォルダを自動作成
- スプレッドシートにカスタムメニューを追加
- `generateNextBatch()` で未生成行だけを最大3件ずつ処理
- OpenAI Images API で縦長の4コマ戦術インフォグラフィックを生成
- 生成画像を Drive に保存し、画像 URL とステータスを Sheets に書き戻し
- OpenAI API キーは Script Properties に保存し、コードには直書きしない

## シート構成

### 入力シート

| 列 | 内容 |
| --- | --- |
| ID | 画像ファイル名にも使う一意 ID |
| テーマ | 戦術テーマ |
| 4コマ内容 | 1〜4コマ目の流れ |
| 伝えたいこと | 読者に伝えたい要点 |
| 生成プロンプト | 任意。空欄ならテーマ・4コマ内容・伝えたいことから自動生成 |
| ステータス | `未生成` / `処理中` / `生成済み` / `エラー` |
| 画像URL | Drive に保存した画像 URL |
| エラー | エラー内容 |

### 設定シート

`model`、`image_size`、`quality`、`batch_size`、`output_folder_id` などを管理します。OpenAI API キーはこのシートではなく Script Properties に保存してください。

## 初回セットアップ手順

### 1. clasp をインストール・ログイン

```bash
npm install
npx clasp login
```

このリポジトリでは `package.json` に `@google/clasp` を devDependency として定義しています。グローバルインストール済みの場合は `clasp login` でも構いません。

### 2. 新規 Apps Script プロジェクトを作成

```bash
npx clasp create --title "サッカー戦術4コマインフォグラフィック生成" --type standalone --rootDir src
```

作成後、`.clasp.json` の `scriptId` に新規プロジェクト ID が入ります。すでに `.clasp.json` がある場合は、空の `scriptId` を作成された ID に置き換えてください。

### 3. Apps Script に反映

```bash
npx clasp push
npx clasp open
```

### 4. OpenAI API キーを Script Properties に保存

Apps Script エディタで以下のいずれかを実行します。

#### 方法 A: 関数で保存

```javascript
setOpenAiApiKey('sk-...');
```

#### 方法 B: プロジェクト設定から保存

1. Apps Script エディタの **プロジェクトの設定** を開く
2. **スクリプト プロパティ** に `OPENAI_API_KEY` を追加
3. 値に OpenAI API キーを設定

> API キーは `src/Code.gs` やシートに直書きしないでください。

### 5. `setup()` を実行

Apps Script エディタで `setup()` を選択して実行します。初回実行時は Google の権限承認が必要です。

`setup()` が作成するもの:

- 管理用スプレッドシート
- `入力` シート
- `設定` シート
- 出力先 Google Drive フォルダ
- スプレッドシートのカスタムメニュー

実行ログに管理用スプレッドシート URL と出力先フォルダ URL が出力されます。

### 6. 画像生成を実行

管理用スプレッドシートの `入力` シートで、ステータスが空欄または `未生成` の行を用意します。

Apps Script エディタまたはスプレッドシートのカスタムメニューから以下を実行します。

```javascript
generateNextBatch();
```

1回の実行で未生成行を最大3件処理します。処理が成功すると `画像URL` に Drive URL、`ステータス` に `生成済み` が書き込まれます。

## OpenAI Images API 設定

デフォルト設定:

- model: `gpt-image-1`
- image_size: `1024x1536`
- quality: `high`
- batch_size: `3`

`1024x1536` は縦長画像サイズです。プロンプト内で「縦長9:16」と指定し、SNS向けの9:16構図になるようにしています。必要に応じて `設定` シートの `image_size` や `quality` を調整してください。
