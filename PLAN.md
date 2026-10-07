# 執行計劃書｜免登入 AI 生圖入口網站（教師代付 Token）

> **版本**：v1.0（2026-10-06）
> **規劃 / 審查**：Claude Code　**執行**：Antigravity（agy / Gemini）
> **參考網站**：https://st887105.github.io/20260420/（車城國小 AI 徽章拍貼機 v5.1）
> 執行者請先讀完 `AGENTS.md`（硬性規則），再照本文件第 9 節的階段順序做。每個階段做完都要停下來，交給 Claude review。

---

## 0. 一句話目標

讓學生**不用登入、看不到老師的 API 金鑰**，就能用老師付費的 AI 額度生圖。老師要能**控制什麼時候開放、每人能用幾次、每天最多花多少**，並且看得到學生輸入了什麼。

---

## 1. 參考網站拆解（要沿用的與要避開的）

我讀過參考網站的原始碼，它的架構是：

```
GitHub Pages 靜態頁 ──POST(text/plain JSON)──▶ Google Apps Script Web App ──▶ Gemini 生圖
        │                                             └─▶ 存 Google Drive ＋ 推到 GitHub
        └──(有填姓名時)── 瀏覽器直接拿使用者貼的 sk-... 金鑰 ──▶ OpenAI images/edits
```

### ✅ 沿用

| 項目 | 原因 |
|---|---|
| **前端放 GitHub Pages、後端用 GAS** | 免費、不用開伺服器，老師已經熟悉這套 |
| GAS 收 `Content-Type: text/plain` 的 POST | 這是「簡單請求」，不會觸發 CORS preflight，GAS 收得到 |
| 金鑰放在 GAS 的**指令碼屬性（Script Properties）** | 前端完全看不到 |
| 風格預設（7 種風格 prompt 對照表） | 學生好上手，見附錄 A |
| 前端先壓縮圖片再上傳 | 上傳更快，也不容易逾時 |
| 進度條＋分段提示文字 | 生圖要等 10–60 秒，小朋友需要回饋 |

### ❌ 必須避開（參考網站的問題）

| 問題 | 為什麼危險 | 本專案的做法 |
|---|---|---|
| 前端有「貼上 OpenAI API Key」欄位，還存進 `localStorage` | 共用電腦的下一位學生打開 DevTools 就能拿到老師的金鑰 | **前端不准出現任何金鑰欄位**，所有 AI 呼叫都經過 GAS |
| GAS 網址寫死在前端，**沒有任何門檻** | 網址外流後，任何人都能無限呼叫、燒掉老師的錢 | 班級通行碼＋開放時段＋每日總量上限（見第 4 節） |
| `getRecords` / `deleteRecord` **不用驗證** | 任何人都能讀取、**刪除**所有紀錄 | 讀紀錄、刪紀錄全部要管理密碼，而且在伺服器端驗證 |
| 生成圖片**推到公開的 GitHub repo** | 學生（未成年）的臉會永久公開在網路上 | **v1 完全不存圖**（不用 Drive、不推 GitHub） |
| 沒有用量上限 | 一節課就可能把月預算花光 | 伺服器端做多層限額 |

---

## 2. 系統架構

```
┌──────────────────────────┐        ┌───────────────────────────────────────────┐
│  學生端 site/index.html  │        │  Google Apps Script Web App（以老師身分執行）│
│  老師端 site/admin.html  │ ─POST─▶│  doPost → 路由 → 驗證 → 限額 → 呼叫 AI      │
│  （GitHub Pages，純靜態） │ ◀JSON─ │  金鑰：Script Properties                    │
└──────────────────────────┘        │  計數：PropertiesService + CacheService     │
                                    │  併發：LockService                          │
                                    │  紀錄：Google 試算表（老師私有）             │
                                    └──────────────┬────────────────────────────┘
                                                   ▼
                                     Gemini API（預設） / OpenAI Images API（選用）
```

**沒有資料庫、沒有建置流程、沒有 npm 執行期相依。** `package.json` 只用來跑 `node --test`。

### 2-1 目錄結構（執行者照這個建）

