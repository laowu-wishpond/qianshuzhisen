// GET /api/get-availability?from=2026-12-01&to=2026-12-31
// 給預約頁用：回傳這段日期內「每一晚已被佔用的營位」，是從 booking_nights 表即時查出來的真實資料。
// 訂單付款狀態 failed（刷卡失敗）／cancelled（已取消）不算佔用（資料庫會自動把那些晚標成 is_active = false），
// pending／paid 都算佔用（pending 代表銀行匯款訂單還在等營主確認，期間視為已佔用，避免重複預約；
// 後台把訂單標記為 cancelled 就會釋出營位）。夜衝那一晚也算佔用。
//
// 回傳格式：{ totalSites: 35, occupiedSites: { "2026-12-05": ["A1", "B3"], ... } }
//
// 舊版用法 ?year=2026&month=8 仍保留（避免瀏覽器還在用舊版網頁時壞掉），
// 回傳每天「被佔用的營位數」：{ capacity: 35, daysInMonth, occupied: { "2026-08-05": 2 } }

import { getSupabaseAdmin } from "../lib/supabase.js";
import { SITES, isValidISODate, addDays } from "../lib/pricing.js";

const MAX_RANGE_DAYS = 90;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let from = req.query.from;
  let to = req.query.to;
  let legacy = false;
  let daysInMonth = null;

  if (!from || !to) {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10); // 1-12
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: "請提供 from / to（YYYY-MM-DD）參數" });
    }
    const monthStr = String(month).padStart(2, "0");
    daysInMonth = new Date(year, month, 0).getDate();
    from = `${year}-${monthStr}-01`;
    to = `${year}-${monthStr}-${String(daysInMonth).padStart(2, "0")}`;
    legacy = true;
  }

  if (!isValidISODate(from) || !isValidISODate(to) || to < from) {
    return res.status(400).json({ error: "日期範圍錯誤" });
  }
  if (addDays(from, MAX_RANGE_DAYS) < to) {
    return res.status(400).json({ error: "一次最多查詢 " + MAX_RANGE_DAYS + " 天" });
  }

  const supabase = getSupabaseAdmin();

  // 逾時沒回報匯款的保留單先釋出，日曆上的空位才是即時的
  await supabase.rpc("expire_stale_holds");

  const { data, error } = await supabase
    .from("booking_nights")
    .select("night_date, site_id")
    .eq("is_active", true)
    .gte("night_date", from)
    .lte("night_date", to);

  if (error) {
    console.error("get-availability error:", error);
    return res.status(500).json({ error: "查詢空位失敗" });
  }

  const occupiedSites = {};
  for (const row of data || []) {
    (occupiedSites[row.night_date] = occupiedSites[row.night_date] || []).push(row.site_id);
  }

  if (legacy) {
    const counts = {};
    for (const [d, list] of Object.entries(occupiedSites)) counts[d] = list.length;
    return res.status(200).json({ capacity: SITES.length, daysInMonth, occupied: counts });
  }

  return res.status(200).json({ totalSites: SITES.length, occupiedSites });
}
