// GET /api/admin-vacancy?from=2026-12-01&days=30
// 後台「每日空位表」：每個營位、每一晚被誰訂走（已對帳／待對帳／待匯款），空的就是空位。
// 資料來自 booking_nights（和預約頁同一份），所以不會和預約日曆對不上。
import { getSupabaseAdmin } from "../lib/supabase.js";
import { getRole, maskPhone } from "../lib/adminAuth.js";
import { SITES, isValidISODate, addDays } from "../lib/pricing.js";

const MAX_DAYS = 90;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const role = getRole(req);
  if (!role) return res.status(401).json({ error: "未登入或登入已逾期，請重新登入" });
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  let from = String(req.query.from || today);
  if (!isValidISODate(from)) from = today;
  let days = parseInt(req.query.days, 10);
  if (!(days >= 1)) days = 30;
  days = Math.min(days, MAX_DAYS);
  const to = addDays(from, days - 1);

  const supabase = getSupabaseAdmin();
  await supabase.rpc("expire_stale_holds");

  const { data: nights, error } = await supabase
    .from("booking_nights")
    .select("booking_id, site_id, night_date, kind")
    .eq("is_active", true)
    .gte("night_date", from)
    .lte("night_date", to)
    .limit(5000);
  if (error) {
    console.error("admin-vacancy nights error:", error);
    return res.status(500).json({ error: "查詢空位失敗" });
  }

  const ids = [...new Set((nights || []).map((n) => n.booking_id))];
  const info = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: bs, error: bErr } = await supabase
      .from("bookings")
      .select("id, customer_name, customer_phone, payment_status, payment_verified, group_id, check_in, check_out, early_arrival, total_amount")
      .in("id", ids.slice(i, i + 200));
    if (bErr) {
      console.error("admin-vacancy bookings error:", bErr);
      return res.status(500).json({ error: "查詢訂單失敗" });
    }
    for (const b of bs || []) info.set(b.id, b);
  }

  // cells: { "A1": { "2026-12-25": { s: "confirmed"|"reported"|"pending", n, p, c, e } } }
  const cells = {};
  for (const n of nights || []) {
    const b = info.get(n.booking_id);
    if (!b) continue;
    const state = b.payment_status === "paid" ? (b.payment_verified ? "confirmed" : "reported") : "pending";
    (cells[n.site_id] ||= {})[n.night_date] = {
      s: state,
      n: b.customer_name,
      p: role === "admin" ? b.customer_phone : maskPhone(b.customer_phone),
      c: String(b.id).slice(0, 8),
      g: b.group_id ? String(b.group_id).slice(0, 8) : null,
      e: n.kind === "early",
      a: b.total_amount,
      i: b.check_in,
      o: b.check_out,
    };
  }

  return res.status(200).json({
    from,
    to,
    days,
    today,
    role,
    sites: SITES.map((s) => ({ id: s.id, zone: s.zone })),
    cells,
  });
}
