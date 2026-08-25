// LINE Pay Online API v3 共用工具
// 文件：https://developers-pay.line.me/online/

import crypto from "crypto";

// 沙盒測試用金鑰（由 Mei-Wei 在 LINE Pay 商家後台 > 開發者工具 > 管理連結金鑰 查詢取得）。
// 只能打 sandbox-api-pay.line.me，不是正式金鑰。正式上線前要換成 Alan 商家審核通過後的正式金鑰
// （見 .env.example，設定 LINEPAY_CHANNEL_ID / LINEPAY_CHANNEL_SECRET / LINEPAY_ENV=production）。
export const LINEPAY_SANDBOX_CREDENTIALS = {
  channelId: "2011200845",
  channelSecret: "06f40d72a39249272b5000820223bf12",
};

export const LINEPAY_API_BASE = {
  sandbox: "https://sandbox-api-pay.line.me",
  production: "https://api-pay.line.me",
};

/**
 * 產生 LINE Pay 要求的簽章 header。
 * 規則：signature = Base64( HMAC-SHA256( channelSecret, channelSecret + uri + requestBody + nonce ) )
 * @param {string} channelSecret
 * @param {string} uri 不含 host，例如 /v3/payments/request
 * @param {string} requestBody JSON.stringify 過的字串（GET 請求傳空字串）
 * @param {string} nonce 每次請求都要不同，用亂數/timestamp
 */
export function genLinePaySignature(channelSecret, uri, requestBody, nonce) {
  const raw = channelSecret + uri + requestBody + nonce;
  return crypto.createHmac("sha256", channelSecret).update(raw).digest("base64");
}

/**
 * 呼叫 LINE Pay API 的共用 fetch wrapper，自動加上簽章 header。
 * @param {"sandbox"|"production"} env
 * @param {{channelId: string, channelSecret: string}} credentials
 * @param {string} uri 例如 /v3/payments/request
 * @param {object} body
 */
export async function linePayFetch(env, credentials, uri, body) {
  const base = LINEPAY_API_BASE[env] || LINEPAY_API_BASE.sandbox;
  const nonce = crypto.randomUUID();
  const requestBody = JSON.stringify(body);
  const signature = genLinePaySignature(credentials.channelSecret, uri, requestBody, nonce);

  const res = await fetch(base + uri, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-LINE-ChannelId": credentials.channelId,
      "X-LINE-Authorization-Nonce": nonce,
      "X-LINE-Authorization": signature,
    },
    body: requestBody,
  });

  const data = await res.json();
  return { ok: res.ok, data };
}