```
AI生圖入口網站/
├── AGENTS.md                 ← 執行者硬性規則
├── PLAN.md                   ← 本文件
├── package.json              ← 只有 "scripts": {"test": "node --test tests/*.test.js"}，不裝任何套件
├── .gitignore                ← 排除 .clasp.json、.DS_Store、node_modules、*.local.*
├── .github/workflows/pages.yml ← 把 site/ 部署到 GitHub Pages
├── site/                     ← 部署到 GitHub Pages 的內容（只有這個資料夾會公開）
│   ├── index.html            ← 學生生圖頁
│   ├── admin.html            ← 老師管理頁
│   └── assets/
│       ├── config.js         ← 只放 BACKEND_URL 與介面文字，絕不放金鑰
│       ├── api.js            ← 前端呼叫 GAS 的封裝＋mock 模式
│       ├── app.js            ← 學生頁邏輯
│       ├── admin.js          ← 老師頁邏輯
│       ├── image.js          ← 圖片壓縮、下載、浮水印
│       └── style.css
├── gas/                      ← 貼到 Apps Script 專案的程式碼
│   ├── appsscript.json
│   ├── Code.gs               ← doGet / doPost / 路由 / 統一回應格式
│   ├── Logic.gs              ← ★純函式，不准碰任何 GAS 全域物件（可用 Node 測試）
│   ├── Providers.gs          ← Gemini / OpenAI 的 request 組裝與 response 解析（純函式）＋ fetch 包裝
│   ├── Store.gs              ← Properties / Cache / Lock / Sheet 的薄包裝
│   ├── Admin.gs              ← 管理功能
│   └── Setup.gs              ← setupOnce()、setAdminPassword()、installTriggers()、cleanup()
├── tests/
│   ├── load-gas.js           ← 用 node:vm 載入 Logic.gs / Providers.gs
│   ├── logic.test.js
│   ├── providers.test.js
│   └── fixtures/             ← Gemini / OpenAI 的範例回應 JSON（成功、安全阻擋、錯誤）
└── 說明/
    ├── 部署步驟.md           ← 給老師一步一步照做
    ├── 教師使用手冊.md
    └── 測試報告.md           ← 執行者每階段結束時更新
```

---

## 3. API 規格（前後端的合約，不可自行更動）

### 3-1 共通規則

- 所有請求都打同一個 GAS 網址。
- **讀取類**用 `GET ?action=xxx`；**寫入／生成類**用 `POST`，body 是 JSON 字串，header `Content-Type: text/plain;charset=utf-8`。
- GAS 無法設定 HTTP 狀態碼，所以**一律回 200**，用 body 判斷成功或失敗：

```json
// 成功
{ "ok": true, "data": { ... } }
// 失敗
{ "ok": false, "code": "DAILY_LIMIT", "message": "今天全班的額度用完了，明天再來喔！" }
```

- `message` 一律是**給國小學生看的繁體中文**，不准把供應商的原始錯誤訊息（可能含內部資訊）直接傳給前端；原始錯誤只寫進紀錄表。

### 3-2 學生端 action

| action | 方法 | 請求欄位 | 回應 `data` |
|---|---|---|---|
| `status` | GET | `classCode`（選填）、`deviceId` | `{ open, openUntil, needCode, codeOk, styles:[{id,label,emoji}], remainingToday, deviceRemaining, cooldownSec, mode:{text:true, photo:true} }` |
| `generate` | POST | `classCode`, `deviceId`, `mode`(`text`/`photo`), `style`, `prompt`, `image`(base64，photo 模式才有), `imageMime` | `{ image(base64), mime, deviceRemaining, remainingToday, requestId }` |

### 3-3 老師端 action（全部 POST，全部要 `adminPassword`）

| action | 用途 |
|---|---|
| `admin.login` | 驗證密碼，回傳目前所有設定與今日統計 |
| `admin.setOpen` | `{ open:boolean, minutes?:number }` 開放／關閉；有 `minutes` 就設定到期自動關閉 |
| `admin.setConfig` | 改 `classCode`、`dailyLimitGlobal`、`dailyLimitPerDevice`、`cooldownSec`、`maxConcurrent`、`provider`、`allowPhoto` |
| `admin.newClassCode` | 伺服器隨機產生 4 碼數字通行碼並回傳 |
| `admin.logs` | `{ limit≤100 }` 讀最近 N 筆紀錄 |
| `admin.blockDevice` / `admin.unblockDevice` | 封鎖／解除某裝置 |
| `admin.stats` | 今日：成功數、失敗數、被擋數、估計花費（單價取 `COST_PER_IMAGE_USD`，未設定就回 `null`） |

> **金鑰不能透過網頁設定或讀取。** 金鑰只能由老師在 Apps Script 編輯器的「專案設定 → 指令碼屬性」手動填入。`admin.login` 回傳的設定裡**不得包含任何金鑰**，只回 `hasGeminiKey: true/false` 這種布林值。

### 3-4 錯誤碼（前端要每一個都有對應的友善畫面）

