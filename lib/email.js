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

export async function sendBookingConfirmed(b) {
  if (!b.customer_email) return { sent: false, reason: "no_email" };
  if (!emailConfigured()) return { sent: false, reason: "not_configured" };

  const nights = b.nights_count || 1;
  const total = Number(b.total_amount || 0).toLocaleString();
  const html = `
  <div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.7">
    <h2 style="color:#2f5a3a">預約成功｜水松千樹之森 露營區</h2>
    <p>${esc(b.customer_name)} 您好，</p>
    <p>我們已確認收到您的匯款，您的預約已成功。期待您來森林裡露營！</p>
    <table style="border-collapse:collapse;width:100%;margin:14px 0">
      <tr><td style="padding:6px 0;color:#666;width:96px">營位</td><td><strong>${esc(b.site_id || "—")}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#666">入住</td><td>${esc(b.check_in || b.booking_date)}</td></tr>
      <tr><td style="padding:6px 0;color:#666">退房</td><td>${esc(b.check_out || "")}（共 ${esc(nights)} 晚）</td></tr>
      ${b.early_arrival ? '<tr><td style="padding:6px 0;color:#666">夜衝</td><td>有（前一晚 18:00～22:00 進場）</td></tr>' : ""}
      <tr><td style="padding:6px 0;color:#666">入住人數</td><td>${esc(b.people_per_tent)} 人</td></tr>
      <tr><td style="padding:6px 0;color:#666">金額</td><td>NT$${esc(total)}</td></tr>
    </table>
    <p>地址：545 南投縣埔里鎮牛尾路 1-12 號後方（找不到的話導航「埔里地藏院」）<br>
    聯絡電話：0939-235-168</p>
    <p style="color:#666;font-size:14px">森林靜音時段為每日 22:00 至翌日 7:00，愛護森林，毛小孩的排泄物請自行清理。<br>
    如需更改或取消，請直接來電聯絡我們。</p>
    <p style="color:#999;font-size:12px">這是系統自動寄出的信件。</p>
  </div>`;
  const payload = {
    from: process.env.EMAIL_FROM,
    to: [b.customer_email],
    subject: "【預約成功】水松千樹之森 露營區 " + (b.check_in || b.booking_date) + " " + (b.site_id || ""),
    html,
  };
  if (process.env.EMAIL_BCC) payload.bcc = [process.env.EMAIL_BCC];

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
