// POST /api/create-booking
// booking.html 表單送出時呼叫這支。負責：
// 1. 伺服器端重新計算金額（不信任前端傳來的金額，避免被竄改）
// 2. 寫入 Supabase 的 bookings 表
// 3. 如果付款方式是「線上刷卡」，回傳綠界 AioCheckOut 所需的參數，讓前端組表單自動送到綠界收銀台
//    如果是「銀行匯款」，直接回傳金額，前端顯示既有的匯款須知

import { getSupabaseAdmin } from "../lib/supabase.js";
import { calcTentPrice } from "../lib/pricing.js";
import {
  genCheckMacValue,
  formatMerchantTradeDate,
  ECPAY_TEST_CREDENTIALS,
  ECPAY_AIO_CHECKOUT_URL,
} from "../lib/ecpay.js";
import { linePayFetch, LINEPAY_SANDBOX_CREDENTIALS } from "../lib/linepay.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, phone, email, bookingDate, tents, people, paymentMethod, notes } =
    req.body || {};

  if (!name || !phone || !bookingDate || !tents || !people) {
    return res.status(400).json({ error: "缺少必要欄位（姓名、電話、日期、帳篷數、人數）" });
  }

  // 簡單擋一下日期格式，booking.js 會傳 YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
    return res.status(400).json({ error: "日期格式錯誤" });
  }

  const { tents: tentsCount, people: peopleCount, perTent, total } = calcTentPrice(
    tents,
    people
  );
  const method = paymentMethod === "ecpay" || paymentMethod === "linepay" ? paymentMethod : "bank_transfer";

  const supabase = getSupabaseAdmin();

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      customer_name: String(name).trim(),
      customer_phone: String(phone).trim(),
      customer_email: email ? String(email).trim() : null,
      booking_date: bookingDate,
      tents_count: tentsCount,
      people_per_tent: peopleCount,
      per_tent_price: perTent,
      total_amount: total,
      payment_method: method,
      payment_status: "pending",
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    console.error("create-booking insert error:", error);
    return res.status(500).json({ error: "訂單建立失敗，請稍後再試或直接致電營主" });
  }

  if (method === "bank_transfer") {
    return res.status(200).json({
      bookingId: booking.id,
      paymentMethod: "bank_transfer",
      totalAmount: total,
    });
  }

  const siteUrlCommon = process.env.SITE_URL; // 例如 https://qianshuzhisen.vercel.app（不要有結尾斜線）
  if (!siteUrlCommon) {
    return res.status(500).json({ error: "後端尚未設定 SITE_URL 環境變數" });
  }

  if (method === "linepay") {
    // ---- LINE Pay Online：呼叫 Request API 取得付款頁面網址 ----
    const linepayEnv = process.env.LINEPAY_ENV === "production" ? "production" : "sandbox";
    const credentials = {
      channelId: process.env.LINEPAY_CHANNEL_ID || LINEPAY_SANDBOX_CREDENTIALS.channelId,
      channelSecret: process.env.LINEPAY_CHANNEL_SECRET || LINEPAY_SANDBOX_CREDENTIALS.channelSecret,
    };

    const itemName = `露營帳篷 x${tentsCount}（每帳${peopleCount}人）`;

    const { ok, data } = await linePayFetch(linepayEnv, credentials, "/v3/payments/request", {
      amount: total,
      currency: "TWD",
      orderId: booking.id,
      packages: [
        {
          id: "camping",
          amount: total,
          name: "水松千樹之森 露營區訂位",
          products: [{ name: itemName, quantity: 1, price: total }],
        },
      ],
      redirectUrls: {
        confirmUrl: `${siteUrlCommon}/api/linepay-confirm`,
        cancelUrl: `${siteUrlCommon}/booking.html?linepay=cancel`,
      },
    });

    if (!ok || data.returnCode !== "0000") {
      console.error("linepay request failed:", data);
      return res.status(502).json({ error: "LINE Pay 建立付款失敗，請稍後再試或改用其他付款方式" });
    }

    await supabase
      .from("bookings")
      .update({ linepay_order_id: booking.id, linepay_transaction_id: String(data.info.transactionId) })
      .eq("id", booking.id);

    return res.status(200).json({
      bookingId: booking.id,
      paymentMethod: "linepay",
      linepayUrl: data.info.paymentUrl.web,
    });
  }

  // ---- 綠界線上刷卡：組 AioCheckOut 參數 ----
  // MerchantTradeNo 限制：只能英數字，20 字元內
  const merchantTradeNo = ("QSZS" + booking.id.replace(/-/g, "")).slice(0, 20);

  const siteUrl = process.env.SITE_URL; // 例如 https://qianshuzhisen.vercel.app（不要有結尾斜線）
  if (!siteUrl) {
    return res.status(500).json({ error: "後端尚未設定 SITE_URL 環境變數" });
  }

  const isProd = process.env.ECPAY_ENV === "production";
  const merchantID = process.env.ECPAY_MERCHANT_ID || ECPAY_TEST_CREDENTIALS.MerchantID;
  const hashKey = process.env.ECPAY_HASH_KEY || ECPAY_TEST_CREDENTIALS.HashKey;
  const hashIV = process.env.ECPAY_HASH_IV || ECPAY_TEST_CREDENTIALS.HashIV;

  const params = {
    MerchantID: merchantID,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: formatMerchantTradeDate(),
    PaymentType: "aio",
    TotalAmount: total,
    TradeDesc: "水松千樹之森露營區訂位",
    ItemName: `露營帳篷 x${tentsCount}（每帳${peopleCount}人）`,
    ReturnURL: `${siteUrl}/api/ecpay-notify`,
    ClientBackURL: `${siteUrl}/booking.html?status=return`,
    ChoosePayment: "Credit",
    EncryptType: 1,
  };

  params.CheckMacValue = genCheckMacValue(params, hashKey, hashIV);

  await supabase
    .from("bookings")
    .update({ ecpay_merchant_trade_no: merchantTradeNo })
    .eq("id", booking.id);

  return res.status(200).json({
    bookingId: booking.id,
    paymentMethod: "ecpay",
    ecpayAction: isProd ? ECPAY_AIO_CHECKOUT_URL.production : ECPAY_AIO_CHECKOUT_URL.stage,
    ecpayParams: params,
  });
}
