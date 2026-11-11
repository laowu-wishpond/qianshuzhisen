// 未匯款提醒信：挑出要提醒的訂單、組信件、通知大哥。
// 信件寄送沿用 lib/email.js 的 Resend 設定（RESEND_API_KEY / EMAIL_FROM）。
import { stayInfo } from "./stay.js";
import { EXTEND_HOURS, MAX_EXTENSIONS } from "./siteStatus.js";

const HOUR = 3600 * 1000;

// 保留時間剩多久時寄「第一次提醒」。10 小時是因為夜間（23:00～07:00）不寄，
// 這樣不管幾點到期，到期前一定有白天的時段可以寄。
export const FIRST_REMINDER_HOURS = 10;
// 客人按了「再給我 6 小時」之後，快到期再寄一封最後提醒
export const FINAL_REMINDER_HOURS = 2;
export const QUIET_START = 23; // 台灣時間 23:00（含）～隔天 07:00（不含）不寄第一次提醒
export const QUIET_END = 7;

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function twClock(iso) {
  return new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function twHour(now) {
  return Number(new Date(now).toLocaleString("en-US", { timeZone: "Asia/Taipei", hour: "2-digit", hour12: false })) % 24;
}

export function isQuietHour(now) {
  const h = twHour(now);
  return h >= QUIET_START || h < QUIET_END;
}

const validEmail = (e) => typeof e === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());

// rows：目前「待匯款、保留中」的訂單。回傳 { first:[...], final:[...] }
export function pickDue(rows, now = new Date()) {
  const t = now.getTime();
  const quiet = isQuietHour(now);
  const first = [];
  const final = [];
  for (const b of rows) {
    if (b.payment_status !== "pending" || b.trashed || !b.hold_expires_at) continue;
    const left = new Date(b.hold_expires_at).getTime() - t;
    if (left <= 0) continue;
    if (!validEmail(b.customer_email)) continue;
    const extended = (b.hold_extensions || 0) > 0;
    if (extended && !b.final_reminder_sent_at && left <= FINAL_REMINDER_HOURS * HOUR) final.push(b);
    else if (!b.reminder_sent_at && left <= FIRST_REMINDER_HOURS * HOUR && !quiet) first.push(b);
  }
  return { first, final };
}

const BANK = "中國信託（822）敦北分行　帳號 015536772101　戶名 林長南";

function rowHtml(b) {
  const st = stayInfo(b);
  const dates = st.start ? st.start + " ～ " + st.end + (st.early ? "（含夜衝）" : "（" + st.nights + " 晚）") : esc(b.booking_date);
  return `<tr>
    <td style="padding:8px 6px;border-bottom:1px solid #eee;vertical-align:top"><strong>${esc(b.site_id || "—")}</strong><br><span style="color:#888;font-size:12px">編號 ${esc(String(b.id).slice(0, 8))}</span></td>
    <td style="padding:8px 6px;border-bottom:1px solid #eee;vertical-align:top">${esc(dates)}<br><span style="color:#555;font-size:13px">NT$${esc(Number(b.total_amount || 0).toLocaleString())}　保留到 <strong>${esc(twClock(b.hold_expires_at))}</strong></span></td>
  </tr>`;
}

function extendButton(site, b) {
  if ((b.hold_extensions || 0) >= MAX_EXTENSIONS) return "";
  const url = `${site}/extend.html?b=${encodeURIComponent(b.id)}`;
  return `<p style="margin:16px 0"><a href="${url}" style="display:inline-block;background:#2f5a3a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">還需要一點時間？再給我 ${EXTEND_HOURS} 小時</a><br>
  <span style="color:#777;font-size:13px">按一下，系統會自動多幫您保留 ${EXTEND_HOURS} 小時（每筆訂單可延長 ${MAX_EXTENSIONS} 次）。</span></p>`;
}

