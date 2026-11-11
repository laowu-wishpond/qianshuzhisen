import { stayInfo } from "./stay.js";
import { CHECK_IN_TIME, CHECK_OUT_TIME } from "./siteStatus.js";
// 預約成功 email（對帳完成後寄給客人）。
// 使用 Resend（https://resend.com）的 HTTP API，不需要額外套件。
// 需要在 Vercel 設定環境變數：
//   RESEND_API_KEY  → Resend 後台建立的 API Key
//   EMAIL_FROM      → 寄件人，例如：水松千樹之森 <booking@tsforest.com.tw>（網域要先在 Resend 驗證過）
//   EMAIL_BCC       → （選填）密件副本，例如大哥自己的信箱，方便留底
// 沒設定 RESEND_API_KEY 時不會寄、也不會報錯，後台會提示「尚未設定寄信」。

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function emailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function confirmedPayload(b) {
  const st = stayInfo(b);
  const nights = st.nights || 1;
  const total = Number(b.total_amount || 0).toLocaleString();
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#2f5a3a">預約成功｜水松千樹之森 露營區</h2>
    <p>${esc(b.customer_name)} 您好，</p>
    <p>我們已確認收到您的匯款，您的預約已成功。期待您來森林裡露營！</p>
    <table style="border-collapse:collapse;width:100%;margin:14px 0">
      <tr><td style="padding:6px 0;color:#666;width:96px">營位</td><td><strong>${esc(b.site_id || "—")}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#666">入住</td><td>${esc(st.start || b.booking_date)}${st.early ? "（夜衝進場）" : ""}</td></tr>
      <tr><td style="padding:6px 0;color:#666">入園時間</td><td><strong>${CHECK_IN_TIME} 起</strong></td></tr>
      <tr><td style="padding:6px 0;color:#666">退房時間</td><td><strong>退房日 ${CHECK_OUT_TIME} 前</strong></td></tr>
      <tr><td style="padding:6px 0;color:#666">退房</td><td>${esc(b.check_out || "")}（${st.early ? esc(nights + 1) + " 天 " + esc(nights) + " 夜，含夜衝" : "共 " + esc(nights) + " 晚"}）</td></tr>
      ${b.early_arrival ? '<tr><td style="padding:6px 0;color:#666">夜衝</td><td>有（入住日前一晚 18:00～22:00 進場）</td></tr>' : ""}
      <tr><td style="padding:6px 0;color:#666">入住人數</td><td>${esc(b.people_per_tent)} 人</td></tr>
      <tr><td style="padding:6px 0;color:#666">金額</td><td>NT$${esc(total)}</td></tr>
    </table>
    <p>地址：545 南投縣埔里鎮牛尾路 1-12 號後方（導航請搜尋「千樹之森旗艦露營場」）<br>
    聯絡電話：0939-235-168</p>
    <p style="color:#666;font-size:14px">森林靜音時段為每日 22:00 至翌日 7:00，愛護森林，毛小孩的排泄物請自行清理。<br>
    如需更改或取消，請直接來電聯絡我們。</p>
    <p style="color:#999;font-size:12px">這是系統自動寄出的信件。</p>
  </div>`;
  const payload = {
    from: process.env.EMAIL_FROM,
    to: [b.customer_email],
    subject: "【預約成功】水松千樹之森 露營區 " + (st.start || b.booking_date) + " " + (b.site_id || ""),
    html,
  };
  if (process.env.EMAIL_BCC) payload.bcc = [process.env.EMAIL_BCC];
  return payload;
}

export async function sendBookingConfirmed(b) {
  if (!b.customer_email) return { sent: false, reason: "no_email" };
  if (!emailConfigured()) return { sent: false, reason: "not_configured" };
  return postEmail(confirmedPayload(b));
}

async function postEmail(payload) {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("resend error:", r.status, t);
      return { sent: false, reason: "send_failed" };
    }
    return { sent: true };
  } catch (e) {
    console.error("resend exception:", e);
    return { sent: false, reason: "send_failed" };
  }
}

// 批次寄（Resend /emails/batch，一次最多 100 封）。回傳 { ok, error? }
export async function postBatch(payloads) {
  if (!payloads.length) return { ok: true };
  try {
    const r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(payloads),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("resend batch error:", r.status, t);
      return { ok: false, error: r.status + " " + t.slice(0, 200) };
    }
    return { ok: true };
  } catch (e) {
    console.error("resend batch exception:", e);
    return { ok: false, error: String(e.message || e) };
  }
}

// ---------- 「已收到您的預約」信（第一封；第二封才是對帳後的「預約成功」） ----------
const SITE = "https://www.tsforest.com.tw";
function twClock(iso) {
  return new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

// bookings：同一個 email 底下要通知的訂單（pending 或 paid 待對帳）
export function receivedPayload(email, name, bookings, nightsByBooking) {
  // 購物車整筆訂單（同一個 group 的多筆）→ 用整筆版的信
  if (bookings.length > 1 && bookings[0].group_id && bookings.every((b) => b.group_id === bookings[0].group_id)) {
    return receivedGroupPayload(email, name, bookings, nightsByBooking);
  }
  const anyPending = bookings.some((b) => b.payment_status === "pending");
  const anyReported = bookings.some((b) => b.payment_status === "paid" && !b.payment_verified);
  const rows = bookings.map((b) => {
    const st = stayInfo(b);
    const code = String(b.id).slice(0, 8);
    const dates = st.start ? st.start + " ～ " + st.end + (st.early ? "（" + st.days + " 天 " + st.nights + " 夜，含夜衝）" : "（" + st.nights + " 晚）") : esc(b.booking_date);
    let status;
    if (b.payment_status === "paid") status = "已收到您回報的匯款末五碼" + (b.transfer_last5 ? " " + b.transfer_last5 : "") + "，查帳中";
    else status = "尚未收到匯款，營位保留至 " + (b.hold_expires_at ? twClock(b.hold_expires_at) : "—");
    return `<tr>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;vertical-align:top"><strong>${esc(b.site_id || "—")}</strong><br><span style="color:#888;font-size:12px">編號 ${esc(code)}</span></td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;vertical-align:top">${esc(dates)}<br><span style="color:#555;font-size:13px">NT$${esc(Number(b.total_amount || 0).toLocaleString())}　${esc(status)}</span></td>
    </tr>`;
  }).join("");
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#2f5a3a">已收到您的預約｜水松千樹之森 露營區</h2>
    <p>${esc(name || "")} 您好，</p>
    <p>感謝您預約水松千樹之森！<strong>我們已經收到您的預約</strong>，下列營位已為您保留：</p>
    <table style="border-collapse:collapse;width:100%;margin:10px 0">${rows}</table>
    ${anyPending ? `<p><strong>如果您還沒匯款，可以安心匯款。</strong>請在上面標示的保留時間內完成匯款。<br>
    匯款資料：中國信託（822）敦北分行　帳號 015536772101　戶名 林長南<br>
    匯款後請到網站<a href="${SITE}/order.html">「查詢訂單」</a>頁（輸入訂單編號與電話），回報匯款帳號末五碼。</p>` : ""}
    <p>我們<strong>收到匯款、查帳完成後，會再寄一封「預約成功」的 email</strong>給您，那封信才代表預約完成、營位確定保留。</p>
    <p>您可以隨時到<a href="${SITE}/order.html">「查詢訂單」</a>頁，用訂單編號加電話查看目前狀態。</p>
    <p style="background:#f3f8f1;border-left:4px solid #2f5a3a;padding:8px 12px"><strong>入園時間 ${CHECK_IN_TIME}　｜　退房時間 隔天 ${CHECK_OUT_TIME}</strong></p>
    <p style="color:#666;font-size:14px">地址：545 南投縣埔里鎮牛尾路 1-12 號後方（導航請搜尋「千樹之森旗艦露營場」）<br>聯絡電話：0939-235-168</p>
    <p style="color:#999;font-size:12px">這是系統自動寄出的信件，請勿直接回覆。</p>
  </div>`;
  const payload = {
    from: process.env.EMAIL_FROM,
    to: [email],
    subject: "【已收到您的預約】水松千樹之森 露營區",
    html,
  };
  if (process.env.EMAIL_BCC) payload.bcc = [process.env.EMAIL_BCC];
  return payload;
}

