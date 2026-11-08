// POST /api/create-booking
// booking.html 表單送出時呼叫這支。負責：
// 1. 依營位／日期在伺服器端重新計算金額（不信任前端傳來的金額，避免被竄改）
// 2. 寫入 Supabase 的 bookings 表與 booking_nights 表（每個營位×每一晚佔一列，防止重複預約）
// 3. 如果付款方式是「線上刷卡」，回傳綠界 AioCheckOut 所需的參數，讓前端組表單自動送到綠界收銀台
//    如果是「銀行匯款」，直接回傳金額，前端顯示既有的匯款須知

import { getSupabaseAdmin } from "../lib/supabase.js";
import { isBookingOpen, HOLD_MINUTES } from "../lib/siteStatus.js";
import { quoteStay, getSite, addDays, isValidISODate } from "../lib/pricing.js";
import {
  genCheckMacValue,
  formatMerchantTradeDate,
  ECPAY_TEST_CREDENTIALS,
  ECPAY_AIO_CHECKOUT_URL,
} from "../lib/ecpay.js";
import { linePayFetch, LINEPAY_SANDBOX_CREDENTIALS } from "../lib/linepay.js";

// 台灣今天的日期（YYYY-MM-DD）。伺服器在 UTC 時區，不能直接用 new Date().toISOString()
function todayInTaipei() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 還沒到開放預約的時間：一律拒絕新訂單（開放時間在 lib/siteStatus.js，由伺服器的時鐘判斷）
  if (!isBookingOpen(new Date(), req.headers.cookie || "")) {
    return res.status(503).json({ error: "線上預約尚未開放，開放後即可預約。" });
  }

  const { name, phone, email, siteId, checkIn, checkOut, earlyArrival, people, paymentMethod, notes } =
    req.body || {};

  if (!name || !phone || !siteId || !checkIn || !checkOut || !people) {
    return res.status(400).json({ error: "缺少必要欄位（姓名、電話、營位、入住／退房日期、入住人數）" });
  }
  if (!isValidISODate(checkIn) || !isValidISODate(checkOut)) {
    return res.status(400).json({ error: "日期格式錯誤" });
  }

  const site = getSite(siteId);
  if (!site) {
    return res.status(400).json({ error: "找不到這個營位" });
  }

  const peopleCount = parseInt(people, 10);
  if (!(peopleCount >= 1) || peopleCount > 60) {
    return res.status(400).json({ error: "請填入住人數（1～60 人）" });
  }

  const today = todayInTaipei();
  if (checkIn > addDays(today, 730)) {
    return res.status(400).json({ error: "只開放預訂兩年內的日期" });
  }

  // 伺服器端重新計價，不信任前端傳來的任何金額
  const early = earlyArrival === true || earlyArrival === "true";
  const quote = quoteStay({ siteId, checkIn, checkOut, earlyArrival: early, today });
  if (!quote.ok) {
    return res.status(400).json({ error: quote.error });
  }
  const total = quote.total;
  const nightsCount = quote.nights.length;
  // 目前只開放銀行匯款（綠界、LINE Pay 尚未開通，之後開通再改回來）
  const method = "bank_transfer";

  const supabase = getSupabaseAdmin();
  // 先把逾時沒回報匯款的保留單釋出，營位才會即時空出來給下一位
  await supabase.rpc("expire_stale_holds");

  // 先檢查這個營位在這幾晚（含夜衝那一晚）有沒有人佔用。
  // 真正防止重複預約的是資料庫的唯一索引（見 migration），這裡先擋是為了給客人清楚的提示。
  const wantedDates = quote.nights.map((n) => n.date);
  if (quote.early) wantedDates.push(quote.early.date);

  const { data: taken, error: takenError } = await supabase
    .from("booking_nights")
    .select("night_date")
    .eq("site_id", siteId)
    .eq("is_active", true)
    .in("night_date", wantedDates);

  if (takenError) {
    console.error("create-booking availability check error:", takenError);
    return res.status(500).json({ error: "查詢空位失敗，請稍後再試或直接致電營主" });
  }
  if (taken && taken.length) {
    return res.status(409).json({
      error: `${siteId} 營位在 ${taken.map((t) => t.night_date).sort().join("、")} 已被預訂，請改選其他營位或日期`,
    });
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      customer_name: String(name).trim(),
      customer_phone: String(phone).trim(),
      customer_email: email ? String(email).trim() : null,
      booking_date: checkIn,
      site_id: siteId,
      check_in: checkIn,
      check_out: checkOut,
      nights_count: nightsCount,
      early_arrival: !!quote.early,
      tents_count: 1, // 不再收帳數（每人帶的帳篷大小不同），固定填 1 以符合資料表
      people_per_tent: peopleCount,
      per_tent_price: null,
      total_amount: total,
      payment_method: method,
      payment_status: "pending",
      hold_expires_at: new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString(),
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    console.error("create-booking insert error:", error);
    return res.status(500).json({ error: "訂單建立失敗，請稍後再試或直接致電營主" });
  }

  const nightRows = quote.nights.map((n) => ({
    booking_id: booking.id,
    site_id: siteId,
    night_date: n.date,
    kind: "regular",
    day_type: n.type,
    price: n.price,
  }));
  if (quote.early) {
    nightRows.push({
      booking_id: booking.id,
      site_id: siteId,
      night_date: quote.early.date,
      kind: "early",
      day_type: "early",
      price: quote.early.price,
    });
  }

  const { error: nightsError } = await supabase.from("booking_nights").insert(nightRows);
  if (nightsError) {
    // 訂單沒辦法佔到營位（例如兩個人同時搶同一晚，後送出的被資料庫唯一索引擋下），整筆撤銷
    await supabase.from("bookings").delete().eq("id", booking.id);
    if (nightsError.code === "23505") {
      return res.status(409).json({ error: `${siteId} 營位剛剛被別人預訂了，請改選其他營位或日期` });
    }
    console.error("create-booking nights insert error:", nightsError);
    return res.status(500).json({ error: "訂單建立失敗，請稍後再試或直接致電營主" });
  }

  const itemName = `露營營位 ${siteId}（${nightsCount}晚${quote.early ? "＋夜衝" : ""}）`;

  if (method === "bank_transfer") {
    return res.status(200).json({
      bookingId: booking.id,
      paymentMethod: "bank_transfer",
      totalAmount: total,
      holdExpiresAt: booking.hold_expires_at,
      holdMinutes: HOLD_MINUTES,
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
    ItemName: itemName,
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
