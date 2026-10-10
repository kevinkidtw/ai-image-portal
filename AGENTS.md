# AGENTS.md — 執行者硬性規則

完整規格在 `PLAN.md`。動工前先讀完。以下規則**沒有例外**：

1. **前端（`site/`）絕不出現 API 金鑰、金鑰輸入欄，也不直接呼叫 AI 供應商的 API。** 所有 AI 呼叫都經過 `gas/` 後端。
2. **不要修改 `PLAN.md` 第 3 節的 API 合約**（action 名稱、欄位、錯誤碼）。覺得需要改，就寫進 `說明/測試報告.md` 的「待討論」，不要自己改。
3. `gas/Logic.gs` 與 `gas/Providers.gs` 的**頂層不准引用任何 GAS 全域物件**（`PropertiesService`、`UrlFetchApp`、`CacheService`、`LockService`、`SpreadsheetApp`、`DriveApp`、`Utilities`、`ContentService`）。需要用到的函式由呼叫端以參數傳入。
4. **呼叫 AI 期間不准持有 `LockService` 的鎖。**
5. **不准安裝任何 npm 套件。** 測試只用 Node 內建的 `node:test`、`node:assert`、`node:vm`。
6. **不准為了讓測試通過而修改測試的斷言、跳過測試、或 mock 掉被測的函式本身。** 測試失敗就修程式。`tests/integration.test.js`、`tests/frontend-static.test.js`、`tests/levels.test.js` 與 `site/assets/levels.js` 由 Claude 擁有，**完全不准修改**。
7. **不准把任何圖片推到 GitHub，或把 Drive 檔案設為公開分享。**
8. 模型 ID、API 參數名稱**要查官方文件確認**，不要憑記憶寫。查不到就在測試報告註明「未查證」。
9. 不要動這個資料夾以外的任何檔案（上一層 `NAS網站部署/` 裡有 ccmtc-official、squid-portal 等其他正式專案，碰都不要碰）。
10. 每個階段結束時停下來，在 `說明/測試報告.md` 更新：做了什麼、改了哪些檔案、`npm test` 的完整輸出、未完成或有疑慮的項目。**不要宣稱沒有真的跑過的測試已通過。**
