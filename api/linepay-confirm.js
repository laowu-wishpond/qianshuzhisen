// GET /api/linepay-confirm
// 這支是 LINE Pay 的 confirmUrl：訪客在 LINE Pay 頁面按下付款完成後，
// LINE Pay 會把使用者的瀏覽器導回這個網址，帶著 query string ?transactionId=...&orderId=...
//
// 重要：orderId、transactionId 都是使用者瀏覽器帶回來的，不能直接信任（有心人可以自己組網址）。
// 所以一定要：
// 1. 用 orderId（=我們自己的 booking id）去資料庫查出「當初這筆訂單真正的金額」
// 2. 拿這個金額去呼叫 LINE Pay 官方的 Confirm API，讓 LINE Pay 官方確認這筆交易確實付款成功、金額吻合
// 3. 只有 LINE Pay 官方回傳成功，才把訂單標記為已付款——不是只看網址參數就相信
//
// 處理完之後用 302 導回 booking.html，並帶上 ?linepay=success / fail 讓前端顯示對應訊息。

import { getSupabaseAdmin } from "../lib/supabase.js";
import { linePayFetch, LINEPAY_SANDBOX_CREDENTIALS } from "../lib/linepay.js";

export default async function handler(req, res) {
  const siteUrl = process.env.SITE_URL || "";
  const orderId = req.query.orderId;
  const transactionId = req.query.transactionId;

  function redirectWith(status) {
    res.writeHead(302, { Location: `${siteUrl}/booking.html?linepay=${status}` });
    res.end();
  }

  if (!orderId || !transactionId) {
    return redirectWith("fail");
  }

  const supabase = getSupabaseAdmin();

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, total_amount, payment_status")
    .eq("id", orderId)
    .eq("payment_method", "linepay")
    .maybeSingle();

  if (!booking) {
    console.error("linepay-confirm: 找不到對應訂單", orderId);
    return redirectWith("fail");
  }

  // 已經確認過付款成功就不用重複打 Confirm API（訪客重整頁面等情況）
  if (booking.payment_status === "paid") {
    return redirectWith("success");
  }

  const linepayEnv = process.env.LINEPAY_ENV === "production" ? "production" : "sandbox";
  const credentials = {
    channelId: process.env.LINEPAY_CHANNEL_ID || LINEPAY_SANDBOX_CREDENTIALS.channelId,
    channelSecret: process.env.LINEPAY_CHANNEL_SECRET || LINEPAY_SANDBOX_CREDENTIALS.channelSecret,
  };

  const { ok, data } = await linePayFetch(
    linepayEnv,
    credentials,
    `/v3/payments/${transactionId}/confirm`,
    { amount: booking.total_amount, currency: "TWD" }
  );

  const confirmed = ok && data.returnCode === "0000";

  await supabase.from("linepay_notifications").insert({
    booking_id: booking.id,
    transaction_id: String(transactionId),
    order_id: String(orderId),
    return_code: data.returnCode || null,
    return_message: data.returnMessage || null,
    confirmed,
    raw_payload: data,
  });

  if (confirmed) {
    await supabase
      .from("bookings")
      .update({
        payment_status: "paid",
        linepay_transaction_id: String(transactionId),
        linepay_paid_at: new Date().toISOString(),
      })
      .eq("id", booking.id);
    return redirectWith("success");
  }

  console.error("linepay-confirm: Confirm API 失敗", data);
  await supabase.from("bookings").update({ payment_status: "failed" }).eq("id", booking.id);
  return redirectWith("fail");
}
