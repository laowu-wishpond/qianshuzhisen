// POST /api/ecpay-notify
// 這支是綠界的「ReturnURL」：使用者刷卡完成後，綠界的伺服器會直接呼叫這支通知付款結果
// （不是使用者的瀏覽器呼叫，所以看不到 loading，是背景的 server-to-server 通知）。
//
// 規則（綠界規定，不可更動）：
// - 收到後一定要驗證 CheckMacValue，確認資料真的是綠界送來、沒被竄改
// - 處理完一定要回應純文字 "1|OK"，否則綠界會重送，最多重送一段時間
//
// 部署設定：Vercel 的 Node serverless function 預設就會把
// application/x-www-form-urlencoded（綠界送過來的格式）解析進 req.body，不用額外設定。

import { getSupabaseAdmin } from "../lib/supabase.js";
import { verifyCheckMacValue, ECPAY_TEST_CREDENTIALS } from "../lib/ecpay.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).send("0|MethodNotAllowed");
    return;
  }

  const body = req.body || {};
  const hashKey = process.env.ECPAY_HASH_KEY || ECPAY_TEST_CREDENTIALS.HashKey;
  const hashIV = process.env.ECPAY_HASH_IV || ECPAY_TEST_CREDENTIALS.HashIV;

  const isValid = verifyCheckMacValue(body, hashKey, hashIV);

  const supabase = getSupabaseAdmin();

  // 先找對應的訂單（可能因為簽章有誤而找不到，仍要記錄下來方便查）
  let bookingId = null;
  if (body.MerchantTradeNo) {
    const { data: matched } = await supabase
      .from("bookings")
      .select("id")
      .eq("ecpay_merchant_trade_no", body.MerchantTradeNo)
      .maybeSingle();
    bookingId = matched?.id || null;
  }

  await supabase.from("ecpay_notifications").insert({
    booking_id: bookingId,
    merchant_trade_no: body.MerchantTradeNo || null,
    rtn_code: body.RtnCode ? String(body.RtnCode) : null,
    rtn_msg: body.RtnMsg || null,
    check_mac_valid: isValid,
    raw_payload: body,
  });

  if (!isValid) {
    console.error("ecpay-notify: CheckMacValue 驗證失敗", body);
    res.status(200).send("0|CheckMacValueError");
    return;
  }

  if (bookingId) {
    const paid = String(body.RtnCode) === "1";
    await supabase
      .from("bookings")
      .update({
        payment_status: paid ? "paid" : "failed",
        ecpay_trade_no: body.TradeNo || null,
        ecpay_payment_type: body.PaymentType || null,
        ecpay_paid_at: paid ? new Date().toISOString() : null,
      })
      .eq("id", bookingId);
  } else {
    console.error("ecpay-notify: 找不到對應訂單", body.MerchantTradeNo);
  }

  // 綠界規定：驗證成功一律回這個字串，不管付款結果是成功或失敗
  res.status(200).send("1|OK");
}
