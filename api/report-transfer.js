// POST /api/report-transfer { bookingId, last5 }
// 客人匯款後在預約頁回報「匯款帳號末五碼」。回報後這筆保留單就不會被自動釋出，等營主在後台核對、標記已付款。
import { getSupabaseAdmin } from "../lib/supabase.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { bookingId, last5 } = req.body || {};
  if (typeof bookingId !== "string" || !UUID_RE.test(bookingId)) {
    return res.status(400).json({ error: "訂單編號不正確" });
  }
  const digits = String(last5 || "").trim();
  if (!/^\d{5}$/.test(digits)) {
    return res.status(400).json({ error: "請填 5 位數字（匯款帳號的末五碼）" });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("bookings")
    .update({ transfer_last5: digits, transfer_reported_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("payment_status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("report-transfer error:", error);
    return res.status(500).json({ error: "回報失敗，請稍後再試或直接電話聯絡我們" });
  }
  if (!data) {
    return res.status(409).json({
      error: "這筆訂單的保留時間已過、營位已釋出（或已處理）。如果您已匯款，請直接電話聯絡我們。",
    });
  }
  return res.status(200).json({ ok: true });
}
