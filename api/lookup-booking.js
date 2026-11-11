// POST /api/lookup-booking { code, phone }
// 客人用「訂單編號（8 碼）＋訂購時留的電話」查詢預約／付款狀態。兩個都對才會回資料。
// 訂單編號可以是單筆訂單的編號，也可以是購物車「整筆訂單」的編號（整筆會回傳每個營位的住宿日期與每一晚金額）。
import { getSupabaseAdmin } from "../lib/supabase.js";
import { stayInfo } from "../lib/stay.js";
import { EXTEND_HOURS, MAX_EXTENSIONS } from "../lib/siteStatus.js";
import { bookingState, groupState, loadNights, codeOf } from "../lib/cart.js";

const onlyDigits = (s) => String(s || "").replace(/\D/g, "");
const COLS = "id, group_id, customer_name, customer_phone, site_id, check_in, check_out, nights_count, booking_date, total_amount, payment_status, payment_verified, payment_method, transfer_last5, hold_expires_at, hold_extensions, cancel_reason, early_arrival, trashed";

async function groupResponse(supabase, gid, g) {
  const { data: rows, error } = await supabase.from("bookings").select(COLS).eq("group_id", gid).order("check_in", { ascending: true });
  if (error || !rows || !rows.length) return null;
  const nights = await loadNights(supabase, rows.map((r) => r.id));
  const state = groupState(rows);
  const items = rows.map((b) => {
    const st = stayInfo(b);
    return {
      code: codeOf(b.id),
      state: bookingState(b),
      site: b.site_id,
      checkIn: st.start,
      checkOut: b.check_out,
      nights: st.nights,
      days: st.days,
      earlyArrival: !!b.early_arrival,
      total: Number(b.total_amount || 0),
      nightsDetail: (nights.get(b.id) || []).map((n) => ({ date: n.night_date, kind: n.kind, dayType: n.day_type, price: n.price })),
    };
  });
  const alive = rows.filter((b) => !["cancelled", "expired"].includes(bookingState(b)));
  const pending = alive.filter((b) => bookingState(b) === "awaiting_payment");
  const holdExpiresAt = state === "awaiting_payment" ? pending.map((b) => b.hold_expires_at).sort()[0] : null;
  return {
    ok: true,
    group: true,
    bookingId: gid, // report-transfer / extend-hold 都接受整筆訂單 id
    groupId: gid,
    code: codeOf(gid),
    state,
    name: rows[0].customer_name,
    itemCount: alive.length || rows.length,
    total: alive.reduce((s, b) => s + Number(b.total_amount || 0), 0) || Number(g?.total_amount || 0),
    last5: rows.find((b) => b.transfer_last5)?.transfer_last5 || null,
    holdExpiresAt,
    canExtend: state === "awaiting_payment" && pending.every((b) => (b.hold_extensions || 0) < MAX_EXTENSIONS),
    extendHours: EXTEND_HOURS,
    items,
  };
}

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

  const range = (q) => q.gte("id", `${code}-0000-0000-0000-000000000000`).lte("id", `${code}-ffff-ffff-ffff-ffffffffffff`);
  const { data, error } = await range(supabase.from("bookings").select(COLS)).limit(5);
  if (error) {
    console.error("lookup-booking error:", error);
    return res.status(500).json({ error: "查詢失敗，請稍後再試，或直接電話聯絡我們" });
  }
  const b = (data || []).find((r) => onlyDigits(r.customer_phone) === phone);

  // 購物車整筆訂單：輸入整筆編號、或輸入底下某個營位的編號，都顯示整筆
  let gid = b?.group_id || null;
  let grp = null;
  if (!gid) {
    const { data: gs } = await range(supabase.from("booking_groups").select("*")).limit(5);
    grp = (gs || []).find((r) => onlyDigits(r.customer_phone) === phone) || null;
    if (grp) gid = grp.id;
  }
  if (gid) {
    const out = await groupResponse(supabase, gid, grp);
    if (out) return res.status(200).json(out);
  }

  if (!b) {
    return res.status(404).json({ error: "查無這筆訂單。請確認訂單編號與電話是否與預約時相同；如果還是查不到，請直接電話聯絡我們。" });
  }

  const state = bookingState(b);
  const nights = await loadNights(supabase, [b.id]);
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
    nightsDetail: (nights.get(b.id) || []).map((n) => ({ date: n.night_date, kind: n.kind, dayType: n.day_type, price: n.price })),
  });
}
