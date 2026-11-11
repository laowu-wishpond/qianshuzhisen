// POST /api/cart-quote { items:[{ siteId, checkIn, checkOut, earlyArrival, people }] }
// 購物車結帳頁用：伺服器重新計價（每一晚的日期、平日／假日、金額）＋檢查空位。不寫入任何資料。
import { getSupabaseAdmin } from "../lib/supabase.js";
import { priceItems, checkAvailability, publicItem } from "../lib/cart.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const priced = priceItems(req.body?.items);
  if (!priced.items.length) return res.status(400).json({ error: priced.error || "購物車是空的" });
  if (priced.error) return res.status(400).json({ error: priced.error });

  const supabase = getSupabaseAdmin();
  await supabase.rpc("expire_stale_holds");
  let checked;
  try {
    checked = await checkAvailability(supabase, priced);
  } catch (e) {
    console.error("cart-quote availability error:", e);
    return res.status(500).json({ error: "查詢空位失敗，請稍後再試或直接致電營主" });
  }
  return res.status(200).json({ ok: checked.ok, total: checked.total, count: checked.count, items: checked.items.map(publicItem) });
}