export async function sendBookingReceived(b) {
  if (!b.customer_email) return { sent: false, reason: "no_email" };
  if (!emailConfigured()) return { sent: false, reason: "not_configured" };
  return postEmail(receivedPayload(b.customer_email, b.customer_name, [b]));
}

// 留言自動回覆內容（客人送出留言後，頁面上會顯示這段；有留 email 的話也會寄一封）
export const AUTO_REPLY_ZH = "親愛的顧客您好，已經收到您的訊息，我們會盡快回復您，感謝您的耐心等候。";
export const AUTO_REPLY_EN = "Dear guest, we have received your message and will reply as soon as possible. Thank you for your patience.";

export async function sendMessageAutoReply({ email, name }) {
  if (!email) return { sent: false, reason: "no_email" };
  if (!emailConfigured()) return { sent: false, reason: "not_configured" };
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#2f5a3a">水松千樹之森 露營區</h2>
    <p>${esc(AUTO_REPLY_ZH)}</p>
    <p style="color:#666;font-size:14px">急事也可以直接來電：0939-235-168</p>
    <p style="color:#999;font-size:12px">這是系統自動寄出的信件，請勿直接回覆。</p>
  </div>`;
  const payload = { from: process.env.EMAIL_FROM, to: [email], subject: "已收到您的訊息｜水松千樹之森 露營區", html };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) { console.error("resend auto-reply error:", r.status, await r.text()); return { sent: false, reason: "send_failed" }; }
    return { sent: true };
  } catch (e) {
    console.error("resend auto-reply exception:", e);
    return { sent: false, reason: "send_failed" };
  }
}


// ---------- 購物車整筆訂單（一次結帳多個營位）的信 ----------
const mdOf = (d) => { const m = String(d || "").match(/(\d+)-(\d+)-(\d+)/); return m ? `${+m[2]}/${+m[3]}` : ""; };
const BANK_LINE = "中國信託（822）敦北分行　帳號 015536772101　戶名 林長南";

// 每個營位一個區塊：營位、住宿期間、「每一晚的日期＋平日／假日＋金額」、小計
function groupItemsHtml(bookings, nightsByBooking) {
  return bookings
    .slice()
    .sort((a, b) => String(a.check_in).localeCompare(String(b.check_in)) || String(a.site_id).localeCompare(String(b.site_id)))
    .map((b) => {
      const st = stayInfo(b);
      const nights = (nightsByBooking && nightsByBooking.get(b.id)) || [];
      const lines = nights.length
        ? nights.map((n) => `<tr><td style="padding:2px 0;color:#555">${esc(mdOf(n.night_date))}　${n.kind === "early" ? "夜衝（前一晚 18:00～22:00 進場）" : n.day_type === "holiday" ? "假日" : "平日"}</td><td style="padding:2px 0;text-align:right">NT$${esc(Number(n.price).toLocaleString())}</td></tr>`).join("")
        : "";
      return `<div style="border:1px solid #dfe8df;border-radius:8px;padding:10px 12px;margin:10px 0">
        <div><strong style="font-size:16px">${esc(b.site_id || "—")} 營位</strong>　<span style="color:#666">${esc(st.start)} ～ ${esc(st.end)}（${st.early ? esc(st.days) + " 天 " + esc(st.nights) + " 夜，含夜衝" : esc(st.nights) + " 晚"}）</span></div>
        ${lines ? `<table style="border-collapse:collapse;width:100%;margin-top:6px;font-size:14px">${lines}</table>` : ""}
        <div style="text-align:right;margin-top:6px;border-top:1px dashed #cfd9cf;padding-top:4px">小計　<strong>NT$${esc(Number(b.total_amount || 0).toLocaleString())}</strong></div>
      </div>`;
    }).join("");
}

export function receivedGroupPayload(email, name, bookings, nightsByBooking) {
  const total = bookings.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const gcode = String(bookings[0].group_id).slice(0, 8);
  const anyPending = bookings.some((b) => b.payment_status === "pending");
  const holds = bookings.map((b) => b.hold_expires_at).filter(Boolean).sort();
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#2f5a3a">已收到您的預約｜水松千樹之森 露營區</h2>
    <p>${esc(name || "")} 您好，</p>
    <p>感謝您預約水松千樹之森！<strong>我們已經收到您的整筆訂單</strong>（共 ${bookings.length} 個營位），訂單編號 <strong style="font-size:18px;letter-spacing:1px">${esc(gcode)}</strong>。</p>
    ${groupItemsHtml(bookings, nightsByBooking)}
    <p style="font-size:17px;text-align:right;margin:8px 0">應匯款合計　<strong>NT$${esc(total.toLocaleString())}</strong></p>
    ${anyPending ? `<p>請在 <strong>${esc(holds[0] ? twClock(holds[0]) : "—")}</strong> 前，<strong>一次匯款 NT$${esc(total.toLocaleString())}</strong>：<br>${BANK_LINE}<br>
    匯款後請到<a href="${SITE}/order.html?c=${esc(gcode)}">「查詢訂單」</a>頁（輸入訂單編號 ${esc(gcode)} 與電話），回報匯款帳號<strong>末五碼</strong>，整筆訂單只要回報一次。</p>` : ""}
    <p>我們<strong>收到匯款、查帳完成後，會再寄一封「預約成功」的 email</strong>給您，那封信才代表預約完成、營位確定保留。</p>
    <p style="color:#666;font-size:14px">入園時間 ${CHECK_IN_TIME} 起，退房隔天 ${CHECK_OUT_TIME} 前。<br>地址：545 南投縣埔里鎮牛尾路 1-12 號後方（導航請搜尋「千樹之森旗艦露營場」）<br>聯絡電話：0939-235-168</p>
    <p style="color:#999;font-size:12px">這是系統自動寄出的信件，請勿直接回覆。</p>
  </div>`;
  const payload = { from: process.env.EMAIL_FROM, to: [email], subject: `【已收到您的預約】${bookings.length} 個營位，合計 NT$${total.toLocaleString()}｜水松千樹之森`, html };
  if (process.env.EMAIL_BCC) payload.bcc = [process.env.EMAIL_BCC];
  return payload;
}