| code | 時機 | 給學生的訊息（範例） |
|---|---|---|
| `CLOSED` | 老師沒開放／時段已過 | 老師還沒開放喔，等老師說開始再試！ |
| `BAD_CODE` | 通行碼錯誤 | 班級通行碼不對，再問一下老師～ |
| `COOLDOWN` | 距上次生成不到 N 秒 | 休息一下，{n} 秒後再畫下一張 |
| `DEVICE_LIMIT` | 這台裝置今天用完 | 你今天的 {n} 次都用完了，明天再來！ |
| `DAILY_LIMIT` | 全班總量用完 | 今天全班的額度用完了 |
| `BUSY` | 同時生成的人太多 | 現在排隊的人很多，等幾秒自動幫你重試… |
| `BLOCKED_PROMPT` | 本地關鍵字過濾擋下 | 這個描述不適合喔，換個說法試試看 |
| `SAFETY_BLOCKED` | AI 供應商的安全機制擋下 | AI 覺得這張圖不太適合，換個描述吧 |
| `DEVICE_BLOCKED` | 被老師封鎖 | 請找老師幫忙 |
| `BAD_REQUEST` | 欄位缺少、太長、圖片太大 | 好像少了什麼，檢查一下再送出 |
| `PROVIDER_ERROR` | 供應商錯誤、逾時、額度不足 | AI 暫時忙不過來，稍後再試 |
| `ADMIN_AUTH` | 管理密碼錯誤 | （老師端）密碼錯誤 |
| `ADMIN_LOCKED` | 密碼錯太多次 | （老師端）錯誤次數過多，請 10 分鐘後再試 |

---

## 4. 安全與防濫用設計（★審查重點）

「免登入」代表 GAS 網址等於公開。真正的防線**只能在伺服器端**，前端的任何檢查都只是使用者體驗。

### 4-1 多層防線

| 層 | 機制 | 擋得住什麼 | 擋不住什麼（要老實寫進手冊） |
|---|---|---|---|
| 1 | **服務開關＋自動到期**（`SERVICE_OPEN`、`OPEN_UNTIL`） | 下課後網址外流 | 上課時段內的濫用 |
| 2 | **班級通行碼**（4 碼，每節課可換） | 不在教室的人 | 學生把碼傳出去 |
| 3 | **每日全班總上限**（`DAILY_LIMIT_GLOBAL`，預設 200） | **花費失控（真正的保險絲）** | — |
| 4 | **每台裝置上限**（`DAILY_LIMIT_PER_DEVICE`，預設 10） | 單一學生狂按 | 開無痕視窗換 deviceId（所以第 3 層才是真保險） |
| 5 | **冷卻時間**（`COOLDOWN_SEC`，預設 20） | 連點 | — |
| 6 | **同時生成上限**（`MAX_CONCURRENT`，預設 8） | 撞到 GAS 同時執行數上限 | — |
| 7 | **內容過濾**：本地關鍵字＋兒童安全前綴＋供應商安全設定 | 大部分不當內容 | 換句話說的繞過（靠紀錄表讓老師事後看） |
| 8 | **供應商端預算**（老師在 Google Cloud / OpenAI 後台設定） | 程式有 bug 時的最後一道 | Google Cloud 的預算**只會寄信提醒、不會自動停**，要在手冊寫清楚 |

### 4-2 限額的正確實作方式（容易寫錯）

```
generate 流程：
1. 驗證欄位（長度、mode、style 白名單、圖片大小 ≤ 4 MB base64）→ 失敗回 BAD_REQUEST
2. 本地關鍵字過濾 → BLOCKED_PROMPT（這一步不扣額度）
3. ── 取得 LockService.getScriptLock()，tryLock(10000)，拿不到回 BUSY ──
4.   讀取設定與計數 → 呼叫 Logic.decideQuota(state, config, now) 這個純函式
5.   允許 → 「先預扣」：全班計數 +1、裝置計數 +1、寫入冷卻時間、in-flight +1
6. ── 釋放鎖 ──                         ← ★呼叫 AI 期間絕對不能持有鎖
7. 呼叫 AI（UrlFetchApp，muteHttpExceptions:true）
8. 成功 → 回傳圖片
   供應商錯誤／逾時 → 再拿鎖「退還」剛才預扣的額度
   安全阻擋 → 不退還（避免學生一直試不當內容）
9. finally：拿鎖把 in-flight -1；寫一筆紀錄到試算表（寫紀錄失敗不能影響回應）
```

- **日期 key 一律用台北時區**：`Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd')`。
- 全班每日計數存 `PropertiesService`（key 帶日期），每天由觸發器清掉 3 天前的 key。
- 裝置計數、冷卻時間存 `CacheService`（最長 6 小時 TTL，等於「每節課」，可接受，手冊要註明）。
- in-flight 要存「時間戳記清單」而不是單純數字，超過 150 秒的項目視為過期自動移除，避免某次執行當掉後計數永遠卡住。
- `decideQuota` 必須是**純函式**（輸入 state/config/now，輸出 `{allowed, code, nextState}`），這樣才能用 Node 測。

### 4-3 管理密碼

