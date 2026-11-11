// 「待對帳清單」email：把客人已匯款、還沒對帳的訂單整理成一封信寄給大哥。
//  A. 客人已在網站回報匯款末五碼、等大哥對帳（paid 且 payment_verified = false）；購物車整筆訂單合成一列、金額合計。
//  B. 訂單還在「等匯款」，但客人改用「留言」回報匯款（留言裡有訂單編號）→ 系統不會自動標記，容易漏掉，一併列出。
// 呼叫方式（排程金鑰驗證）：POST /api/cron-reminders?digest=reconcile　　加 &dry=1 只看內容不寄信。
import { getSupabaseAdmin } from "./supabase.js";
import { emailConfigured, postBatch } from "./email.js";
import { stayInfo } from "./stay.js";
import { getSettings } from "./reminders.js";

const SITE_DEFAULT = "https://www.tsforest.com.tw";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tw = (iso) => new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const COLS = "id, group_id, created_at, customer_name, customer_phone, site_id, check_in, check_out, nights_count, booking_date, early_arrival, total_amount, payment_status, payment_verified, transfer_last5, transfer_reported_at, hold_expires_at";

export async function collectUnreconciled(supabase) {
  const nowIso = new Date().toISOString();
  const { data: paid } = await supabase.from("bookings").select(COLS)
    .eq("payment_status", "paid").eq("payment_verified", false).eq("trashed", false).limit(500);
  const units = new Map();
  for (const b of paid || []) {
    const key = b.group_id || b.id;
    const st = stayInfo(b);
    if (!units.has(key)) units.set(key, { code: String(key).slice(0, 8), group: !!b.group_id, name: b.customer_name, phone: b.customer_phone, last5: b.transfer_last5 || "", reportedAt: b.transfer_reported_at, sites: [], start: st.start, end: st.end, total: 0 });
    const u = units.get(key);
    u.sites.push(b.site_id);
    u.total += Number(b.total_amount || 0);
    if (st.start && (!u.start || st.start < u.start)) u.start = st.start;
    if (st.end && st.end > u.end) u.end = st.end;
  }
  const reported = [...units.values()].sort((a, b) => String(a.reportedAt).localeCompare(String(b.reportedAt)));

  // B：還在等匯款，但留言裡有它的訂單編號（客人用留言回報匯款）
  const { data: pend } = await supabase.from("bookings").select(COLS)
    .eq("payment_status", "pending").eq("trashed", false).gt("hold_expires_at", nowIso).limit(1000);
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data: msgs } = await supabase.from("contact_messages").select("id, name, phone, message, created_at").gte("created_at", since).limit(300);
  const viaMsg = [];
  const seen = new Set();
  for (const b of pend || []) {
    const keys = [String(b.id).slice(0, 8), b.group_id ? String(b.group_id).slice(0, 8) : null].filter(Boolean);
    const m = (msgs || []).find((x) => keys.some((k) => String(x.message || "").toLowerCase().includes(k)));
    const uk = b.group_id || b.id;
    if (!m || seen.has(uk)) continue;
    seen.add(uk);
    const st = stayInfo(b);
    viaMsg.push({ code: String(uk).slice(0, 8), name: b.customer_name, phone: b.customer_phone, site: b.site_id, start: st.start, end: st.end, total: Number(b.total_amount || 0), snippet: String(m.message || "").replace(/\s+/g, " ").slice(0, 60), at: m.created_at });
  }
  return { reported, viaMsg };
}

export function reconcileDigestPayload(ownerEmail, { reported, viaMsg }, site = SITE_DEFAULT) {
  const rowA = reported.map((u) => `<tr>
      <td style="padding:6px;border-bottom:1px solid #eee">${esc(u.name)}<br><span style="color:#888;font-size:12px">${esc(u.phone)}　編號 ${esc(u.code)}</span></td>
      <td style="padding:6px;border-bottom:1px solid #eee">${esc(u.group ? "整筆 " + u.sites.length + " 個營位：" : "")}${esc(u.sites.join("、"))}<br><span style="font-size:13px;color:#555">${esc(u.start)}～${esc(u.end)}</span></td>
      <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap"><strong>NT$${esc(u.total.toLocaleString())}</strong><br><span style="font-size:13px;color:#555">末五碼 ${esc(u.last5)}</span></td>
    </tr>`).join("");
  const rowB = viaMsg.map((u) => `<tr>
      <td style="padding:6px;border-bottom:1px solid #eee">${esc(u.name)}<br><span style="color:#888;font-size:12px">${esc(u.phone)}　編號 ${esc(u.code)}</span></td>
      <td style="padding:6px;border-bottom:1px solid #eee">${esc(u.site)}　${esc(u.start)}～${esc(u.end)}<br><span style="font-size:13px;color:#555">留言：${esc(u.snippet)}…</span></td>
      <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap"><strong>NT$${esc(u.total.toLocaleString())}</strong></td>
    </tr>`).join("");
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:620px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#2f5a3a;margin-bottom:4px">待對帳清單</h2>
    <p style="margin:0 0 10px;color:#666">客人已經匯款了，請核對銀行明細。對帳完成後系統會自動寄「預約成功」信給客人。</p>
    ${reported.length ? `<h3 style="margin:14px 0 4px">① 客人已回報匯款，等您對帳（${reported.length} 筆）</h3><table style="border-collapse:collapse;width:100%">${rowA}</table>` : ""}
    ${viaMsg.length ? `<h3 style="margin:18px 0 4px;color:#b25a00">② 客人用「留言」回報匯款（${viaMsg.length} 筆）</h3><p style="margin:0 0 4px;color:#666;font-size:14px">這幾筆系統沒有自動標記，請看留言裡的末五碼，核對後到後台手動按「已付款」。</p><table style="border-collapse:collapse;width:100%">${rowB}</table>` : ""}
    <p style="margin-top:16px"><a href="${esc(site)}/admin.html" style="display:inline-block;background:#2f5a3a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">到後台對帳</a></p>
    <p style="color:#999;font-size:12px">這是系統自動寄出的信件。</p>
  </div>`;
  return { from: process.env.EMAIL_FROM, to: [ownerEmail], subject: `【待對帳】${reported.length + viaMsg.length} 筆客人已匯款，等您對帳`, html };
}

export async function sendReconcileDigest({ dry = false } = {}) {
  const supabase = getSupabaseAdmin();
  const settings = await getSettings(supabase);
  const data = await collectUnreconciled(supabase);
  const total = data.reported.length + data.viaMsg.length;
  const summary = { reported: data.reported.map((u) => ({ code: u.code, name: u.name, total: u.total, last5: u.last5 })), viaMsg: data.viaMsg.map((u) => ({ code: u.code, name: u.name, total: u.total })), sent: false };
  if (!total) return { ...summary, reason: "none" };
  if (dry) return { ...summary, reason: "dry" };
  if (!settings.owner_email) return { ...summary, reason: "no_owner_email" };
  if (!emailConfigured()) return { ...summary, reason: "not_configured" };
  const r = await postBatch([reconcileDigestPayload(settings.owner_email, data, settings.site_url || SITE_DEFAULT)]);
  return { ...summary, sent: r.ok, reason: r.ok ? "sent" : "send_failed" };
}
