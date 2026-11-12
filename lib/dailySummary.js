// 「每日總整理」email：一天一封，把大哥需要處理的事一次列清楚。
//  ① 今天新進訂單　② 待對帳（含客人用留言回報匯款）　③ 待退款　④ 還沒回覆的留言
// 呼叫方式（排程金鑰驗證）：POST /api/cron-reminders?digest=daily　　加 &dry=1 只看內容不寄信。
// 四項都沒有事情時不寄信，避免天天收到空信。
import { getSupabaseAdmin } from "./supabase.js";
import { emailConfigured, postBatch } from "./email.js";
import { stayInfo } from "./stay.js";
import { getSettings } from "./reminders.js";
import { collectUnreconciled } from "./reconcileDigest.js";

const SITE_DEFAULT = "https://www.tsforest.com.tw";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "NT$" + Number(n || 0).toLocaleString();
const tw = (iso) => new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const COLS = "id, group_id, created_at, customer_name, customer_phone, site_id, check_in, check_out, nights_count, booking_date, early_arrival, total_amount, payment_status, payment_verified, cancelled_at, refund_amount, refund_status, hold_expires_at";

// 把同一個購物車（group_id）的多筆合成一列
function groupBookings(rows) {
  const units = new Map();
  for (const b of rows || []) {
    const key = b.group_id || b.id;
    const st = stayInfo(b);
    if (!units.has(key)) units.set(key, { code: String(key).slice(0, 8), name: b.customer_name, phone: b.customer_phone, status: b.payment_status, sites: [], start: st.start, end: st.end, total: 0, refund: 0, createdAt: b.created_at });
    const u = units.get(key);
    u.sites.push(b.site_id);
    u.total += Number(b.total_amount || 0);
    u.refund += Number(b.refund_amount || 0);
    if (st.start && (!u.start || st.start < u.start)) u.start = st.start;
    if (st.end && st.end > u.end) u.end = st.end;
  }
  return [...units.values()];
}

export async function collectDaily(supabase, settings = {}) {
  const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // ① 24 小時內新進、目前仍有效的訂單
  const { data: fresh } = await supabase.from("bookings").select(COLS)
    .gte("created_at", since24).eq("trashed", false).neq("payment_status", "cancelled").order("created_at").limit(300);
  const newOrders = groupBookings(fresh);

  // ② 待對帳（沿用待對帳清單的邏輯）
  const rec = await collectUnreconciled(supabase);

  // ③ 待退款：客人取消、依規則要退、還沒標記已退款
  const { data: refunds } = await supabase.from("bookings").select(COLS)
    .eq("payment_status", "cancelled").eq("refund_status", "pending").eq("trashed", false).limit(300);
  const refundList = groupBookings(refunds);

  // ④ 還沒回覆的留言（只看啟用留言助理之後的）
  const msgSince = settings.msgdesk_since || "2999-01-01T00:00:00Z";
  const { data: msgs } = await supabase.from("contact_messages").select("id, name, phone, message, created_at, status, reply")
    .or("reply.is.null,reply.eq.").gte("created_at", msgSince).order("created_at").limit(100);
  const openMsgs = (msgs || []).map((m) => ({ name: m.name, phone: m.phone, at: m.created_at, snippet: String(m.message || "").replace(/\s+/g, " ").slice(0, 70) }));

  // ⑥ 近 24 小時「沒匯款、保留到期、營位被釋出」的訂單（提醒大哥：這些客人可以關心一下）
  const { data: expd } = await supabase.from("bookings").select(COLS)
    .eq("payment_status", "cancelled").eq("cancel_reason", "expired").eq("trashed", false).gt("total_amount", 0)
    .gte("hold_expires_at", since24).limit(300);
  const expiredList = groupBookings(expd);

  return { newOrders, reported: rec.reported, viaMsg: rec.viaMsg, refundList, openMsgs, expiredList };
}

function section(title, color, bodyRows, note) {
  if (!bodyRows) return "";
  return `<h3 style="margin:20px 0 4px;color:${color}">${esc(title)}</h3>${note ? `<p style="margin:0 0 4px;color:#666;font-size:14px">${note}</p>` : ""}<table style="border-collapse:collapse;width:100%">${bodyRows}</table>`;
}
const td = (html, right) => `<td style="padding:6px;border-bottom:1px solid #eee;${right ? "text-align:right;white-space:nowrap" : ""}">${html}</td>`;
const who = (u) => `${esc(u.name)}<br><span style="color:#888;font-size:12px">${esc(u.phone)}　編號 ${esc(u.code)}</span>`;
const stayText = (u) => `${esc(u.sites.length > 1 ? u.sites.length + " 個營位：" : "")}${esc(u.sites.join("、"))}<br><span style="font-size:13px;color:#555">${esc(u.start)}～${esc(u.end)}</span>`;

