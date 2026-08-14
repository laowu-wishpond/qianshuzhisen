// 極輕量的後台登入驗證，不用另外接 Supabase Auth 或做使用者資料表。
// 概念：登入時用 ADMIN_PASSWORD 核對密碼，通過後發一個帶到期時間跟 HMAC 簽章的 cookie，
// 之後每支後台 API 只要驗證 cookie 的簽章跟時間就知道是不是合法登入，
// 之後如果要換成多人多權限，再換成真正的帳號系統即可，不影響前台其他頁面。
import crypto from "crypto";

export const ADMIN_COOKIE_NAME = "admin_session";

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function createSessionToken() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("缺少 ADMIN_SESSION_SECRET 環境變數");
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 天
  const payload = String(expires);
  const sig = sign(payload, secret);
  return payload + "." + sig;
}

export function isAuthorized(req) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;

  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(new RegExp(ADMIN_COOKIE_NAME + "=([^;]+)"));
  if (!match) return false;

  const token = decodeURIComponent(match[1]);
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [expiresStr, sig] = parts;
  const expected = sign(expiresStr, secret);
  if (sig !== expected) return false;

  const expires = parseInt(expiresStr, 10);
  if (!expires || Date.now() > expires) return false;

  return true;
}