- 執行 `Setup.gs` 的 `setAdminPassword('老師自訂密碼')`，存的是 **SHA-256 雜湊＋隨機 salt**，不存明碼。
- 比對用固定時間比較（逐字元 XOR 累加），不要用 `===` 提早結束。
- 連續錯 5 次 → 鎖 10 分鐘（`ADMIN_LOCKED`），計數存 CacheService。
- 前端老師頁把密碼存在 `sessionStorage`（關分頁就消失），**不准存 localStorage**。

### 4-4 兒童內容安全

- 所有 prompt 在送出前，由**後端**在前面加上固定的安全前綴（附錄 B）。前端看不到也改不掉。
- 本地關鍵字黑名單（中英文，放在 `Logic.gs` 的常數）：暴力、血腥、色情、自殘、毒品、武器等類別，各類 10–20 個詞，比對前先轉小寫、去空白、全形轉半形。
- Gemini：`safetySettings` 四個類別都設 `BLOCK_LOW_AND_ABOVE`。
- OpenAI：文字模式（generations）加 `moderation: "auto"`；edits 端點沒有這個參數，不要送（2026-10-07 已查證）。
- prompt 長度上限 300 字元。

### 4-5 個資與學生肖像

- **v1 不存任何圖片**：照片只在記憶體裡轉一手就丟。程式裡不准出現 `DriveApp`（2026-10-07 review 決定移除存圖功能：`drive.file` 權限開不到老師自建的資料夾，清理程式也有誤刪老師檔案的風險）。
- 紀錄表**只記**：時間、deviceId 前 8 碼（裝置短碼）、mode、style、prompt 文字、結果代碼、耗時、供應商、錯誤細節（供應商原始錯誤，截斷到 300 字元）。**不記圖片、不記 IP**（GAS 本來就拿不到 IP）。
- 寫進試算表的所有字串，若以 `=` `+` `-` `@` 開頭，前面要加上單引號 `'`，防止公式注入。
- **嚴禁**任何推送到 GitHub 或公開分享的程式碼。
- 手冊要提醒：照片模式涉及學生肖像，建議先取得家長同意，或課堂上只用文字模式。

---

## 5. 後端實作細節（`gas/`）

### 5-1 指令碼屬性一覽

| Key | 預設 | 說明 |
|---|---|---|
| `PROVIDER` | `gemini` | `gemini` 或 `openai` |
| `GEMINI_API_KEY` | （老師手動填） | |
| `GEMINI_MODEL` | `gemini-3.1-flash-image` | 2026-10-07 已查證為 Stable。呼叫方式維持 `generateContent`（官方標為 legacy 但仍完整支援）|
| `OPENAI_API_KEY` | （選填） | |
| `OPENAI_MODEL` | `gpt-image-1` | 2026-10-07 已查證在允許清單中；參考網站用的是 `gpt-image-2`。**GPT image 模型不支援 `response_format`，不要送** |
| `OPENAI_QUALITY` | `low` | 省錢 |
| `ADMIN_PASSWORD_HASH` / `ADMIN_PASSWORD_SALT` | 由 `setAdminPassword()` 寫入 | |
| `CLASS_CODE` | 空字串 | 空字串＝不需要通行碼 |
| `SERVICE_OPEN` | `false` | **預設關閉** |
| `OPEN_UNTIL` | 空 | ISO 時間；過了自動視為關閉 |
| `DAILY_LIMIT_GLOBAL` | `200` | |
| `DAILY_LIMIT_PER_DEVICE` | `10` | |
| `COOLDOWN_SEC` | `20` | |
| `MAX_CONCURRENT` | `8` | |
| `ALLOW_PHOTO` | `true` | 是否開放照片模式 |
| `LOG_SHEET_ID` | 由 `setupOnce()` 自動建立 | |
| `COST_PER_IMAGE_USD` | 空 | 老師依自己的帳單填入單價；空值時後台顯示「未設定單價」，不要寫死估計值 |
| `BLOCKED_DEVICES` | `[]` | JSON 陣列，存的是**裝置短碼（前 8 碼）**，比對時用 `deviceId.substring(0, 8)` |

設定值讀取要集中在 `Store.getConfig()`，有預設值與型別轉換（字串 → 數字／布林），不要散落在各檔案。

### 5-2 Gemini 呼叫

- 端點：`https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent`
- 金鑰放 header `x-goog-api-key`，**不要放在網址參數**（會出現在錯誤紀錄裡）。
- body：`contents[0].parts` = `[{text: 安全前綴 + 風格 prompt + 學生描述}]`，照片模式再加 `{inlineData:{mimeType, data}}`；`generationConfig.responseModalities: ["TEXT","IMAGE"]`；加上 4-4 的 `safetySettings`。
- 解析：在 `candidates[0].content.parts` 中找第一個有 `inlineData` 的 part。找不到時，若 `promptFeedback.blockReason` 或 `finishReason` 是安全相關 → `SAFETY_BLOCKED`，其他 → `PROVIDER_ERROR`。
- **request 組裝與 response 解析必須是純函式**（`buildGeminiRequest()`、`parseGeminiResponse()`），放在 `Providers.gs`，實際 `UrlFetchApp.fetch` 包在另一個小函式裡。