// 第一次提醒：同一個 email 底下的多筆訂單合成一封
export function reminderPayload(site, email, name, bookings) {
  const rows = bookings.map(rowHtml).join("");
  const buttons = bookings.length === 1 ? extendButton(site, bookings[0]) : "";
  const earliest = bookings.map((b) => b.hold_expires_at).sort()[0];
  const total = bookings.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#2f5a3a">營位保留提醒｜水松千樹之森 露營區</h2>
    <p>${esc(name || "")} 您好，</p>
    <p>提醒您：您預約的營位<strong>還沒收到匯款</strong>，目前保留到 <strong>${esc(twClock(earliest))}</strong>，過了這個時間系統會自動釋出營位。</p>
    <table style="border-collapse:collapse;width:100%;margin:10px 0">${rows}</table>
    <p><strong>匯款資料</strong>（應匯 NT$${esc(total.toLocaleString())}）<br>${BANK}</p>
    <p>匯款完成後，請到<a href="${site}/order.html?c=${esc(String(bookings[0].id).slice(0, 8))}">「查詢訂單」</a>頁回報匯款帳號<strong>末五碼</strong>，我們才能幫您對帳。</p>
    ${buttons}
    <p style="color:#666;font-size:14px">如果您已經匯款並回報過，請不用理會這封信；如果不需要這個營位了，也不用處理，時間到系統會自動釋出。<br>
    有任何問題請來電：0939-235-168</p>
    <p style="color:#999;font-size:12px">這是系統自動寄出的信件，請勿直接回覆。</p>
  </div>`;
  const payload = { from: process.env.EMAIL_FROM, to: [email], subject: "【提醒】您的營位還沒匯款，保留到 " + twClock(earliest) + "｜水松千樹之森", html };
  if (process.env.EMAIL_BCC) payload.bcc = [process.env.EMAIL_BCC];
  return payload;
}

// 客人延長之後的最後提醒（一筆一封）
export function finalReminderPayload(site, b) {
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#2f5a3a">最後提醒｜水松千樹之森 露營區</h2>
    <p>${esc(b.customer_name || "")} 您好，</p>
    <p>您延長保留的營位，<strong>再過不到 ${FINAL_REMINDER_HOURS} 小時（${esc(twClock(b.hold_expires_at))}）就會釋出</strong>，目前還沒收到匯款。</p>
    <table style="border-collapse:collapse;width:100%;margin:10px 0">${rowHtml(b)}</table>
    <p><strong>匯款資料</strong>（應匯 NT$${esc(Number(b.total_amount || 0).toLocaleString())}）<br>${BANK}</p>
    <p>匯款後請到<a href="${site}/order.html?c=${esc(String(b.id).slice(0, 8))}">「查詢訂單」</a>回報末五碼。若有急事請來電：0939-235-168</p>
    <p style="color:#999;font-size:12px">這是系統自動寄出的信件，請勿直接回覆。</p>
  </div>`;
  const payload = { from: process.env.EMAIL_FROM, to: [b.customer_email], subject: "【最後提醒】營位即將釋出｜水松千樹之森", html };
  if (process.env.EMAIL_BCC) payload.bcc = [process.env.EMAIL_BCC];
  return payload;
}

// 通知大哥：這幾位預約了、還沒匯款（系統已經寄提醒信給他們）
export function ownerDigestPayload(ownerEmail, reminded, totalPending) {
  const rows = reminded
    .sort((a, b) => String(a.hold_expires_at).localeCompare(String(b.hold_expires_at)))
    .slice(0, 60)
    .map((b) => {
      const st = stayInfo(b);
      return `<tr>
        <td style="padding:6px;border-bottom:1px solid #eee">${esc(b.customer_name || "")}<br><span style="color:#888;font-size:12px">${esc(b.customer_phone || "")}　編號 ${esc(String(b.id).slice(0, 8))}</span></td>
        <td style="padding:6px;border-bottom:1px solid #eee">${esc(b.site_id || "")}　${esc(st.start || "")}～${esc(st.end || "")}<br><span style="font-size:13px;color:#555">NT$${esc(Number(b.total_amount || 0).toLocaleString())}　保留到 ${esc(twClock(b.hold_expires_at))}</span></td>
      </tr>`;
    })
    .join("");
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:600px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#2f5a3a">這 ${reminded.length} 位客人預約了，還沒匯款</h2>
    <p>系統剛剛已經自動寄「匯款提醒信」給他們（保留時間快到了）。您不用做任何事，也可以自己打電話提醒。</p>
    <table style="border-collapse:collapse;width:100%;margin:10px 0">${rows}</table>
    <p style="color:#666;font-size:14px">目前全部還在保留、沒匯款的訂單共 ${totalPending} 筆。客人匯款回報後，會出現在後台等您對帳。</p>
    <p style="color:#999;font-size:12px">這是系統自動寄出的信件。</p>
  </div>`;
  return { from: process.env.EMAIL_FROM, to: [ownerEmail], subject: `【自動提醒】${reminded.length} 位客人預約了還沒匯款`, html };
}

// 客人按了「再給我 6 小時」→ 通知大哥
export function ownerExtendPayload(ownerEmail, b) {
  const st = stayInfo(b);
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#2f5a3a">客人要求多給 ${EXTEND_HOURS} 小時</h2>
    <p>${esc(b.customer_name || "")}（${esc(b.customer_phone || "")}）按了「再給我 ${EXTEND_HOURS} 小時」，系統已自動幫他多保留。</p>
    <p>營位 <strong>${esc(b.site_id || "")}</strong>　${esc(st.start || "")}～${esc(st.end || "")}　NT$${esc(Number(b.total_amount || 0).toLocaleString())}<br>
    新的保留時間：<strong>${esc(twClock(b.hold_expires_at))}</strong>　（訂單編號 ${esc(String(b.id).slice(0, 8))}）</p>
    <p style="color:#666;font-size:14px">您不用做任何事。如果不同意，可以到後台取消這筆訂單。</p>
    <p style="color:#999;font-size:12px">這是系統自動寄出的信件。</p>
  </div>`;
  return { from: process.env.EMAIL_FROM, to: [ownerEmail], subject: `【客人要求延長】${b.customer_name || ""} 多給 ${EXTEND_HOURS} 小時`, html };
}

export async function getSettings(supabase) {
  const { data } = await supabase.from("automation_settings").select("key, value");
  const out = {};
  for (const r of data || []) out[r.key] = r.value;
  return out;
}
