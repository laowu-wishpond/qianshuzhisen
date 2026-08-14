// POST /api/admin-login  { password } → 驗證密碼，通過後發登入 cookie
// DELETE /api/admin-login → 登出，清掉 cookie
import { createSessionToken, ADMIN_COOKIE_NAME } from "../lib/adminAuth.js";

export default async function handler(req, res) {
  if (req.method === "DELETE") {
    res.setHeader(
      "Set-Cookie",
      `${ADMIN_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
    );
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { password } = req.body || {};
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(500).json({ error: "後端尚未設定 ADMIN_PASSWORD 環境變數" });
  }

  if (!password || password !== adminPassword) {
    return res.status(401).json({ error: "密碼錯誤" });
  }

  let token;
  try {
    token = createSessionToken();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  res.setHeader(
    "Set-Cookie",
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 24 * 7}`
  );
  return res.status(200).json({ ok: true });
}
