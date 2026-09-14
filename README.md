# 拍點 LRC — Android YouTube Music 對時編輯器

版本：0.1.1 原型。Android 9（API 28）以上。

**本包是原始碼專案，不是可安裝 APK。** 目前已執行 JavaScript 核心測試；Android 編譯、Lint、實際 WebView 畫面及 YouTube Music 真機同步仍待驗證。請勿將本版視為已驗收發行版。

## 工作方式

在所選的 YouTube Music 官方版或 ReVanced 播放歌曲，本 App 以 Android MediaSessionManager 取得該 App 的 MediaController、播放位置與控制能力。使用者開啟系統通知存取權後才能連接。歌詞工作區以 APK 內附的 HTML/CSS/JavaScript 在 WebView 呈現；播放連接、檔案存取及草稿保存由原生 Java 負責。不是遠端網站或 PWA。

YouTube Music 仍負責登入、播放及帳號限制。本 App 不取得音訊、不下載歌曲，也不擷取平台歌詞。沒有宣告 INTERNET 或儲存空間廣泛存取權限。通知監聽服務不讀取通知內容；Android 授權範圍本身較大，首次授權前會說明。

## 已實作功能

- 預設連接 `app.revanced.android.apps.youtube.music`（依使用者提供的套件名稱）。更多工具 → 音樂播放器可切換官方版 `com.google.android.apps.youtube.music`，選擇會保留；只連接選定套件，不會自動改播另一個 App。
- 曲目識別包含播放器套件名稱，切換播放器後需重新連結歌詞；從 0.1.0 升級亦需重新連結，既有歌詞時間不變。
- 在按下打點鍵的當下讀取原生播放位置；播放中依 Android 單調時鐘、最後更新時間和播放速率推算。
- 一按打點、自動下一句；選句重打、上一句／下一句。
- 單句 ±50 ms、手動填寫時間、整體／區段位移。
- 正負打點補償、百分之一秒／毫秒匯出。
- 分句、合句、增刪歌詞、按時間排序、撤銷／重做（最多 60 步，限本次開啟）。
- UTF-8 LRC／TXT 匯入；多時間標记展開為多句；歌曲資料編輯。
- LRC 正 offset 視為提前，匯入時換算進時間；匯出不重複輸出 offset。早於零會設為零並提示。
- 相同時間可放原文與翻譯；暫不支援 Enhanced LRC 逐字時間標记，遇到會拒絕並提示。
- 草稿自動保存在 App 私有空間；匯入／匯出 JSON 專案備份。
- 匯出 LRC 前阻擋未打點、倒序及空內容，避免默默漏句。
- 切歌、未連結歌詞、無有效時間、遠端投放、跳轉等待時禁止打點。
- 播放／暫停、±5 秒、進度列及從句首前 1.5 秒跳轉（依播放器公布的能力啟用）。

## 建置 APK

已提供 `.github/workflows/android.yml`。不會自動上傳或修改你現有的網站 repository。

### 方法 A：GitHub Actions

1. 建立一個專供此 App 使用的 GitHub repository。
2. 將解壓後 `lrc-studio` **內部所有檔案** 放到 repository 根目錄，包含 `.github/workflows/android.yml`。不要多包一層 lrc-studio 目錄。
3. 到 Actions → Build Android APK → Run workflow。
4. 成功後下載 `lrc-studio-debug-apk` artifact，解壓後取得 `app-debug.apk`。
5. 將 APK 傳到手機安裝。這是供測試的 debug APK。

每次在乾淨 Actions 環境建置會產生新的 debug 簽章。不同建置之間可能無法直接覆蓋安裝；卸載前務必先匯出專案備份，卸載會清除草稿。正式持續使用應改用固定、私有保管的簽章金鑰；本專案不內附金鑰。

### 方法 B：Android Studio / 本機命令列

需要 JDK 17、Gradle 8.11.1、Android SDK Platform 35。Android Gradle Plugin 為 8.9.2。