### 5-3 OpenAI 呼叫（選用）

- 文字模式：`POST /v1/images/generations`（JSON）
- 照片模式：`POST /v1/images/edits`（multipart；GAS 裡 payload 給物件、值給 `Blob`，UrlFetchApp 會自動組 multipart）
- `size: 1024x1024`、`quality` 用設定值、`n: 1`；回應取 `data[0].b64_json`。
- 錯誤分類：`insufficient_quota`、`invalid_api_key`、`rate_limit` → `PROVIDER_ERROR`（原因寫進紀錄）；`moderation_blocked` / content policy → `SAFETY_BLOCKED`。

### 5-4 其他

- `doGet` / `doPost` 最外層要 try/catch，任何未預期錯誤都回 `{ok:false, code:"PROVIDER_ERROR"}`，並把 stack 寫進紀錄表，**不回傳給前端**。
- `appsscript.json`：`"timeZone": "Asia/Taipei"`，`webapp.executeAs: "USER_DEPLOYING"`，`webapp.access: "ANYONE_ANONYMOUS"`，並列出需要的 `oauthScopes`（external_request、spreadsheets、script.scriptapp）。不要要求不需要的權限，v1 不宣告任何 drive scope。
- `Setup.gs`：
  - `setupOnce()`：寫入所有預設屬性（已存在的不覆蓋）、建立紀錄試算表、`installTriggers()`。
  - `installTriggers()`：每日凌晨 3 點跑 `cleanup()`（清舊計數 key）。重複執行不能產生重複觸發器。
  - `setAdminPassword(pw)`：長度至少 8。
  - `selfTest()`：不花錢的自我檢查（屬性齊不齊、試算表能不能寫），讓老師部署後先跑一次。

---

## 6. 前端實作細節（`site/`）

### 6-1 共通要求

- **純 HTML/CSS/JS，不用框架、不用建置、不載入任何 CDN 腳本**（學校網路常擋 CDN；參考網站用的 Font Awesome CDN 改成 emoji 或內嵌 SVG）。Google Fonts 可以用，但要有系統字體備援。
- 語言 `zh-Hant-TW`。字體：`"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif`。
- **目標裝置**：iPad Safari、Chromebook Chrome、教室 Windows 電腦、手機。最小寬度 360px 不可水平捲動。
- 按鈕觸控區 ≥ 48px，內文字級 ≥ 16px（受眾是國小學生）。
- 淺色／深色：CSS 變數定義在 `:root`，用 `@media (prefers-color-scheme: dark)` 切換。
- 無障礙：所有按鈕有可讀文字、圖片有 `alt`、可用鍵盤操作、錯誤訊息用 `role="alert"`。
- `config.js` 只有：`BACKEND_URL`、站名、學校名。**BACKEND_URL 為空字串時自動進入 mock 模式。**

### 6-2 Mock 模式（不花錢就能測完整個介面）

- 網址加 `?mock=1`，或 `BACKEND_URL` 為空 → `api.js` 不發任何網路請求，改用假資料：
  - `status` 回傳開放中、剩 10 次。
  - `generate` 等 2 秒後，用 canvas 畫一張「風格名＋提示詞文字＋漸層背景」的假圖回傳。
- `?mock=DAILY_LIMIT`（或任何錯誤碼）→ `generate` 固定回傳該錯誤，用來檢查每個錯誤畫面。
- 畫面上要有明顯的「🧪 測試模式」標籤，避免老師誤以為已經接上 AI。

### 6-3 學生頁 `index.html` 流程

