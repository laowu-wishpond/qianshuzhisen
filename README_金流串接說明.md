# 綠界 ECPay 金流串接說明（2026/08/11）

## 現況

客戶（林長南／Alan）尚未申請到綠界正式的商店代號／HashKey／HashIV，所以目前程式碼裡先用綠界**官方公開的測試環境帳號**把整套流程寫好、可以測試，正式金鑰核發後只要換 3 個環境變數，程式完全不用改。

## 已完成的檔案

```
supabase/migrations/20260811000000_create_bookings.sql   訂單資料表（bookings + ecpay_notifications）
lib/pricing.js       帳篷計價公式（跟 js/booking.js 前端顯示的公式一致，伺服器端重算避免被竄改金額）
lib/ecpay.js          綠界簽章（CheckMacValue）產生/驗證，已用官方範例驗證過正確
lib/supabase.js       共用的 Supabase 後端連線（service role key）
api/create-booking.js POST 接收預約表單 → 寫入訂單 → 若選線上刷卡，回傳綠界收銀台參數
api/ecpay-notify.js   接收綠界的付款結果通知（ReturnURL），驗簽後更新訂單狀態
js/booking.js、booking.html  已改成真的呼叫 /api/create-booking，並新增付款方式選項、Email 欄位
.env.example           所有需要的環境變數清單與說明
```

## 還差什麼才能真的動起來

1. ~~Supabase 專案~~ ✅ 已完成：專案 `qianshuzhisen-camping`（project ref `ayehkepqoctacpbytffv`），`bookings` / `ecpay_notifications` 兩張表已建好。
2. **部署到 Vercel**：這套 `/api` 後端是 Vercel Serverless Function，GitHub Pages（純靜態）跑不起來。要把這個資料夾接一個 Vercel 專案（`vercel.com` → Import Git Repository → 選 `laowu-wishpond/qianshuzhisen`），部署後才有網址可以測。
3. **在 Vercel 專案設定裡填環境變數**（對照 `.env.example`）：
   - `SUPABASE_URL`：`https://ayehkepqoctacpbytffv.supabase.co`（已知）
   - `SUPABASE_SERVICE_ROLE_KEY`：這是機密金鑰，MCP 工具不會自動取得，要自己去
     https://supabase.com/dashboard/project/ayehkepqoctacpbytffv/settings/api 複製 `service_role` 那把 key
   - `SITE_URL`（Vercel 部署後給的網址）
   - `ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`、`ECPAY_ENV`：**先留空**即可，程式會自動用官方測試帳號（商店代號 3002607）跑通整個流程。
4. **綠界正式申請**：見下方「給 Alan 的申請步驟」。審核通過後，把拿到的商店代號/HashKey/HashIV 填進 Vercel 環境變數，`ECPAY_ENV` 改成 `production`，就正式上線收款。

## 測試方式（Vercel 部署好、Supabase migration 套用後）

在 booking.html 送出預約、選「線上刷卡」，會被導到綠界測試收銀台，用官方測試信用卡號：

- 卡號 `4311-9511-1111-1111`，安全碼任填三碼，有效月/年填未來日期
- 3D 驗證簡訊固定輸入 `1234`

付款完成後，`bookings` 表裡該筆訂單的 `payment_status` 應該會自動變成 `paid`。

## 給 Alan 的綠界申請步驟（因為身分驗證需要負責人本人資料，建議請他自己完成）

1. 註冊：https://vendor.ecpay.com.tw/User/LogOn_Step1
2. 手機驗證（自己的門號）→ Email 驗證
3. 賣家類別選「商務賣家」，申請服務勾選「金流」
4. 上傳資料：
   - 負責人身分證正反面
   - 公司存摺封面（華南銀行 008 中和分行 165-10-007264-1，戶名水松千樹生態開發有限公司）
   - 公司登記證明
   - 營業場所照片 4 張：大門門牌、招牌、產品展示區、營業場所
5. 提領銀行帳戶填同一本華南銀行帳戶
6. 送出後審核約 3-5 個工作天，通過後會核發商店代號 + HashKey + HashIV

有問題也可以直接打綠界客服確認代辦相關規定。

---

# LINE Pay Online 金流串接說明（2026/08/22）

## 現況

因為綠界（ECPay）審核卡在露營場執照尚未核發，先併行串接 LINE Pay 當替代方案。目前用 Mei-Wei 申請到的**沙盒測試帳號**把整套流程寫好，正式商家審核通過後（約需 2-3 週 + 實體店面照片），只要換環境變數就能上線，程式碼不用改。

## 已完成的檔案

```
supabase/migrations/20260822000000_add_linepay.sql   bookings 表新增 linepay 相關欄位 + linepay_notifications 表
lib/linepay.js         LINE Pay 簽章（X-LINE-Authorization）產生 + API fetch wrapper
api/create-booking.js  新增 linepay 分支：呼叫 Request API，回傳付款頁面網址給前端導向
api/linepay-confirm.js LINE Pay 付款完成後的 confirmUrl，呼叫 Confirm API 驗證後更新訂單狀態
js/booking.js、booking.html  新增「LINE Pay」付款選項，並處理付款完成/取消後導回頁面的狀態顯示
```

## 目前使用的沙盒金鑰（已內建在 lib/linepay.js 當預設值）

- Channel ID：`2011200845`
- Channel Secret：`06f40d72a39249272b5000820223bf12`
- 取得方式：LINE Pay 商家後台（test_202608213873@line.pay）→ 開發者工具 → 管理連結金鑰

## 還差什麼才能真的動起來

1. **部署到 Vercel**：跟綠界共用同一個 Vercel 專案，不用額外設定就能跑（`SITE_URL`、Supabase 相關環境變數都已經在用了）。
2. **環境變數**：`LINEPAY_CHANNEL_ID`、`LINEPAY_CHANNEL_SECRET`、`LINEPAY_ENV` 先留空即可，程式會自動用上面的沙盒金鑰。
3. ⚠️ **這次沒辦法像綠界那樣先在我這邊完整測過一輪**——我的環境連不到 LINE Pay 的伺服器（網路白名單限制），簽章演算法已經照官方規格驗證過（有跑過單元測試確認產生的簽章格式正確），但完整的 Request → 付款 → Confirm 流程要等 push 到 Vercel 之後，實際在 booking.html 走一次才能真正確認有沒有問題。
4. **LINE Pay 正式商家申請**：需要走真人審核、7 份文件、實體店面照片，約 2-3 週。審核通過後，把正式的 Channel ID / Channel Secret 填進 Vercel 環境變數（`LINEPAY_CHANNEL_ID`、`LINEPAY_CHANNEL_SECRET`），`LINEPAY_ENV` 改成 `production`，即可正式上線收款。

## 測試方式（Vercel 部署好之後）

在 booking.html 送出預約、選「LINE Pay」，應該會被導向 LINE Pay 沙盒付款頁面，用沙盒帳號登入模擬付款。付款完成會導回 booking.html 並顯示「LINE Pay 付款已確認」，`bookings` 表裡該筆訂單的 `payment_status` 應該會自動變成 `paid`。

如果卡住，把 booking.html 送出後看到的畫面/錯誤訊息截圖給我，我再協助排錯。