export function dailySummaryPayload(ownerEmail, d, site = SITE_DEFAULT) {
  const rowsNew = d.newOrders.map((u) => `<tr>${td(who(u))}${td(stayText(u))}${td(`<strong>${esc(money(u.total))}</strong><br><span style="font-size:13px;color:${u.status === "paid" ? "#2f5a3a" : "#b25a00"}">${u.status === "paid" ? "已回報匯款" : "等匯款中"}</span>`, true)}</tr>`).join("");
  const rowsRec = d.reported.map((u) => `<tr>${td(who(u))}${td(stayText(u))}${td(`<strong>${esc(money(u.total))}</strong><br><span style="font-size:13px;color:#555">末五碼 ${esc(u.last5)}</span>`, true)}</tr>`).join("");
  const rowsViaMsg = d.viaMsg.map((u) => `<tr>${td(who(u))}${td(`${esc(u.site)}　${esc(u.start)}～${esc(u.end)}<br><span style="font-size:13px;color:#555">留言：${esc(u.snippet)}…</span>`)}${td(`<strong>${esc(money(u.total))}</strong>`, true)}</tr>`).join("");
  const rowsRefund = d.refundList.map((u) => `<tr>${td(who(u))}${td(stayText(u))}${td(`<strong>退 ${esc(money(u.refund))}</strong>`, true)}</tr>`).join("");
  const rowsExpired = (d.expiredList || []).map((u) => `<tr>${td(who(u))}${td(stayText(u))}${td(`<strong>${esc(money(u.total))}</strong>`, true)}</tr>`).join("");
  const rowsMsg = d.openMsgs.map((m) => `<tr>${td(`${esc(m.name)}<br><span style="color:#888;font-size:12px">${esc(m.phone)}　${esc(tw(m.at))}</span>`)}${td(esc(m.snippet) + "…")}</tr>`).join("");

  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:640px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#2f5a3a;margin-bottom:4px">每日總整理｜水松千樹之森 露營區</h2>
    <p style="margin:0 0 6px;color:#666">以下是目前需要您處理的事，沒列出的就是都處理好了。</p>
    ${section(`① 待對帳（${d.reported.length} 筆）`, "#2f5a3a", rowsRec, "客人已在網站回報匯款，請核對銀行明細。對帳完成後系統會自動寄「預約成功」信給客人。")}
    ${section(`② 客人用「留言」回報匯款（${d.viaMsg.length} 筆）`, "#b25a00", rowsViaMsg, "系統沒有自動標記，請看留言裡的末五碼，核對後到後台手動按「已付款」。")}
    ${section(`③ 待退款（${d.refundList.length} 筆）`, "#a33", rowsRefund, "客人已取消、依規則需要退款。請聯絡客人確認帳戶，匯款後到後台按「標記已退款」。")}
    ${section(`④ 還沒回覆的留言（${d.openMsgs.length} 則）`, "#2a5d8f", rowsMsg, "請到後台留言區回覆。")}
    ${section(`⑤ 近 24 小時新進訂單（${d.newOrders.length} 筆）`, "#555", rowsNew)}
    ${section(`⑥ 近 24 小時保留到期、營位已釋出（${d.expiredList.length} 筆）`, "#777", rowsExpired, "這些客人超過 24 小時沒匯款。很多人只是一時忙，之後還會回來，可以視情況電話關心一下。若系統的「到期邀請信」已開啟，客人也已收到邀請重新預約的信。")}
    <p style="margin-top:18px"><a href="${esc(site)}/admin.html" style="display:inline-block;background:#2f5a3a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">到後台處理</a></p>
    <p style="color:#999;font-size:12px">這是系統自動寄出的信件，每天一封；沒有任何待處理事項時不會寄信。</p>
  </div>`;
  const parts = [];
  if (d.reported.length + d.viaMsg.length) parts.push(`待對帳 ${d.reported.length + d.viaMsg.length}`);
  if (d.refundList.length) parts.push(`待退款 ${d.refundList.length}`);
  if (d.openMsgs.length) parts.push(`待回覆 ${d.openMsgs.length}`);
  if (d.newOrders.length) parts.push(`新訂單 ${d.newOrders.length}`);
  if ((d.expiredList || []).length) parts.push(`保留過期 ${d.expiredList.length}`);
  return { from: process.env.EMAIL_FROM, to: [ownerEmail], subject: `【每日總整理】${parts.join("・")}`, html };
}

export async function sendDailySummary({ dry = false } = {}) {
  const supabase = getSupabaseAdmin();
  const settings = await getSettings(supabase);
  const d = await collectDaily(supabase, settings);
  const counts = { newOrders: d.newOrders.length, toReconcile: d.reported.length, viaMsg: d.viaMsg.length, refunds: d.refundList.length, openMsgs: d.openMsgs.length, expired: (d.expiredList || []).length };
  const todo = counts.toReconcile + counts.viaMsg + counts.refunds + counts.openMsgs + counts.newOrders + counts.expired;
  if (!todo) return { ...counts, sent: false, reason: "none" };
  if (dry) return { ...counts, sent: false, reason: "dry" };
  if (!settings.owner_email) return { ...counts, sent: false, reason: "no_owner_email" };
  if (!emailConfigured()) return { ...counts, sent: false, reason: "not_configured" };
  const r = await postBatch([dailySummaryPayload(settings.owner_email, d, settings.site_url || SITE_DEFAULT)]);
  return { ...counts, sent: r.ok, reason: r.ok ? "sent" : "send_failed" };
}