```
① 頁首：站名＋狀態燈（🟢 開放中，到 HH:MM／🔴 尚未開放）＋今日剩餘次數
② 若需要通行碼且尚未驗證 → 只顯示「輸入班級通行碼」大輸入框（數字鍵盤 inputmode="numeric"）
   驗證成功後存 localStorage（下次不用再輸入）；通行碼被老師更換後 status 回 codeOk:false → 再請學生輸入
③ 選模式：「✏️ 用文字畫圖」｜「📷 把照片變風格」（ALLOW_PHOTO=false 時隱藏照片模式）
④ 照片模式：拍照 / 從相簿選（<input type=file accept="image/*" capture="environment">）
   → 前端壓縮成長邊 1024px 的 JPEG（品質 0.85）→ 預覽
⑤ 選風格：7 張大卡片（附錄 A），一次選一個
⑥ 描述小幫手（AI 素養設計）：
   四個小欄位「主角是誰？」「在做什麼？」「在哪裡？」「感覺／顏色？」
   → 自動組成一句完整描述，顯示在下方「AI 會收到的描述」框（學生也可以直接改這個框）
   → 旁邊有 3 個「給我靈感」範例按鈕
   → 字數計數器（上限 300）
⑦ 「開始畫圖」大按鈕 → 進度條＋輪播提示文字（例如「AI 正在想像你的畫面…」「AI 在上色…」）
   按下後按鈕停用直到結束；BUSY 時自動等 5 秒重試，最多 3 次
⑧ 結果：大圖＋「下載」＋「再畫一張」＋剩餘次數
   下載的圖片右下角用 canvas 加上小字「AI 生成」浮水印（AI 素養：標示 AI 產物）
⑨ 「這節課的作品」：本次開啟網頁後的作品縮圖列（只存在記憶體，重新整理就消失，避免共用電腦殘留）
```

- `deviceId`：第一次開啟時 `crypto.randomUUID()` 存 localStorage。
- 冷卻倒數：收到 `COOLDOWN` 或生成成功後，按鈕顯示倒數秒數。
- 頁尾一行小字：「這個網站由老師提供 AI 額度，請好好使用 🙏　你輸入的描述老師看得到。」（讓學生知道有紀錄，本身就是防濫用＋數位公民教育。）

### 6-4 老師頁 `admin.html`

```
① 登入：管理密碼（存 sessionStorage）
② 大開關：[開放 30 分鐘] [開放 50 分鐘] [開放到我關閉] [立即關閉]，顯示剩餘時間
③ 班級通行碼：大字顯示（投影用）＋「產生新碼」＋「不需要通行碼」切換
④ 今日用量：成功 / 上限 進度條、失敗數、被擋數、估計花費
⑤ 限額設定：全班每日上限、每台上限、冷卻秒數、同時生成上限、是否開放照片模式、供應商切換
   → 顯示「金鑰狀態：Gemini ✅ 已設定 / OpenAI ❌ 未設定」（只顯示有沒有，不顯示內容）
⑥ 最近紀錄表：時間、裝置短碼、模式、風格、描述、結果；每列有「封鎖此裝置」
⑦ 每 15 秒自動刷新 ④ 和 ⑥（分頁不在前景時暫停）
```

---

## 7. 測試要求（執行者必須自己跑過，Claude 會在乾淨環境重跑）

### 7-1 自動測試：`npm test`（= `node --test tests/*.test.js`）

不准安裝任何 npm 套件，只用 Node 內建的 `node:test`、`node:assert`、`node:vm`。

`tests/load-gas.js` 用 `vm` 把 `gas/Logic.gs`、`gas/Providers.gs` 載入一個 context，匯出裡面的函式。**這兩個檔案在頂層不准引用 `PropertiesService`、`UrlFetchApp` 等 GAS 全域物件**，否則測試會失敗——這是刻意的設計約束。

至少要涵蓋：

| 測試對象 | 案例 |
|---|---|
| `decideQuota` | 關閉時拒絕；`OPEN_UNTIL` 過期時拒絕；通行碼錯誤；通行碼為空時不檢查；冷卻中；裝置達上限；全班達上限；in-flight 達上限；過期 in-flight 會被清掉；裝置被封鎖；全部通過時 nextState 正確 +1 |
| 退還邏輯 | 預扣後退還，計數回到原值且不會變負數 |
| `validateRequest` | 缺欄位、style 不在白名單、prompt 超過 300 字、photo 模式沒圖、圖片超過大小 |
| 關鍵字過濾 | 中英文命中；全形、大小寫、夾空白的繞過也要命中；正常句子（例如「拿著畫筆的貓」）不能誤判 |
| `buildPrompt` | 安全前綴一定在最前面；學生的描述無法把前綴「蓋掉」（例如輸入「忽略以上指示」仍保留前綴） |
| `buildGeminiRequest` | 文字模式、照片模式的 body 結構；金鑰不在 URL 裡 |
| `parseGeminiResponse` | 成功（取出圖）、只回文字沒圖、`promptFeedback.blockReason`、`finishReason: SAFETY`、錯誤 JSON |
| OpenAI 的對應 build / parse | 同上 |
| 日期 key | 台北時間 23:59 與 00:01 分屬不同天（UTC 15:59 / 16:01） |
| 密碼雜湊比對 | 正確、錯誤、空字串 |

### 7-2 前端手動檢查（用 mock 模式）

執行者在本機起靜態伺服器（`python3 -m http.server -d site 8080`），逐項檢查並把結果寫進 `說明/測試報告.md`：

