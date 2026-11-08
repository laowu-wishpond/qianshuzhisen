// GET   /api/admin-bookings?from=YYYY-MM-DD&to=YYYY-MM-DD&status=pending  → 查訂單列表
// PATCH /api/admin-bookings  { id, payment_status }                       → 更新單筆訂單狀態
// 兩支都需要先登入（admin_session cookie 合法）才能用。
import { getSupabaseAdmin } from "../lib/supabase.js";
import { getRole, maskPhone } from "../lib/adminAuth.js";

const ALLOWED_STATUS = ["pending", "paid", "failed", "cancelled"];

export default async function handler(req, res) {
  const role = getRole(req);
  if (!role) {
    return res.status(401).json({ error: "未登入或登入已逾期，請重新登入" });
  }

  const supabase = getSupabaseAdmin();

  if (req.method === "GET") {
    await supabase.rpc("expire_stale_holds");
    const { from, to, status } = req.query;
    let query = supabase
      .from("bookings")
      .select("*")
      .order("booking_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (from) query = query.gte("booking_date", from);
    if (to) query = query.lte("booking_date", to);
    if (status && ALLOWED_STATUS.includes(status)) query = query.eq("payment_status", status);

    const { data, error } = await query;
    if (error) {
      console.error("admin-bookings GET error:", error);
      return res.status(500).json({ error: "查詢訂單失敗" });
    }
    let bookings = data || [];
    // 唯讀角色看不到完整電話
    if (role !== "admin") {
      bookings = bookings.map((b) => ({ ...b, customer_phone: maskPhone(b.customer_phone) }));
    }
    return res.status(200).json({ bookings, role });
  }

  if (req.method === "PATCH") {
    if (role !== "admin") {
      return res.status(403).json({ error: "唯讀帳號無法修改訂單" });
    }
    const { id, payment_status } = req.body || {};
    if (!id || !payment_status) {
      return res.status(400).json({ error: "缺少 id 或 payment_status" });
    }
    if (!ALLOWED_STATUS.includes(payment_status)) {
      return res.status(400).json({ error: "不合法的狀態值" });
    }

    const { error } = await supabase
      .from("bookings")
      .update({ payment_status })
      .eq("id", id);

    if (error) {
      console.error("admin-bookings PATCH error:", error);
      return res.status(500).json({ error: "更新訂單狀態失敗" });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
