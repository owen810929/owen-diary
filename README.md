# Owen Diary

Owen Diary 是一個可部署到 GitHub Pages 的私人手機日記 PWA。第一版用純 HTML、CSS、JavaScript 實作，日記內容只寫入使用者自己的 Google Drive，不需要後端、資料庫或本機伺服器。

## 第一版功能

- Google Identity Services 登入與 OAuth 授權。
- 建立或重用 Google Drive 內的 `Owen Diary` 資料夾。
- 新增、讀取、編輯單日 JSON 日記。
- 標記或取消標記重要日記。
- 儲存前保留最近 3 次修改歷史。
- localStorage 自動草稿，降低手機瀏覽器重新整理或 OAuth 流程造成的文字遺失。
- 月曆顯示有日記、無日記、重要日記。
- 從既有 Google Doc 做首次初始化預覽與批次寫入。
- PWA manifest 與 service worker 基本支援。

## 第一版不做

- 多人登入、後端服務、資料庫。
- Firebase、Supabase、付費服務。
- 富文字編輯器、圖片上傳、AI 摘要。
- 一天多篇、複雜標籤系統。
- 自動同步 Google Doc。
- 指定日期範圍輸出 Google Doc。
- 真實日記範例或真實日記 JSON。

## Google Drive 資料夾結構

App 會在使用者 Google Drive 建立或重用以下資料夾：

```text
Owen Diary
├─ data
│  ├─ 2025
│  │  └─ 2025-12
│  └─ 2026
│     ├─ 2026-01
│     ├─ 2026-02
│     └─ 2026-07
├─ exports
└─ settings
```

所有日記 JSON 都應建立在 `Owen Diary/data/YYYY/YYYY-MM/` 底下。`exports` 只先建立資料夾，第一版不實作 Google Doc 匯出。

## JSON 格式

檔名：

```text
YYYY-MM-DD.json
```

內容：

```json
{
  "date": "2026-06-18",
  "sourceDateText": "6/15-6/18",
  "title": "",
  "content": "日記正文",
  "isImportant": false,
  "history": [],
  "createdAt": "2026-06-18T00:00:00+08:00",
  "updatedAt": "2026-07-01T21:00:00+08:00"
}
```

`history` 最多保留最近 3 次修改前的 `title`、`content`、`isImportant`、`updatedAt`。

## Google OAuth / API 設定

1. 到 Google Cloud Console 建立或選擇專案。
2. 啟用 Google Drive API 與 Google Docs API。
3. 建立 OAuth 2.0 Client ID，類型選 Web application。
4. 在 Authorized JavaScript origins 加入 GitHub Pages 網址，例如：

   ```text
   https://owen810929.github.io
   ```

5. 在 Authorized redirect URIs 不需要填入資料，這版使用 GIS token flow。
6. 部署後打開 Owen Diary，在「設定」貼上 Web client ID 並儲存。

使用的 OAuth scope：

```text
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/drive.metadata.readonly
https://www.googleapis.com/auth/documents.readonly
```

不要把 client secret、access token、refresh token 或任何私人密鑰放進 repo。前端只需要 Web client ID。

## GitHub Pages 部署

1. 合併 PR 後，到 repo 的 Settings。
2. 開啟 Pages。
3. Source 選 `Deploy from a branch`。
4. Branch 選 `main`，資料夾選 `/ (root)`。
5. 儲存後等待 GitHub Pages 部署完成。

## 本機預覽

可以用任一靜態伺服器預覽。若本機有 Python：

```sh
python -m http.server 8080
```

再開啟 `http://localhost:8080`。若要測 Google OAuth，本機 origin 也要加入 Google OAuth 設定。也可以使用 VS Code Live Server 或其他只提供靜態檔案的工具。

## 舊 Google Doc 初始化

初始化頁面會讀取 Google Doc，使用水平線切分段落，並把每段第一行視為日期。支援：

- `6/15`
- `6/15-6/18`
- `6/15 - 6/18`
- `6/15～6/18`
- `2025/12/21`
- `2026/6/15`
- `2026-06-15`

沒有年份時，12 月推斷為 2025，1 月以後推斷為 2026。跨日期日記會指定給最後一天，例如 `6/15-6/18` 會寫入 `2026-06-18.json`。

寫入前會顯示預覽，包含目標日期、原始日期文字、目標檔名、正文開頭、衝突與未解析段落。已有同名 JSON 時不覆蓋。

## 測試資料

`fixtures/old-doc-sample.txt` 是假資料，只用來測試解析器。它不是私人日記，不能替代真實初始化資料。

可執行：

```sh
node tests/parser.test.js
```

## 資安注意事項

- 真實日記資料只存在 Google Drive，不得 commit 到 repo。
- repo 不應出現真實 `YYYY-MM-DD.json` 日記檔。
- 不得 hardcode token、client secret 或私人密鑰。
- console 不應輸出日記正文。
- 若儲存失敗，localStorage 草稿會保留，避免內容遺失。
- OAuth scope 已避免使用完整 Drive 權限。

## 已知限制

- 第一版不做 Google Doc 匯出。
- 第一版不做 Drive Picker；需貼上既有 Google Doc URL 或 ID。
- 手機上 OAuth 視窗可能受瀏覽器設定影響。
- service worker 採簡單靜態快取，更新後若看到舊版，可重新整理一次。
- 若 Google Drive 中已有同名資料夾但目前 OAuth scope 無法寫入，請讓 app 建立自己的 `Owen Diary` 資料夾。