此包不含 Gradle Wrapper 二進位檔，需先安裝指定版本的 Gradle。於專案根目錄執行：

```sh
gradle wrapper --gradle-version 8.11.1
./gradlew :app:assembleDebug :app:lintDebug
```

Windows 使用 `gradlew.bat`。如 SDK 路徑未被自動找到，於 `local.properties` 設定 `sdk.dir` 為本機 SDK 路徑；不要提交這個檔案。

APK 輸出：`app/build/outputs/apk/debug/app-debug.apk`。

## 第一次使用

1. 開啟「拍點 LRC」，按「連接」，閱讀說明並在 Android 設定開啟通知存取權。
2. 開啟 YouTube Music，播放要對時的**同一個版本**歌曲。
3. 回到拍點 LRC，匯入 LRC／TXT 或貼上每行一句的歌詞。
4. 按「將目前歌曲連結到這份歌詞」，確認歌名。
5. 聽到每句開頭按「打點，下一句」。按下當下記錄，不等放開。
6. 點選句子後用 ±0.05 秒微調；「編輯此句」可手動輸入 mm:ss.xxx。
7. 全部打點完成後匯出 LRC。換另一份歌詞前，先匯出專案備份。

只有目前一份工作草稿。切換或關閉 App 會保留草稿，但清除 App 資料、卸載會刪除。備份可保留未打點行與設定，LRC 匯出則要求每行都有時間。

## YouTube Music 與對時限制

- 尚未在真機確認特定版本 YouTube Music 是否持續公布足夠精準的位置或接受跳轉。Android API 提供方法，不保證所有播放器資料品質。
- 若切回編輯器後 YouTube Music 停止播放，可能需要該帳號可用的背景播放功能；也可嘗試 Android 分割畫面。App 不繞過平台限制。
- 藍牙、耳機、手動反應與播放器更新皆可能造成誤差。毫秒格式不代表達到毫秒級精度，應先以熟悉的句首校準。
- 投放到遠端裝置時禁止打點；本版對時以手機本機播放為設計目標。
- 曲目識別使用 media id、標題、歌手及長度。播放器若更新識別資訊，可能需要再次連結。
- 若不同錄音版本公開相同識別資料，仍需由使用者確認版本與總長度。
- 不包含懸浮視窗、波形、自動語音對齊、詞庫下載、串流擷取或網站部署。

## 驗證

已執行：

```sh
node --test tests/core.test.cjs
node --check app/src/main/assets/app.js
node --check app/src/main/assets/core.js
```

`tests/ui.test.cjs` 包含以模擬原生橋接器執行的互動與版面測試；需要 Playwright 及 Chromium。**本次環境缺少 Chromium，未執行成功**，不能當作 UI 或 Android 真機驗證結果。可在開發環境執行：

```sh
npm install --no-save playwright
npx playwright install chromium
node tests/ui.test.cjs
```

測試以本機 HTTP server 載入 APK 內相同介面，不模擬 YouTube Music API 行為。UI 測試成功時會輸出手機／平板截圖到 preview/。

真機驗收請參閱 `DEVICE_CHECKLIST.md`。

## 官方技術參考

- [MediaSessionManager](https://developer.android.com/reference/android/media/session/MediaSessionManager)
- [PlaybackState](https://developer.android.com/reference/android/media/session/PlaybackState)
- [MediaController](https://developer.android.com/reference/android/media/session/MediaController)
- [Android Gradle Plugin 8.9](https://developer.android.com/build/releases/agp-8-9-0-release-notes)

本 App 為獨立製作，與 YouTube、YouTube Music 或 Google 無隸屬關係。

## 0.1.1 更新

新增指定 ReVanced 套件、原生播放器選擇、啟動對應 App、依選擇顯示連線狀態。ReVanced 的實際對時與控制能力尚未真機驗證。完整 ZIP 可覆蓋原專案同名檔案，不包含或刪除既有 .git。重新提交並推送後由 Actions 建置 APK。