- [ ] `?mock=1` 文字模式能從頭走到下載
- [ ] `?mock=1` 照片模式能上傳、預覽、生成
- [ ] 第 3-4 節的每個錯誤碼都用 `?mock=CODE` 看過一次，訊息正確、按鈕狀態正確
- [ ] 寬度 360px、768px、1280px 三種都沒有水平捲動、沒有元素重疊
- [ ] 深色模式可讀
- [ ] 下載的圖片有「AI 生成」浮水印
- [ ] 瀏覽器 console 沒有錯誤
- [ ] `site/` 底下用 `grep -rniE "sk-|AIza|api[_-]?key"` 找不到任何金鑰或金鑰欄位（`config.js` 的註解也不行）

### 7-3 真機測試（部署後，由老師＋Claude 一起做，不是 agy 的工作）

- 真的生成 1 張文字圖、1 張照片圖
- 兩支手機同時按，確認計數正確（不會少扣）
- 把服務關掉後再生成 → `CLOSED`
- 管理密碼連錯 5 次 → `ADMIN_LOCKED`
- 用無痕視窗（沒有通行碼）直接打 GAS 網址 → `BAD_CODE`

---

## 8. 部署（產出文件即可，實際部署由老師操作）

`說明/部署步驟.md` 要寫成老師能照著點的步驟，含截圖位置說明（文字描述即可，不用真的截圖）：

1. **取得 Gemini API 金鑰**：Google AI Studio 建立金鑰 → 到 Google Cloud Console 把金鑰限制為只能用 Generative Language API → 確認專案已啟用計費（生圖模型可能不在免費層，**請執行者查證並寫出查證日期**）→ 設定 Cloud Billing 預算提醒（並明寫：**這只會寄信，不會自動停用**）。
2. **建立 Apps Script 專案**：新建專案 → 依序建立 `gas/` 的每個檔案並貼上 → 專案設定勾選「顯示 appsscript.json」並貼上。
3. **填金鑰**：專案設定 → 指令碼屬性 → 新增 `GEMINI_API_KEY`。
4. **初始化**：編輯器選 `setupOnce` 執行 → 授權 → 再到 `Setup.gs` 底部改好密碼後執行 `setAdminPassword` → 執行 `selfTest`。**執行完把程式碼裡的密碼字串刪掉**。
5. **部署**：部署 → 新增部署作業 → 網頁應用程式 → 執行身分「我」、存取權「所有人」→ 複製網址。
   - ⚠️ 若老師用的是**學校 Google Workspace 帳號**，網域管理員可能禁止「所有人」存取，請改用個人 Gmail 帳號建立專案。
   - ⚠️ 之後改程式要用「管理部署作業 → 編輯 → 新版本」，**網址才不會變**。
6. **前端**：把網址貼進 `site/assets/config.js` 的 `BACKEND_URL` → 推到 GitHub → 啟用 Pages（Source 選 GitHub Actions，用 `.github/workflows/pages.yml`）。
7. **驗收**：開 `admin.html` 登入 → 開放 30 分鐘 → 開 `index.html` 生成一張。

`說明/教師使用手冊.md`：上課前 3 步驟（開放、投影通行碼、提醒規則）、下課 1 步驟（關閉）、怎麼看紀錄、怎麼封鎖、怎麼調額度、怎麼換金鑰、**哪些情況擋不住**（4-1 表格右欄）、費用估算方式、個資提醒。

---

## 9. 分階段工作清單（每階段結束都停下來交給 Claude review）

### 階段 1：後端核心＋自動測試
- [ ] 建立目錄結構、`package.json`、`.gitignore`、`git init`
- [ ] `Logic.gs`：`validateRequest`、`normalizeText`、`checkBlocked`、`buildPrompt`、`decideQuota`、`refundQuota`、`dateKeyTaipei`、`hashPassword`、`safeEqual`、風格表、錯誤訊息表
- [ ] `Providers.gs`：Gemini / OpenAI 的 build / parse 純函式＋fetch 包裝
- [ ] `tests/` 全部案例（7-1 表格）
- [ ] **交付條件**：`npm test` 全綠；`Logic.gs`、`Providers.gs` 頂層沒有 GAS 全域物件
- [ ] **查證**：Gemini 與 OpenAI 目前的生圖模型 ID、OpenAI moderation 參數名稱，把來源網址與查證日期寫進 `說明/測試報告.md`

### 階段 2：後端整合
- [ ] `Store.gs`、`Code.gs`、`Admin.gs`、`Setup.gs`、`appsscript.json`
- [ ] 照 4-2 的流程實作 `generate`（鎖的範圍、預扣、退還、finally）
- [ ] **交付條件**：`npm test` 仍全綠；在測試報告中列出每個 action 的函式位置；說明鎖在哪一行取得、哪一行釋放

