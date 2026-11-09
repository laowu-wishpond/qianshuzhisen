// GET   /api/admin-bookings?from=YYYY-MM-DD&to=YYYY-MM-DD&status=pending  → 查訂單列表
// PATCH /api/admin-bookings  { id, payment_status }                       → 更新單筆訂單狀態
// 兩支都需要先登入（admin_session cookie 合法）才能用。
import { getSupabaseAdmin } from "../lib/supabase.js";
import { getRole, maskPhone } from "../lib/adminAuth.js";
import { sendBookingConfirmed, emailConfigured } from "../lib/email.js";

const ALLOWED_STATUS = ["pending", "paid", "failed", "cancelled"];

export default async function handler(req, res) {
  const role = getRole(req);
  if (!role) {
    return res.status(401).json({ error: "未登入或登入已逾期，請重新登入" });
  }

  const supabase = getSupabaseAdmin();

  if (req.method === "GET") {
    await supabase.rpc("expire_stale_holds");
    const { from, to, status, last4 } = req.query;
    // 末四碼查詢：輸入 4 碼（或 5 碼）數字，找匯款末五碼結尾相符的訂單；查詢時不受日期／狀態篩選限制
    const searchDigits = last4 ? String(last4).trim() : "";
    if (searchDigits && !/^\d{4,5}$/.test(searchDigits)) {
      return res.status(400).json({ error: "請輸入 4 或 5 位數字" });
    }
    let query = supabase
      .from("bookings")
      .select("*")
      .order("booking_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (searchDigits) {
      query = query.not("transfer_last5", "is", null).like("transfer_last5", "%" + searchDigits);
    } else {
      if (from) query = query.gte("booking_date", from);
      if (to) query = query.lte("booking_date", to);
      if (status === "unreported") query = query.eq("payment_status", "pending").is("transfer_last5", null).gt("total_amount", 0);
      else if (status === "unverified") query = query.eq("payment_status", "paid").eq("payment_verified", false);
      else if (status && ALLOWED_STATUS.includes(status)) query = query.eq("payment_status", status);
    }

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

    const patch = { payment_status };
    if (payment_status === "paid") patch.payment_verified = true; // 營主手動標記／按「對帳完成」＝已對帳

    const { data: updated, error } = await supabase
      .from("bookings")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error || !updated) {
      console.error("admin-bookings PATCH error:", error);
      return res.status(500).json({ error: "更新訂單狀態失敗" });
    }

    // 對帳完成 → 寄「預約成功」email（每筆只寄一次）
    let email = null;
    if (payment_status === "paid" && !updated.confirmation_email_sent_at) {
      const r = await sendBookingConfirmed(updated);
      if (r.sent) {
        await supabase.from("bookings").update({ confirmation_email_sent_at: new Date().toISOString() }).eq("id", id);
        email = "sent";
      } else {
        email = r.reason; // no_email / not_configured / send_failed
      }
    }
    return res.status(200).json({ ok: true, email, emailConfigured: emailConfigured() });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
