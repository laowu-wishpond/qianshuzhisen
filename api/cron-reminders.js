// 由 Supabase 排程（pg_cron）每 15 分鐘呼叫一次：POST /api/cron-reminders，header x-cron-key = 設定表裡的 cron_key。
// 做三件事：
//   1. 保留時間剩 10 小時內、還沒匯款的訂單 → 寄「匯款提醒信」給客人（夜間 23:00～07:00 不寄），並 email 通知大哥是哪幾位
//   2. 客人按過「再給我 6 小時」、快到期（剩 2 小時內）還沒匯款 → 寄「最後提醒」
//   3. 每筆訂單每種提醒只寄一次（reminder_sent_at / final_reminder_sent_at）
//   4. 入住前提醒信（⑥）：對帳完成的客人，第一晚前 2 天寄一封（設定表 checkin_enabled = true 才會寄）
// 加 ?dry=1 可以只看「會寄給誰」，不真的寄。
import crypto from "node:crypto";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { emailConfigured, postBatch, sendBookingConfirmed } from "../lib/email.js";
import { sweepMessages } from "../lib/messageDesk.js";
import { sendReconcileDigest } from "../lib/reconcileDigest.js";
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

  // 單次補寄「預約成功」信：POST /api/cron-reminders?resend=b15126f6,38756816（訂單編號前 8 碼，一次最多 10 筆）。
  // 只會寄給「已付款、大哥已對帳、有 email、還沒寄過」的訂單，寄完會記錄，不會重複寄。
  const resendCodes = String(req.query?.resend || "").split(",").map((c) => c.trim().toLowerCase()).filter((c) => /^[0-9a-f]{8}$/.test(c)).slice(0, 10);
  if (resendCodes.length) {
    if (req.method !== "POST") return res.status(405).json({ error: "補寄請用 POST" });
    const { data: cands } = await supabase.from("bookings").select("*")
      .eq("payment_status", "paid").eq("payment_verified", true).eq("trashed", false).is("confirmation_email_sent_at", null).limit(1000);
    const results = [];
    for (const code of resendCodes) {
      const b = (cands || []).find((x) => String(x.id).slice(0, 8) === code);
      if (!b) { results.push({ code, result: "skipped_not_eligible_or_already_sent" }); continue; }
      const r = await sendBookingConfirmed(b);
      if (r.sent) await supabase.from("bookings").update({ confirmation_email_sent_at: new Date().toISOString() }).eq("id", b.id);
      results.push({ code, result: r.sent ? "sent" : r.reason });
    }
    return res.status(200).json({ resent: results });
  }

  // 待對帳清單 email：POST /api/cron-reminders?digest=reconcile（加 &dry=1 只看內容、不寄信）
  if (req.query?.digest === "reconcile") {
    if (req.method !== "POST") return res.status(405).json({ error: "請用 POST" });
    return res.status(200).json(await sendReconcileDigest({ dry: req.query?.dry === "1" }));
  }

  const dry = req.query?.dry === "1";
  await supabase.rpc("expire_stale_holds");

  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from("bookings")
    .select("id, group_id, customer_name, customer_phone, customer_email, site_id, check_in, check_out, nights_count, booking_date, early_arrival, total_amount, payment_status, trashed, hold_expires_at, hold_extensions, reminder_sent_at, final_reminder_sent_at")
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

  // 留言處理台：補回覆（客人先留言、大哥後對帳）、補通知大哥、逾時提醒。出錯不影響上面的提醒信。
  try { summary.messages = await sweepMessages(supabase, settings, { dry }); }
  catch (e) { console.error("sweepMessages error:", e); summary.messages = { error: String(e.message || e) }; }
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
  // 購物車整筆訂單（同一個 group）合成一封
  const finalGroups = new Map();
  for (const b of final) {
    const k = b.group_id || b.id;
    if (!finalGroups.has(k)) finalGroups.set(k, []);
    finalGroups.get(k).push(b);
  }
  const finals = [...finalGroups.values()].map((list) => ({ list, payload: finalReminderPayload(site, list.length === 1 ? list[0] : list) }));
  for (let i = 0; i < finals.length; i += 100) {
    const chunk = finals.slice(i, i + 100);
    const r = await postBatch(chunk.map((e) => e.payload));
    if (!r.ok) { summary.finalError = r.error; continue; }
    await supabase.from("bookings").update({ final_reminder_sent_at: new Date().toISOString() }).in("id", chunk.flatMap((e) => e.list.map((b) => b.id)));
    summary.finalSent += chunk.reduce((n, e) => n + e.list.length, 0);
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
