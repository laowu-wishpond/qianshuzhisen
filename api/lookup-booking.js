// POST /api/lookup-booking { code, phone }
// 客人用「訂單編號（8 碼）＋訂購時留的電話」查詢預約／付款狀態。兩個都對才會回資料。
import { getSupabaseAdmin } from "../lib/supabase.js";
import { stayInfo } from "../lib/stay.js";
import { EXTEND_HOURS, MAX_EXTENSIONS } from "../lib/siteStatus.js";

const onlyDigits = (s) => String(s || "").replace(/\D/g, "");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const code = String(req.body?.code || "").trim().replace(/^#/, "").toLowerCase();
  const phone = onlyDigits(req.body?.phone);
  if (!/^[0-9a-f]{8}$/.test(code)) {
    return res.status(400).json({ error: "訂單編號是 8 個英數字（例如 3f9a1c27），請確認有沒有打錯" });
  }
  if (phone.length < 8) {
    return res.status(400).json({ error: "請輸入預約時填寫的電話號碼" });
  }

  const supabase = getSupabaseAdmin();
  await supabase.rpc("expire_stale_holds");

  const { data, error } = await supabase
    .from("bookings")
    .select("id, customer_name, customer_phone, site_id, check_in, check_out, nights_count, booking_date, total_amount, payment_status, payment_verified, payment_method, transfer_last5, hold_expires_at, hold_extensions, cancel_reason, early_arrival, trashed")
    .gte("id", `${code}-0000-0000-0000-000000000000`)
    .lte("id", `${code}-ffff-ffff-ffff-ffffffffffff`)
    .limit(5);

  if (error) {
    console.error("lookup-booking error:", error);
    return res.status(500).json({ error: "查詢失敗，請稍後再試，或直接電話聯絡我們" });
  }

  const b = (data || []).find((r) => onlyDigits(r.customer_phone) === phone);
  if (!b) {
    return res.status(404).json({ error: "查無這筆訂單。請確認訂單編號與電話是否與預約時相同；如果還是查不到，請直接電話聯絡我們。" });
  }

  let state;
  if (b.trashed || b.payment_status === "cancelled") {
    state = b.cancel_reason === "expired" && !b.trashed ? "expired" : "cancelled";
  } else if (b.payment_status === "paid") {
    state = b.payment_verified ? "confirmed" : "reported";
  } else if (b.payment_status === "pending") {
    const active = b.hold_expires_at && new Date(b.hold_expires_at) > new Date();
    state = active ? "awaiting_payment" : "expired";
  } else {
    state = "cancelled";
  }

  return res.status(200).json({
    ok: true,
    bookingId: b.id,
    code: b.id.slice(0, 8),
    state,
    name: b.customer_name,
    site: b.site_id,
    checkIn: stayInfo(b).start,
    checkOut: b.check_out,
    nights: stayInfo(b).nights,
    days: stayInfo(b).days,
    earlyArrival: !!b.early_arrival,
    total: Number(b.total_amount || 0),
    last5: b.transfer_last5 || null,
    holdExpiresAt: state === "awaiting_payment" ? b.hold_expires_at : null,
    canExtend: state === "awaiting_payment" && (b.hold_extensions || 0) < MAX_EXTENSIONS,
    extendHours: EXTEND_HOURS,
  });
}
