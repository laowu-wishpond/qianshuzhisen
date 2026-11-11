// POST /api/create-cart-order { name, phone, email, items:[{ siteId, checkIn, checkOut, earlyArrival, people }] }
// 購物車一次結帳：伺服器重新計價、檢查空位，一次建立整筆訂單。
//   - 2 筆以上：建立一個 booking_group，每個營位各一筆 bookings（用 group_id 綁在一起），共用同一個保留時間，客人只匯一次錢。
//   - 只有 1 筆：和原本的單筆訂位一樣（不建立 group）。
// 全部成功或全部失敗：任何一個營位剛好被別人訂走，整筆撤銷，不會留下訂了一半的訂單。
import { getSupabaseAdmin } from "../lib/supabase.js";
import { sendBookingReceivedGroup } from "../lib/email.js";
import { isBookingOpen, HOLD_MINUTES } from "../lib/siteStatus.js";
import { priceItems, checkAvailability, publicItem, codeOf } from "../lib/cart.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!isBookingOpen(new Date(), req.headers.cookie || "")) {
    return res.status(503).json({ error: "線上預約尚未開放，開放後即可預約。" });
  }

  const { name, phone, email, items, notes } = req.body || {};
  const cleanName = String(name || "").trim();
  const cleanPhone = String(phone || "").trim();
  const cleanEmail = String(email || "").trim();
  if (!cleanName || !cleanPhone || !cleanEmail) {
    return res.status(400).json({ error: "請填姓名、電話和 Email（預約成功通知會寄到這個信箱）" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: "Email 格式不正確，預約成功通知會寄到這個信箱" });
  }
  if (cleanPhone.replace(/\D/g, "").length < 8) {
    return res.status(400).json({ error: "請填正確的電話號碼" });
  }

  const priced = priceItems(items);
  if (priced.error) return res.status(400).json({ error: priced.error });
  const supabase = getSupabaseAdmin();
  await supabase.rpc("expire_stale_holds");

  let checked;
  try {
    checked = await checkAvailability(supabase, priced);
  } catch (e) {
    console.error("create-cart-order availability error:", e);
    return res.status(500).json({ error: "查詢空位失敗，請稍後再試或直接致電營主" });
  }
  if (!checked.ok) {
    const bad = checked.items.find((x) => !x.ok);
    return res.status(409).json({ error: `第 ${bad.index + 1} 項：${bad.error}`, items: checked.items.map(publicItem) });
  }

  const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
  const multi = checked.items.length >= 2;

  // 1. 整筆訂單（2 筆以上才建立）
  let group = null;
  if (multi) {
    const { data: g, error: gErr } = await supabase
      .from("booking_groups")
      .insert({ customer_name: cleanName, customer_phone: cleanPhone, customer_email: cleanEmail, item_count: checked.items.length, total_amount: checked.total })
      .select()
      .single();
    if (gErr) {
      console.error("create-cart-order group insert error:", gErr);
      return res.status(500).json({ error: "訂單建立失敗，請稍後再試或直接致電營主" });
    }
    group = g;
  }

  const rollback = async (bookingIds) => {
    if (bookingIds && bookingIds.length) {
      await supabase.from("booking_nights").delete().in("booking_id", bookingIds);
      await supabase.from("bookings").delete().in("id", bookingIds);
    }
    if (group) await supabase.from("booking_groups").delete().eq("id", group.id);
  };

  // 2. 每個營位一筆 bookings
  const rows = checked.items.map((it) => ({
    customer_name: cleanName,
    customer_phone: cleanPhone,
    customer_email: cleanEmail,
    booking_date: it.checkIn,
    site_id: it.siteId,
    check_in: it.checkIn,
    check_out: it.checkOut,
    nights_count: it.nights.length,
    early_arrival: !!it.early,
    tents_count: 1,
    people_per_tent: it.people,
    per_tent_price: null,
    total_amount: it.total,
    payment_method: "bank_transfer",
    payment_status: "pending",
    hold_expires_at: holdExpiresAt,
    notes: notes ? String(notes).slice(0, 500) : null,
    group_id: group ? group.id : null,
  }));
  const { data: bookings, error: bErr } = await supabase.from("bookings").insert(rows).select();
  if (bErr || !bookings || bookings.length !== rows.length) {
    console.error("create-cart-order bookings insert error:", bErr);
    await rollback(bookings ? bookings.map((b) => b.id) : []);
    return res.status(500).json({ error: "訂單建立失敗，請稍後再試或直接致電營主" });
  }
  // insert().select() 不保證順序，用「營位＋入住日」對回每一項
  const byKey = new Map(bookings.map((b) => [b.site_id + "|" + b.check_in, b]));

  // 3. 每個營位每一晚（唯一索引防止重複預約；整批一個 INSERT，要嘛全成功要嘛全失敗）
  const nightRows = [];
  for (const it of checked.items) {
    const b = byKey.get(it.siteId + "|" + it.checkIn);
    for (const n of it.nights) nightRows.push({ booking_id: b.id, site_id: it.siteId, night_date: n.date, kind: "regular", day_type: n.type, price: n.price });
    if (it.early) nightRows.push({ booking_id: b.id, site_id: it.siteId, night_date: it.early.date, kind: "early", day_type: "early", price: it.early.price });
  }
  const { error: nErr } = await supabase.from("booking_nights").insert(nightRows);
  if (nErr) {
    await rollback(bookings.map((b) => b.id));
    if (nErr.code === "23505") {
      return res.status(409).json({ error: "有營位剛剛被別人預訂了，整筆訂單沒有成立，請重新整理購物車確認，再重新結帳。" });
    }
    console.error("create-cart-order nights insert error:", nErr);
    return res.status(500).json({ error: "訂單建立失敗，請稍後再試或直接致電營主" });
  }

  // 4. 「已收到您的預約」信（一封列出所有營位；寄信失敗不影響訂單）
  try {
    const nightsByBooking = new Map();
    for (const r of nightRows) {
      if (!nightsByBooking.has(r.booking_id)) nightsByBooking.set(r.booking_id, []);
      nightsByBooking.get(r.booking_id).push(r);
    }
    const sent = await sendBookingReceivedGroup(bookings, nightsByBooking);
    if (sent.sent) await supabase.from("bookings").update({ received_email_sent_at: new Date().toISOString() }).in("id", bookings.map((b) => b.id));
  } catch (e) {
    console.error("create-cart-order received email error:", e);
  }

  const orderId = group ? group.id : bookings[0].id;
  return res.status(200).json({
    ok: true,
    grouped: multi,
    orderId, // 整筆訂單 id（單筆時就是那筆的 id）
    code: codeOf(orderId),
    bookingIds: bookings.map((b) => b.id),
    totalAmount: checked.total,
    holdExpiresAt,
    holdMinutes: HOLD_MINUTES,
    items: checked.items.map((it) => ({ ...publicItem(it), code: codeOf(byKey.get(it.siteId + "|" + it.checkIn).id) })),
  });
}
