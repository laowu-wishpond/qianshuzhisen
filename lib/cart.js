// 購物車（一次結帳多個營位）的共用邏輯。
// 設計：每個營位仍然是一筆 bookings（有自己的營位、日期、金額、booking_nights），
//       多筆用 bookings.group_id 綁成「整筆訂單」（booking_groups）。客人只匯一次錢、回報一次末五碼，後台以整筆看。
//       只訂一個營位時不建立 group（group_id = null），和原本的單筆訂位完全一樣。
import { quoteStay, getSite, addDays, isValidISODate } from "./pricing.js";

export const MAX_CART_ITEMS = 10;

export function todayInTaipei() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

export const codeOf = (id) => String(id || "").slice(0, 8);

// 把客人購物車裡的每一項重新計價（不信任前端傳來的任何金額），並檢查購物車內部有沒有重複佔用同營位同一晚。
// items: [{ siteId, checkIn, checkOut, earlyArrival, people }]
// 回傳 { ok, items:[{ index, ok, error?, siteId, checkIn, checkOut, earlyArrival, people, start, nights, early, subtotal, total, wantedDates }], total, count }
export function priceItems(items, today = todayInTaipei()) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return { ok: false, error: "購物車是空的", items: [], total: 0, count: 0 };
  if (list.length > MAX_CART_ITEMS) return { ok: false, error: `一次最多結帳 ${MAX_CART_ITEMS} 筆，請分兩次結帳`, items: [], total: 0, count: list.length };

  const used = new Map(); // "A1|2026-12-25" → 第幾項
  const out = list.map((raw, index) => {
    const it = {
      index,
      siteId: String(raw?.siteId || "").trim(),
      checkIn: String(raw?.checkIn || ""),
      checkOut: String(raw?.checkOut || ""),
      earlyArrival: raw?.earlyArrival === true || raw?.earlyArrival === "true",
      people: parseInt(raw?.people, 10),
    };
    const fail = (error) => ({ ...it, ok: false, error, nights: [], early: null, subtotal: 0, total: 0, wantedDates: [] });

    if (!getSite(it.siteId)) return fail("找不到這個營位");
    if (!isValidISODate(it.checkIn) || !isValidISODate(it.checkOut)) return fail("日期格式錯誤");
    if (!(it.people >= 1) || it.people > 60) return fail("入住人數要填 1～60 人");
    if (it.checkIn > addDays(today, 730)) return fail("只開放預訂兩年內的日期");

    const q = quoteStay({ siteId: it.siteId, checkIn: it.checkIn, checkOut: it.checkOut, earlyArrival: it.earlyArrival, today });
    if (!q.ok) return fail(q.error);

    const wantedDates = q.nights.map((n) => n.date);
    if (q.early) wantedDates.unshift(q.early.date);
    for (const d of wantedDates) {
      const k = it.siteId + "|" + d;
      if (used.has(k)) return fail(`${it.siteId} 營位 ${d} 那晚在購物車裡重複了（和第 ${used.get(k) + 1} 項衝突），請刪除其中一項`);
    }
    wantedDates.forEach((d) => used.set(it.siteId + "|" + d, index));

    return {
      ...it,
      ok: true,
      start: q.early ? q.early.date : it.checkIn,
      nights: q.nights,
      early: q.early,
      subtotal: q.subtotal,
      total: q.total,
      wantedDates,
    };
  });

  const ok = out.every((x) => x.ok);
  return { ok, items: out, total: out.reduce((s, x) => s + (x.ok ? x.total : 0), 0), count: out.length };
}

// 查資料庫有沒有人已佔用。對有問題的項目補上 error（回傳新的陣列，不改原物件）。
export async function checkAvailability(supabase, priced) {
  const items = priced.items.map((x) => ({ ...x }));
  for (const it of items) {
    if (!it.ok) continue;
    const { data: taken, error } = await supabase
      .from("booking_nights")
      .select("night_date")
      .eq("site_id", it.siteId)
      .eq("is_active", true)
      .in("night_date", it.wantedDates);
    if (error) throw error;
    if (taken && taken.length) {
      it.ok = false;
      it.error = `${it.siteId} 營位在 ${taken.map((t) => t.night_date).sort().join("、")} 已被預訂，請移除這一項或改選其他營位／日期`;
    }
  }
  return { ...priced, items, ok: items.every((x) => x.ok), total: items.reduce((s, x) => s + (x.ok ? x.total : 0), 0) };
}

// 狀態（整筆訂單）：group 底下每筆的狀態都一起改，所以取任何一筆有效的就能代表整筆
export function bookingState(b) {
  if (b.trashed || b.payment_status === "cancelled" || b.payment_status === "failed") {
    return b.cancel_reason === "expired" && !b.trashed ? "expired" : "cancelled";
  }
  if (b.payment_status === "paid") return b.payment_verified ? "confirmed" : "reported";
  if (b.payment_status === "pending") return b.hold_expires_at && new Date(b.hold_expires_at) > new Date() ? "awaiting_payment" : "expired";
  return "cancelled";
}

// 整筆訂單的總狀態：有任何一筆還在等匯款→等匯款；全部已對帳→成功；其餘依序判斷
export function groupState(bookings) {
  const states = bookings.map(bookingState);
  const alive = states.filter((s) => s !== "cancelled" && s !== "expired");
  if (!alive.length) return states.includes("expired") ? "expired" : "cancelled";
  if (alive.includes("awaiting_payment")) return "awaiting_payment";
  if (alive.every((s) => s === "confirmed")) return "confirmed";
  return "reported";
}

// 讀出一批訂單每一晚的明細（給 email 與查詢頁顯示「計費日期＋金額」）
export async function loadNights(supabase, ids) {
  const map = new Map();
  if (!ids.length) return map;
  const { data } = await supabase
    .from("booking_nights")
    .select("booking_id, night_date, kind, day_type, price")
    .in("booking_id", ids)
    .order("night_date", { ascending: true });
  for (const r of data || []) {
    if (!map.has(r.booking_id)) map.set(r.booking_id, []);
    map.get(r.booking_id).push(r);
  }
  return map;
}

// 給前端／email 用的精簡版（不含內部欄位）
export function publicItem(x) {
  return {
    index: x.index,
    ok: x.ok,
    error: x.error || null,
    siteId: x.siteId,
    checkIn: x.checkIn,
    checkOut: x.checkOut,
    earlyArrival: !!x.earlyArrival,
    people: x.people,
    start: x.start || x.checkIn,
    nights: (x.nights || []).map((n) => ({ date: n.date, type: n.type, newYear: !!n.newYear, price: n.price })),
    early: x.early ? { date: x.early.date, price: x.early.price } : null,
    subtotal: x.subtotal || 0,
    total: x.total || 0,
  };
}
