// 綠界 ECPay 共用工具
// 文件：https://developers.ecpay.com.tw/?p=2856 (產生檢查碼 CheckMacValue)

import crypto from "crypto";

// 綠界官方公開的「測試環境」商店代號 / HashKey / HashIV
// （來源：https://developers.ecpay.com.tw/?p=2856 測試介接資訊，特店測試資料）。
// 任何開發者都能用這組值打 Stage（測試站）API，不需要通過真正的商家審核。
// 正式上線前，一定要換成客戶審核通過後拿到的正式三組值（見 .env.example）。
export const ECPAY_TEST_CREDENTIALS = {
  MerchantID: "3002607",
  HashKey: "pwFHCqoQZGmho4w6",
  HashIV: "EkRm7iFT261dpevs",
};

export const ECPAY_AIO_CHECKOUT_URL = {
  stage: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
  production: "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5",
};

/**
 * 產生綠界要求的 CheckMacValue（簽章）。
 * 規則：依 key 的英文字母排序 -> 前後加上 HashKey/HashIV -> 依 .NET UrlEncode 規則編碼 -> 轉小寫 -> SHA256 -> 轉大寫
 * @param {Record<string, string|number>} params 不包含 CheckMacValue 本身
 * @param {string} hashKey
 * @param {string} hashIV
 * @returns {string}
 */
export function genCheckMacValue(params, hashKey, hashIV) {
  const keys = Object.keys(params)
    .filter((k) => k !== "CheckMacValue" && params[k] !== undefined && params[k] !== null)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  let raw = `HashKey=${hashKey}`;
  for (const key of keys) {
    raw += `&${key}=${params[key]}`;
  }
  raw += `&HashIV=${hashIV}`;

  let encoded = encodeURIComponent(raw).toLowerCase();

  // .NET 的 UrlEncode 跟 JS 的 encodeURIComponent 對某些字元的編碼不同，
  // 綠界的簽章驗證是照 .NET 規則，這裡把常見差異字元轉換回來。
  encoded = encoded
    .replace(/%20/g, "+")
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")");

  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

/**
 * 驗證綠界回傳（webhook / ReturnURL）的 CheckMacValue 是否正確。
 */
export function verifyCheckMacValue(params, hashKey, hashIV) {
  const { CheckMacValue, ...rest } = params;
  if (!CheckMacValue) return false;
  const expected = genCheckMacValue(rest, hashKey, hashIV);
  return expected === CheckMacValue;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** 綠界要求的 MerchantTradeDate 格式：yyyy/MM/dd HH:mm:ss */
export function formatMerchantTradeDate(date = new Date()) {
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
