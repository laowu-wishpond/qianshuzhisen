// 由 Supabase 排程（pg_cron）每 15 分鐘呼叫一次：POST /api/cron-reminders，header x-cron-key = 設定表裡的 cron_key。
// 做三件事：
//   1. 保留時間剩 10 小時內、還沒匯款的訂單 → 寄「匯款提醒信」給客人（夜間 23:00～07:00 不寄），並 email 通知大哥是哪幾位
//   2. 客人按過「再給我 6 小時」、快到期（剩 2 小時內）還沒匯款 → 寄「最後提醒」
//   3. 每筆訂單每種提醒只寄一次（reminder_sent_at / final_reminder_sent_at）
//   4. 入住前提醒信（⑥）：對帳完成的客人，第一晚前 2 天寄一封（設定表 checkin_enabled = true 才會寄）
// 加 ?dry=1 可以只看「會寄給誰」，不真的寄。
import crypto from "node:crypto";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { emailConfigured, postBatch } from "../lib/email.js";
import { pickDue, reminderPayload, finalReminderPayload, ownerDigestPayload, getSettings, pickCheckin, checkinPayload } from "../lib/reminders.js";

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const supabase = getSupabaseAdmin();
  const settings = await getSettings(supabase);
  const key = req.headers["x-cron-key"];
  if (!safeEqual(key, settings.cron_key)) return res.status(401).json({ error: "unauthorized" });

  const dry = req.query?.dry === "1";
  await supabase.rpc("expire_stale_holds");

  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from("bookings")
    .select("id, customer_name, customer_phone, customer_email, site_id, check_in, check_out, nights_count, booking_date, early_arrival, total_amount, payment_status, trashed, hold_expires_at, hold_extensions, reminder_sent_at, final_reminder_sent_at")
    .eq("payment_status", "pending")
    .eq("trashed", false)
    .gt("hold_expires_at", nowIso)
    .limit(1000);
  if (error) {
    console.error("cron-reminders query error:", error);
    return res.status(500).json({ error: "query failed" });
  }

  const { first, final } = pickDue(rows || []);
  const summary = { pending: (rows || []).length, firstDue: first.length, finalDue: final.length, sent: 0, finalSent: 0, ownerNotified: false, dry };

  // 入住前提醒信：預設關閉
  let checkinDue = [];
  if (settings.checkin_enabled === "true") {
    const { data: paidRows } = await supabase
      .from("bookings")
      .select("id, customer_name, customer_phone, customer_email, site_id, check_in, check_out, nights_count, booking_date, early_arrival, total_amount, payment_status, payment_verified, trashed, checkin_reminder_sent_at")
      .eq("payment_status", "paid").eq("payment_verified", true).eq("trashed", false)
      .is("checkin_reminder_sent_at", null)
      .gte("check_out", new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10))
      .limit(1000);
    checkinDue = pickCheckin(paidRows || [], new Date(), Number(settings.checkin_days_before) || 2);
  }
  summary.checkinDue = checkinDue.length;
  summary.checkinSent = 0;
  if (dry || (!first.length && !final.length && !checkinDue.length)) return res.status(200).json(summary);
  if (!emailConfigured()) return res.status(200).json({ ...summary, error: "email not configured" });

  const site = settings.site_url || "https://www.tsforest.com.tw";

  // 第一次提醒：同 email 合成一封
  const groups = new Map();
  for (const b of first) {
    const k = b.customer_email.trim().toLowerCase();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }
  const entries = [...groups.entries()].map(([email, list]) => ({ list, payload: reminderPayload(site, email, list[0].customer_name, list) }));
  const remindedOk = [];
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    const r = await postBatch(chunk.map((e) => e.payload));
    if (!r.ok) { summary.firstError = r.error; continue; }
    const ids = chunk.flatMap((e) => e.list.map((b) => b.id));
    await supabase.from("bookings").update({ reminder_sent_at: new Date().toISOString() }).in("id", ids);
    for (const e of chunk) remindedOk.push(...e.list);
  }
  summary.sent = remindedOk.length;

  // 最後提醒：一筆一封
  const finals = final.map((b) => ({ b, payload: finalReminderPayload(site, b) }));
  for (let i = 0; i < finals.length; i += 100) {
    const chunk = finals.slice(i, i + 100);
    const r = await postBatch(chunk.map((e) => e.payload));
    if (!r.ok) { summary.finalError = r.error; continue; }
    await supabase.from("bookings").update({ final_reminder_sent_at: new Date().toISOString() }).in("id", chunk.map((e) => e.b.id));
    summary.finalSent += chunk.length;
  }

  // 入住前提醒信：一筆一封
  const ci = checkinDue.map((b) => ({ b, payload: checkinPayload(settings.site_url || "https://www.tsforest.com.tw", b, settings) }));
  for (let i = 0; i < ci.length; i += 100) {
    const chunk = ci.slice(i, i + 100);
    const r = await postBatch(chunk.map((e) => e.payload));
    if (!r.ok) { summary.checkinError = r.error; continue; }
    await supabase.from("bookings").update({ checkin_reminder_sent_at: new Date().toISOString() }).in("id", chunk.map((e) => e.b.id));
    summary.checkinSent += chunk.length;
  }

  // 通知大哥（只在有寄第一次提醒時寄，不重複騷擾）
  if (remindedOk.length && settings.owner_email) {
    const r = await postBatch([ownerDigestPayload(settings.owner_email, remindedOk, summary.pending)]);
    summary.ownerNotified = r.ok;
  }
  return res.status(200).json(summary);
}
