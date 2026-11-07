// 極輕量的後台登入驗證，不用另外接 Supabase Auth 或做使用者資料表。
// 概念：登入時用 ADMIN_PASSWORD（完整管理）或 ADMIN_VIEW_PASSWORD（唯讀查看）核對密碼，
// 通過後發一個帶角色、到期時間跟 HMAC 簽章的 cookie，
// 之後每支後台 API 驗證 cookie 的簽章跟時間，就知道是誰、能不能修改。
// 角色：admin = 可查看＋修改（標記已付款、取消、已讀）；viewer = 只能查看，電話遮蔽。
import crypto from "crypto";

export const ADMIN_COOKIE_NAME = "admin_session";

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

// 用雜湊後再比對，避免因長度不同或比對時間差而洩漏資訊
export function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// 依輸入的密碼判斷角色；都不符合回傳 null
export function roleForPassword(password) {
  if (!password) return null;
  const adminPw = process.env.ADMIN_PASSWORD;
  const viewPw = process.env.ADMIN_VIEW_PASSWORD;
  if (adminPw && safeEqual(password, adminPw)) return "admin";
  if (viewPw && safeEqual(password, viewPw)) return "viewer";
  return null;
}

export function createSessionToken(role = "admin") {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("缺少 ADMIN_SESSION_SECRET 環境變數");
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 天
  const payload = expires + ":" + role;
  const sig = sign(payload, secret);
  return payload + "." + sig;
}

// 回傳 "admin" / "viewer" / null
export function getRole(req) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;

  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(new RegExp(ADMIN_COOKIE_NAME + "=([^;]+)"));
  if (!match) return null;

  const token = decodeURIComponent(match[1]);
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, sig] = parts;
  const expected = sign(payload, secret);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  // 舊格式（只有到期時間）是改版前登入的，一律視為 admin
  const [expiresStr, role] = payload.split(":");
  const expires = parseInt(expiresStr, 10);
  if (!expires || Date.now() > expires) return null;

  if (role === "viewer") return "viewer";
  return "admin";
}

export function isAuthorized(req) {
  return getRole(req) !== null;
}

export function isAdmin(req) {
  return getRole(req) === "admin";
}

// 唯讀角色看到的電話只留前四碼與末碼，其餘遮蔽
export function maskPhone(phone) {
  const s = String(phone == null ? "" : phone);
  if (s.length <= 5) return s ? "＊＊＊" : "";
  return s.slice(0, 4) + "＊".repeat(s.length - 5) + s.slice(-1);
}
