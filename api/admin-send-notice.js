// GET  /api/admin-send-notice          → 預覽：會寄給幾位、幾封（不會寄出）
// POST /api/admin-send-notice {}        → 真的寄出（只有管理員；每次有上限，避免超過 Resend 免費方案每日額度）
//
// 寄給「後台有留 email」且還沒收過通知的客人：
//  1. 已對帳完成、但還沒寄過「預約成功」信的 → 寄「預約成功」信
//  2. 待匯款／已回報待對帳、還沒寄過「已收到預約」信的 → 寄「已收到您的預約」信（同一個 email 的多筆訂單合併成一封）
import { getSupabaseAdmin } from "../lib/supabase.js";
import { getRole } from "../lib/adminAuth.js";
import { emailConfigured, confirmedPayload, receivedPayload, postBatch } from "../lib/email.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAILY_CAP = 1500; // 已升級 Resend Pro（每月 5 萬封、無每日上限），這只是防呆的單日上限

export default async function handler(req, res) {
  const role = getRole(req);
  if (!role) return res.status(401).json({ error: "未登入或登入已逾期，請重新登入" });
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (req.method === "POST" && role !== "admin") return res.status(403).json({ error: "唯讀帳號無法寄信" });

  const supabase = getSupabaseAdmin();
  await supabase.rpc("expire_stale_holds");

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("trashed", false)
    .neq("payment_status", "cancelled")
    .gt("total_amount", 0)
    .not("customer_email", "is", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("admin-send-notice select error:", error);
    return res.status(500).json({ error: "查詢失敗" });
  }
  const rows = (data || []).filter((b) => EMAIL_RE.test(String(b.customer_email || "").trim()));

  // 1) 已對帳但沒寄過預約成功信
  const confirmList = rows.filter((b) => b.payment_status === "paid" && b.payment_verified && !b.confirmation_email_sent_at);
  // 2) 待匯款／待對帳、沒寄過「已收到」信 → 依 email 合併
  const receivedMap = new Map();
  rows
    .filter((b) => !(b.payment_status === "paid" && b.payment_verified) && !b.received_email_sent_at)
    .forEach((b) => {
      const key = String(b.customer_email).trim().toLowerCase();
      if (!receivedMap.has(key)) receivedMap.set(key, { email: String(b.customer_email).trim(), name: b.customer_name, bookings: [] });
      receivedMap.get(key).bookings.push(b);
    });
  const receivedList = [...receivedMap.values()];

  // 過去 24 小時已經寄了幾封（粗估：以訂單的寄信時間計，偏保守）
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ count: c1 }, { count: c2 }] = await Promise.all([
    supabase.from("bookings").select("id", { count: "exact", head: true }).gte("received_email_sent_at", since),
    supabase.from("bookings").select("id", { count: "exact", head: true }).gte("confirmation_email_sent_at", since),
  ]);
  const sentRecently = (c1 || 0) + (c2 || 0);
  const room = Math.max(0, DAILY_CAP - sentRecently);

  const summary = {
    configured: emailConfigured(),
    confirmPending: confirmList.length,
    receivedPending: receivedList.length,
    receivedBookings: receivedList.reduce((n, g) => n + g.bookings.length, 0),
    totalEmails: confirmList.length + receivedList.length,
    sentLast24h: sentRecently,
    canSendNow: Math.min(room, confirmList.length + receivedList.length),
    dailyCap: DAILY_CAP,
  };
  if (req.method === "GET") return res.status(200).json(summary);

  if (!emailConfigured()) return res.status(400).json({ error: "尚未設定寄信功能（Vercel 缺 RESEND_API_KEY / EMAIL_FROM）", ...summary });
  if (room <= 0) return res.status(429).json({ error: "過去 24 小時已寄了 " + sentRecently + " 封，已達單日防呆上限，請稍後再按。", ...summary });

  // 先寄預約成功信，再寄已收到信；總數不超過 room
  const jobs = [];
  confirmList.forEach((b) => jobs.push({ kind: "confirmed", ids: [b.id], payload: confirmedPayload(b) }));
  receivedList.forEach((g) => jobs.push({ kind: "received", ids: g.bookings.map((b) => b.id), payload: receivedPayload(g.email, g.name, g.bookings) }));
  const todo = jobs.slice(0, room);

  let sent = 0;
  let failedMsg = null;
  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50);
    const r = await postBatch(chunk.map((j) => j.payload));
    if (!r.ok) { failedMsg = r.error; break; }
    const now = new Date().toISOString();
    const confirmedIds = chunk.filter((j) => j.kind === "confirmed").flatMap((j) => j.ids);
    const receivedIds = chunk.filter((j) => j.kind === "received").flatMap((j) => j.ids);
    if (confirmedIds.length) await supabase.from("bookings").update({ confirmation_email_sent_at: now }).in("id", confirmedIds);
    if (receivedIds.length) await supabase.from("bookings").update({ received_email_sent_at: now }).in("id", receivedIds);
    sent += chunk.length;
  }

  return res.status(failedMsg ? 502 : 200).json({
    ok: !failedMsg,
    sent,
    remaining: summary.totalEmails - sent,
    error: failedMsg ? "寄信中途失敗（已寄出 " + sent + " 封）：" + failedMsg : undefined,
  });
}