export function confirmedGroupPayload(bookings, nightsByBooking) {
  const total = bookings.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const gcode = String(bookings[0].group_id).slice(0, 8);
  const b0 = bookings[0];
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#2f5a3a">預約成功｜水松千樹之森 露營區</h2>
    <p>${esc(b0.customer_name)} 您好，</p>
    <p>我們已確認收到您的匯款，您的 <strong>${bookings.length} 個營位</strong>預約已成功（訂單編號 <strong>${esc(gcode)}</strong>）。期待您來森林裡露營！</p>
    ${groupItemsHtml(bookings, nightsByBooking)}
    <p style="font-size:17px;text-align:right;margin:8px 0">已收款合計　<strong>NT$${esc(total.toLocaleString())}</strong></p>
    <p style="background:#f3f8f1;border-left:4px solid #2f5a3a;padding:8px 12px"><strong>入園時間 ${CHECK_IN_TIME}　｜　退房時間 隔天 ${CHECK_OUT_TIME}</strong></p>
    <p>地址：545 南投縣埔里鎮牛尾路 1-12 號後方（導航請搜尋「千樹之森旗艦露營場」）<br>聯絡電話：0939-235-168</p>
    <p style="color:#666;font-size:14px">森林靜音時段為每日 22:00 至翌日 7:00，愛護森林，毛小孩的排泄物請自行清理。<br>如需更改或取消，請直接來電聯絡我們。</p>
    <p style="color:#999;font-size:12px">這是系統自動寄出的信件。</p>
  </div>`;
  const payload = { from: process.env.EMAIL_FROM, to: [b0.customer_email], subject: `【預約成功】水松千樹之森 露營區 ${bookings.length} 個營位（訂單 ${gcode}）`, html };
  if (process.env.EMAIL_BCC) payload.bcc = [process.env.EMAIL_BCC];
  return payload;
}

// 一次結帳（可能是 1 個、也可能是多個營位）寄「已收到您的預約」
export async function sendBookingReceivedGroup(bookings, nightsByBooking) {
  const b0 = bookings[0];
  if (!b0.customer_email) return { sent: false, reason: "no_email" };
  if (!emailConfigured()) return { sent: false, reason: "not_configured" };
  return postEmail(receivedPayload(b0.customer_email, b0.customer_name, bookings, nightsByBooking));
}

// 整筆訂單對帳完成 → 寄一封「預約成功」（只有一筆時就用原本那封）
export async function sendGroupConfirmed(bookings, nightsByBooking) {
  const b0 = bookings[0];
  if (!b0.customer_email) return { sent: false, reason: "no_email" };
  if (!emailConfigured()) return { sent: false, reason: "not_configured" };
  if (bookings.length === 1) return postEmail(confirmedPayload(b0));
  return postEmail(confirmedGroupPayload(bookings, nightsByBooking));
}