### 階段 3：前端
- [ ] `site/` 全部檔案，含 mock 模式
- [ ] **交付條件**：7-2 清單全部打勾並寫進測試報告；附上 360px 與 1280px 的學生頁截圖（存在 `說明/screenshots/`，這個資料夾不會被部署）

### 階段 4：文件＋部署設定
- [ ] `說明/部署步驟.md`、`說明/教師使用手冊.md`
- [ ] `.github/workflows/pages.yml`（只上傳 `site/`）
- [ ] **交付條件**：照部署步驟從頭讀一遍沒有跳步；`grep` 全專案找不到真實金鑰

### 階段 5（老師＋Claude，不委派）
- [ ] 實際部署 GAS 與 GitHub Pages
- [ ] 7-3 真機測試
- [ ] 一節課試用後依紀錄調整額度

### 之後可以加的（本次不做）
- 參考網站的**徽章排版列印**（形狀、尺寸、A4 預覽）——可做為獨立頁 `site/badge.html`，讀取學生剛下載的圖片
- 老師在後台挑選作品組成「班級畫廊」（需另外處理肖像授權）
- 同一個後端加入其他 AI 工具（例如 AI 聊天），`action` 路由已預留擴充空間

---

## 10. Claude 的 review 清單（執行者可以先自我檢查）

1. `site/` 裡沒有任何金鑰、金鑰輸入欄、或直接呼叫 `api.openai.com` / `generativelanguage.googleapis.com` 的程式碼
2. 呼叫 AI 期間沒有持有 `LockService` 的鎖
3. 計數的預扣與退還都在鎖內，且失敗路徑（逾時、例外）也會退還並減少 in-flight
4. 日期 key 用台北時區
5. 所有 admin action 在伺服器端驗證密碼，且有錯誤次數鎖定
6. `admin.login` 等回應中不含金鑰
7. 回給前端的 `message` 不含供應商原始錯誤、stack trace、內部路徑
8. 安全前綴由後端加上，前端無法繞過
9. 沒有任何把圖片推到 GitHub 或設為公開分享的程式碼
10. `npm test` 在乾淨的 clone 上全綠，而且測試沒有被改成「永遠通過」（我會抽查斷言內容，並故意改壞一個函式確認測試會失敗）
11. mock 模式下每個錯誤畫面都正常
12. 文件裡對「擋不住什麼」「預算提醒不會自動停」的描述誠實

---

## 附錄 A：風格表（沿用參考網站，改寫成同時適用文字與照片模式）

| id | 標籤 | 文字模式 prompt | 照片模式 prompt |
|---|---|---|---|
| `pixar` | 🎬 3D 動畫風 | A high-quality 3D animated movie style illustration, cute, cinematic lighting, vibrant colors | Transform this photo into a high-quality 3D animated movie style character, cute, cinematic lighting, vibrant colors, round expressive eyes |
| `watercolor` | 🎨 水彩風 | A beautiful watercolor painting, soft edges, delicate washes of color, dreamy | Transform this photo into a watercolor portrait, soft edges, delicate color washes, dreamy |
| `cyberpunk` | 🌆 未來科技風 | A futuristic neon city style illustration, glowing lights, high tech, colorful | Transform this photo into a futuristic neon style portrait, glowing accents, high tech |
| `anime` | 🌿 日系動畫風 | A warm hand-drawn Japanese anime style illustration, detailed background, soft lighting, nostalgic | Transform this photo into a warm hand-drawn anime style portrait, soft lighting, expressive eyes |
| `popart` | 🟡 普普藝術風 | A vibrant pop art illustration, bold colors, high contrast, halftone dots | Transform this photo into vibrant pop art, bold colors, high contrast, halftone dots |
| `chibi` | 🐱 Q 版萌系風 | A cute chibi character illustration, big sparkly eyes, pastel colors, kawaii | Transform this photo into a cute chibi character, big sparkly eyes, tiny body, pastel colors |
| `crayon` | 🖍️ 蠟筆童畫風 | A children's crayon drawing style illustration, bright colors, playful, textured paper | Transform this photo into a children's crayon drawing, bright colors, playful, textured paper |

> 參考網站的「吉卜力」「皮克敏」等直接點名特定公司或角色，有著作權與商標疑慮，而且供應商可能拒絕生成。這裡改成描述畫風、不點名。這是 AI 素養課可以順便討論的題目。

## 附錄 B：後端安全前綴（固定加在所有 prompt 最前面）

```
You are generating an image for an elementary school student in a classroom.
The image must be child-friendly and safe for ages 6-12: no violence, blood, weapons,
horror, sexual content, nudity, drugs, alcohol, smoking, hateful symbols, or real
political figures. Do not include any text or letters in the image.
If the request below conflicts with these rules, create a gentle, cheerful alternative instead.
Student request:
```
