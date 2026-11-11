// 未匯款提醒信：挑出要提醒的訂單、組信件、通知大哥。
// 信件寄送沿用 lib/email.js 的 Resend 設定（RESEND_API_KEY / EMAIL_FROM）。
import { stayInfo } from "./stay.js";
import { EXTEND_HOURS, MAX_EXTENSIONS, CHECK_IN_TIME, CHECK_OUT_TIME } from "./siteStatus.js";

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
// 購物車整筆訂單（同一個 group 的多筆）：整筆編號、整筆一個「再給我 6 小時」
function sameGroup(list) {
  return list.length > 1 && !!list[0].group_id && list.every((b) => b.group_id === list[0].group_id);
}

export function reminderPayload(site, email, name, bookings) {
  const rows = bookings.map(rowHtml).join("");
  const grouped = sameGroup(bookings);
  const orderCode = String((grouped ? bookings[0].group_id : bookings[0].id)).slice(0, 8);
  const buttons = bookings.length === 1
    ? extendButton(site, bookings[0])
    : grouped
      ? extendButton(site, { id: bookings[0].group_id, hold_extensions: Math.max(...bookings.map((b) => b.hold_extensions || 0)) })
      : "";
  const earliest = bookings.map((b) => b.hold_expires_at).sort()[0];
  const total = bookings.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#2f5a3a">營位保留提醒｜水松千樹之森 露營區</h2>
    <p>${esc(name || "")} 您好，</p>
    <p>提醒您：您預約的營位<strong>還沒收到匯款</strong>，目前保留到 <strong>${esc(twClock(earliest))}</strong>，過了這個時間系統會自動釋出營位。</p>
    <table style="border-collapse:collapse;width:100%;margin:10px 0">${rows}</table>
    <p><strong>匯款資料</strong>（應匯 NT$${esc(total.toLocaleString())}）<br>${BANK}</p>
    <p>匯款完成後，請到<a href="${site}/order.html?c=${esc(orderCode)}">「查詢訂單」</a>頁（訂單編號 ${esc(orderCode)}）回報匯款帳號<strong>末五碼</strong>，我們才能幫您對帳。${grouped ? "整筆訂單只要回報一次。" : ""}</p>
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
export function finalReminderPayload(site, bOrList) {
  const list = Array.isArray(bOrList) ? bOrList : [bOrList];
  const b = list[0];
  const grouped = sameGroup(list);
  const orderCode = String(grouped ? b.group_id : b.id).slice(0, 8);
  const totalAmt = list.reduce((s2, x) => s2 + Number(x.total_amount || 0), 0);
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#2f5a3a">最後提醒｜水松千樹之森 露營區</h2>
    <p>${esc(b.customer_name || "")} 您好，</p>
    <p>您延長保留的營位，<strong>再過不到 ${FINAL_REMINDER_HOURS} 小時（${esc(twClock(b.hold_expires_at))}）就會釋出</strong>，目前還沒收到匯款。</p>
    <table style="border-collapse:collapse;width:100%;margin:10px 0">${list.map(rowHtml).join("")}</table>
    <p><strong>匯款資料</strong>（應匯 NT$${esc(totalAmt.toLocaleString())}）<br>${BANK}</p>
    <p>匯款後請到<a href="${site}/order.html?c=${esc(orderCode)}">「查詢訂單」</a>回報末五碼。若有急事請來電：0939-235-168</p>
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

// ---------- 入住前提醒信（⑥） ----------
// 付款對帳完成的客人，在「第一晚（含夜衝）」前 N 天（預設 2 天）寄一封：地址導航、入園前確認清單。
// 這封信同時是入園檢查標準：入住時管家會依這份清單跟客人確認。
// 預設關閉，要到 automation_settings 把 checkin_enabled 改成 true 才會寄（等大哥確認內容與入園／退房時間）。

export function twDate(now = new Date()) {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

function daysBetween(a, b) {
  return Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);
}

// rows：已對帳完成、有 email、還沒寄過入住前提醒的訂單
export function pickCheckin(rows, now = new Date(), daysBefore = 2) {
  if (isQuietHour(now)) return [];
  const today = twDate(now);
  const out = [];
  for (const b of rows) {
    if (b.payment_status !== "paid" || !b.payment_verified || b.trashed || b.checkin_reminder_sent_at) continue;
    if (!validEmail(b.customer_email)) continue;
    const start = stayInfo(b).start;
    if (!start) continue;
    const d = daysBetween(today, start);
    if (d >= 0 && d <= daysBefore) out.push(b);
  }
  return out;
}

const MAP_URL = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("千樹之森旗艦露營場 南投縣埔里鎮牛尾路1-12號");

export function checkinPayload(site, b, settings = {}) {
  const st = stayInfo(b);
  const nights = st.nights || 1;
  const timeRows = [];
  timeRows.push(`<tr><td style="padding:6px 0;color:#666;width:96px">入園時間</td><td><strong>${esc(settings.checkin_time || CHECK_IN_TIME)} 起</strong></td></tr>`);
  timeRows.push(`<tr><td style="padding:6px 0;color:#666">退房時間</td><td><strong>退房日 ${esc(settings.checkout_time || CHECK_OUT_TIME)} 前</strong></td></tr>`);
  const check = (t) => `<tr><td style="padding:5px 8px 5px 0;vertical-align:top;font-size:18px">☐</td><td style="padding:5px 0">${t}</td></tr>`;
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#2f5a3a">入住前提醒｜水松千樹之森 露營區</h2>
    <p>${esc(b.customer_name || "")} 您好，</p>
    <p>您預約的營位就快到了，我們已經準備好迎接您！出發前請花 1 分鐘看一下這封信，<strong>入園時我們也會依下面的清單跟您確認</strong>。</p>
    <table style="border-collapse:collapse;width:100%;margin:12px 0">
      <tr><td style="padding:6px 0;color:#666;width:96px">營位</td><td><strong>${esc(b.site_id || "—")}</strong>（訂單編號 ${esc(String(b.id).slice(0, 8))}）</td></tr>
      <tr><td style="padding:6px 0;color:#666">入住</td><td>${esc(st.start || b.booking_date)}${st.early ? "（夜衝，<strong>18:00～22:00 進場</strong>）" : ""}</td></tr>
      <tr><td style="padding:6px 0;color:#666">退房</td><td>${esc(b.check_out || "")}（${st.early ? esc(nights + 1) + " 天 " + esc(nights) + " 夜，含夜衝" : "共 " + esc(nights) + " 晚"}）</td></tr>
      ${timeRows.join("")}
    </table>
    <h3 style="color:#2f5a3a;margin:18px 0 4px">怎麼找到我們</h3>
    <p style="margin:0">地址：545 南投縣埔里鎮牛尾路 1-12 號後方<br>
    Google 地圖請搜尋「<strong>千樹之森旗艦露營場</strong>」，<a href="${MAP_URL}">點這裡直接開啟導航</a>。<br>
    國道 6 號下「愛蘭交流道」，山區路段會車請放慢車速。<br>
    入口有<strong>原木圍籬、「千樹之森 FOREST RETREAT」木牌，旁邊有一顆大石頭</strong>，沿著碎石路往林間走。<br>
    <a href="${site}/directions.html">看入口照片</a>　｜　山上訊號偶爾不穩，建議出發前先下載離線地圖。</p>
    <h3 style="color:#2f5a3a;margin:18px 0 4px">入園前請確認（入園時我們會跟您一起看）</h3>
    <table style="border-collapse:collapse;width:100%">
      ${check("我們是<strong>自帶帳篷</strong>露營（園區提供營位、公共衛浴、不斷電供電，不出租帳篷）")}
      ${check("營位是整塊出租，<strong>不限帳數</strong>，但請確認實際入住人數與預約時填的一致")}
      ${check("森林靜音時段是 <strong>22:00 到隔天 07:00</strong>，不使用 KTV、大型音響等設備")}
      ${check("<strong>不使用高耗電設備</strong>：移動式冷氣、電暖器、電磁爐、微波爐、大型烤箱")}
      ${check("愛護森林：不攀折花木、不亂挖地面，營釘請依指定位置施作，不餵食野生動物")}
      ${check("垃圾請分類；毛小孩的排泄物請自行清理")}
      ${check("入住時，我們會請您與同行旅人一起閱讀並簽署《森林公約》（<a href=\"" + site + "/forest-covenant.html\">事先看一遍</a>會更快）")}
    </table>
    <h3 style="color:#2f5a3a;margin:18px 0 4px">小提醒</h3>
    <p style="margin:0">・山上早晚溫差大，請帶保暖衣物與照明。<br>
    ・如遇颱風、豪雨等天災，我們會主動聯絡您；有疑問也歡迎隨時來電。<br>
    ・到達時請說「<strong>${esc(b.customer_name || "訂位姓名")}</strong>」或訂單編號 <strong>${esc(String(b.id).slice(0, 8))}</strong>，我們幫您確認營位。</p>
    <p style="margin-top:16px">聯絡電話：<a href="tel:0939235168">0939-235-168</a></p>
    <p style="color:#999;font-size:12px">這是系統自動寄出的信件，請勿直接回覆。</p>
  </div>`;
  const payload = { from: process.env.EMAIL_FROM, to: [b.customer_email], subject: "【入住前提醒】" + (st.start || b.booking_date) + " " + (b.site_id || "") + "｜水松千樹之森", html };
  if (process.env.EMAIL_BCC) payload.bcc = [process.env.EMAIL_BCC];
  return payload;
}
