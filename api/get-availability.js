// GET /api/get-availability?year=2026&month=8
// 給預約日曆用：回傳該月每一天「目前已預約帳篷數」，是從 bookings 表即時算出來的真實資料，
// 不是前端寫死的假數字。付款狀態 failed（刷卡失敗）不算佔用，pending／paid 都算佔用
// （pending 代表銀行匯款訂單還在等營主確認，期間應視為已佔用該營位，避免被重複預約）。

import { getSupabaseAdmin } from "../lib/supabase.js";

export const TOTAL_CAPACITY = 60;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10); // 1-12

  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: "缺少或錯誤的 year / month 參數" });
  }

  const monthStr = String(month).padStart(2, "0");
  const startDate = `${year}-${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate(); // month 是 1-based，剛好對到下個月第 0 天＝這個月最後一天
  const endDate = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("bookings")
    .select("booking_date, tents_count, payment_status")
    .gte("booking_date", startDate)
    .lte("booking_date", endDate)
    .neq("payment_status", "failed");

  if (error) {
    console.error("get-availability error:", error);
    return res.status(500).json({ error: "查詢空位失敗" });
  }

  const occupied = {};
  for (const row of data || []) {
    occupied[row.booking_date] = (occupied[row.booking_date] || 0) + (row.tents_count || 0);
  }

  return res.status(200).json({ capacity: TOTAL_CAPACITY, daysInMonth: lastDay, occupied });
}
