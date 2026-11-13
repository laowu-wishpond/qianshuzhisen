// POST /api/report-transfer { bookingId, last5, correct? }
//   correct: true → 客人打錯末五碼想更正：只允許「已回報、還沒對帳完成」的訂單改末五碼（對帳完成後不能改，也不需要改）
// 客人匯款後在預約頁回報「匯款帳號末五碼」。回報後系統會自動把這筆標記為「已付款（待對帳）」，營位持續保留；營主在後台對帳完成後才會寄預約成功 email。
import { getSupabaseAdmin } from "../lib/supabase.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { bookingId, last5, correct } = req.body || {};
  const fix = correct === true; // 更正模式：訂單目前是「已回報、待對帳」
  if (typeof bookingId !== "string" || !UUID_RE.test(bookingId)) {
    return res.status(400).json({ error: "訂單編號不正確" });
  }
  const digits = String(last5 || "").trim();
  if (!/^\d{5}$/.test(digits)) {
    return res.status(400).json({ error: "請填 5 位數字（匯款帳號的末五碼）" });
  }

  const supabase = getSupabaseAdmin();

  // 購物車整筆訂單：bookingId 帶整筆訂單的 id，一次把底下所有「等匯款」的營位都標成已回報
  const { data: grp } = await supabase.from("booking_groups").select("id").eq("id", bookingId).maybeSingle();
  if (grp) {
    const { data: upd, error: gErr } = await supabase
      .from("bookings")
      .update({ transfer_last5: digits, transfer_reported_at: new Date().toISOString(), payment_status: "paid", payment_verified: false })
      .eq("group_id", bookingId)
      .eq("payment_status", fix ? "paid" : "pending")
      .eq("payment_verified", false)
      .eq("trashed", false)
      .select("id");
    if (gErr) {
      console.error("report-transfer group error:", gErr);
      return res.status(500).json({ error: "回報失敗，請稍後再試或直接電話聯絡我們" });
    }
    if (!upd || !upd.length) {
      return res.status(409).json({ error: fix ? "這筆訂單已經對帳完成（或狀態已改變），不需要更正末五碼。如有疑問請直接電話聯絡我們（0939-235-168）。" : "這筆訂單的保留時間已過、營位已釋出（或已處理）。如果您已匯款，請直接電話聯絡我們。" });
    }
    return res.status(200).json({ ok: true, count: upd.length });
  }

  const { data, error } = await supabase
    .from("bookings")
    .update({
      transfer_last5: digits,
      transfer_reported_at: new Date().toISOString(),
      payment_status: "paid",
      payment_verified: false,
    })
    .eq("id", bookingId)
    .eq("payment_status", fix ? "paid" : "pending")
    .eq("payment_verified", false)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("report-transfer error:", error);
    return res.status(500).json({ error: "回報失敗，請稍後再試或直接電話聯絡我們" });
  }
  if (!data) {
    return res.status(409).json({
      error: fix ? "這筆訂單已經對帳完成（或狀態已改變），不需要更正末五碼。如有疑問請直接電話聯絡我們（0939-235-168）。" : "這筆訂單的保留時間已過、營位已釋出（或已處理）。如果您已匯款，請直接電話聯絡我們。",
    });
  }
  return res.status(200).json({ ok: true });
}
