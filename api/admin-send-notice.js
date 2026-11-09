// POST /api/admin-send-notice { kind: "received"|"confirmed", ids: [訂單id...], preview?: true }
//   只寄給「打勾的訂單」（一定要帶 ids，不會一次寄全部）。
//   preview:true → 只預覽（會寄給誰、幾封、哪些被略過），不會寄出。
//   kind=received  → 「已收到您的預約」：待匯款／待對帳、有 email、還沒寄過；同一個 email 的多筆（都有打勾的）合併成一封
//   kind=confirmed → 「預約成功」：已對帳完成、有 email、還沒寄過
// GET /api/admin-send-notice?kind=...  → 全部尚未寄出的數量（僅供參考，不寄信）
import { getSupabaseAdmin } from "../lib/supabase.js";
import { getRole } from "../lib/adminAuth.js";
import { emailConfigured, confirmedPayload, receivedPayload, postBatch } from "../lib/email.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAILY_CAP = 1500; // 已升級 Resend Pro，這只是防呆的單日上限

export default async function handler(req, res) {
  const role = getRole(req);
  if (!role) return res.status(401).json({ error: "未登入或登入已逾期，請重新登入" });
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (req.method === "POST" && role !== "admin") return res.status(403).json({ error: "唯讀帳號無法寄信" });

  const supabase = getSupabaseAdmin();
  await supabase.rpc("expire_stale_holds");

  const body = (req.method === "POST" ? req.body : null) || {};
  const kindRaw = (req.method === "GET" ? req.query.kind : body.kind) || "";
  const kind = kindRaw === "confirmed" ? "confirmed" : "received";
  const label = kind === "received" ? "已收到您的預約" : "預約成功";

  const hasEmail = (b) => EMAIL_RE.test(String(b.customer_email || "").trim());
  const isVerified = (b) => b.payment_status === "paid" && b.payment_verified;
  const alive = (b) => !b.trashed && b.payment_status !== "cancelled" && Number(b.total_amount) > 0;

  // ---- GET：全部尚未寄出的數量（參考用）----
  if (req.method === "GET") {
    const { data, error } = await supabase.from("bookings").select("*").eq("trashed", false).neq("payment_status", "cancelled").gt("total_amount", 0).not("customer_email", "is", null);
    if (error) return res.status(500).json({ error: "查詢失敗" });
    const rows = (data || []).filter(hasEmail);
    const n = kind === "confirmed"
      ? rows.filter((b) => isVerified(b) && !b.confirmation_email_sent_at).length
      : rows.filter((b) => !isVerified(b) && !b.received_email_sent_at).length;
    return res.status(200).json({ kind, unsent: n, configured: emailConfigured() });
  }

  // ---- POST：只處理打勾的 ----
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string").slice(0, 500) : [];
  if (!ids.length) return res.status(400).json({ error: "請先在姓名前面的方格打勾，再按寄出。" });

  const { data, error } = await supabase.from("bookings").select("*").in("id", ids);
  if (error) {
    console.error("admin-send-notice select error:", error);
    return res.status(500).json({ error: "查詢失敗" });
  }
  const selected = data || [];

  const skipped = { noEmail: [], alreadySent: [], wrongStatus: [], dead: [] };
  const eligible = [];
  selected.forEach((b) => {
    const nm = b.customer_name || "（未填姓名）";
    if (!alive(b)) { skipped.dead.push(nm); return; }
    if (kind === "confirmed" ? !isVerified(b) : isVerified(b)) { skipped.wrongStatus.push(nm); return; }
    if (!hasEmail(b)) { skipped.noEmail.push(nm); return; }
    if (kind === "confirmed" ? b.confirmation_email_sent_at : b.received_email_sent_at) { skipped.alreadySent.push(nm); return; }
    eligible.push(b);
  });

  let jobs;
  if (kind === "confirmed") {
    jobs = eligible.map((b) => ({ ids: [b.id], to: String(b.customer_email).trim(), name: b.customer_name, payload: confirmedPayload(b) }));
  } else {
    const map = new Map();
    eligible.forEach((b) => {
      const key = String(b.customer_email).trim().toLowerCase();
      if (!map.has(key)) map.set(key, { email: String(b.customer_email).trim(), name: b.customer_name, bookings: [] });
      map.get(key).bookings.push(b);
    });
    jobs = [...map.values()].map((g) => ({ ids: g.bookings.map((b) => b.id), to: g.email, name: g.name, payload: receivedPayload(g.email, g.name, g.bookings) }));
  }

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ count: c1 }, { count: c2 }] = await Promise.all([
    supabase.from("bookings").select("id", { count: "exact", head: true }).gte("received_email_sent_at", since),
    supabase.from("bookings").select("id", { count: "exact", head: true }).gte("confirmation_email_sent_at", since),
  ]);
  const sentRecently = (c1 || 0) + (c2 || 0);
  const room = Math.max(0, DAILY_CAP - sentRecently);

  const summary = {
    kind, label,
    configured: emailConfigured(),
    selected: selected.length,
    emails: jobs.length,
    recipients: jobs.map((j) => j.name + " <" + j.to + ">"),
    skipped,
    sentLast24h: sentRecently,
  };
  if (body.preview) return res.status(200).json(summary);

  if (!emailConfigured()) return res.status(400).json({ error: "尚未設定寄信功能（Vercel 缺 RESEND_API_KEY / EMAIL_FROM）", ...summary });
  if (!jobs.length) return res.status(200).json({ ok: true, sent: 0, ...summary });
  if (room <= 0) return res.status(429).json({ error: "過去 24 小時已寄了 " + sentRecently + " 封，已達單日防呆上限，請稍後再按。", ...summary });

  const todo = jobs.slice(0, room);
  let sent = 0;
  let failedMsg = null;
  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50);
    const r = await postBatch(chunk.map((j) => j.payload));
    if (!r.ok) { failedMsg = r.error; break; }
    const now = new Date().toISOString();
    const okIds = chunk.flatMap((j) => j.ids);
    await supabase.from("bookings").update(kind === "confirmed" ? { confirmation_email_sent_at: now } : { received_email_sent_at: now }).in("id", okIds);
    sent += chunk.length;
  }

  return res.status(failedMsg ? 502 : 200).json({
    ok: !failedMsg,
    sent,
    remaining: jobs.length - sent,
    skipped,
    error: failedMsg ? "寄信中途失敗（已寄出 " + sent + " 封）：" + failedMsg : undefined,
  });
}
