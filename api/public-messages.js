// GET /api/public-messages → 公開留言板（給 contact.html 顯示）
// 只回傳：姓名（遮蔽）、留言內容（去掉 email／電話）、時間、營主回覆。絕不回傳電話。
// 營主可以在後台把某則留言設成「隱藏」(is_public = false)。
import { getSupabaseAdmin } from "../lib/supabase.js";
import { AUTO_REPLY_ZH, AUTO_REPLY_EN } from "../lib/email.js";

function maskName(name) {
  const s = String(name || "").trim();
  if (!s) return "訪客";
  const chars = Array.from(s);
  if (chars.length === 1) return chars[0] + "○";
  if (chars.length === 2) return chars[0] + "○";
  return chars[0] + "○".repeat(chars.length - 2) + chars[chars.length - 1];
}

function cleanMessage(msg) {
  let s = String(msg || "");
  s = s.replace(/（客人 Email：[^）]*）/g, ""); // create-message 附加的 email
  // 全形數字轉半形，避免用全形數字繞過
  s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const HIDE = "［已隱藏］";
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, HIDE); // email
  s = s.replace(/[A-Za-z][12]\d{8}/g, HIDE); // 身分證字號
  s = s.replace(/(末|後|尾)\s*[四五4-5]?\s*碼?\s*[:：是為]?\s*\d{3,}/g, HIDE); // 「末五碼 12345」「後四碼1234」
  // 匯款金額：$4000、NT$4,000、4000 元、匯款/轉帳/金額 後面的數字
  s = s.replace(/(NT\$?|NTD|\$|＄)\s*\d[\d,]*/gi, HIDE);
  s = s.replace(/\d[\d,]*\s*(元|塊|圓|NTD|ntd)/g, HIDE);
  s = s.replace(/(匯款|匯了|轉帳|轉了|金額|款項|訂金|總額|共計|合計)\s*[:：是為]?\s*(NT\$?|\$)?\s*\d[\d,]*/g, (m, k) => k + HIDE);
  s = s.replace(/\d[\d\s-]{3,}\d/g, (m) => (m.replace(/\D/g, "").length >= 5 ? HIDE : m)); // 5 位以上數字（電話、帳號、末五碼）
  s = s.replace(/\d{5,}/g, HIDE);
  return s.trim().slice(0, 400);
}

// 營主自己寫的回覆：不要把訂單編號（例如 98544c8e、33811790）、電話、日期裡的數字遮掉，只遮 email。
function cleanReply(msg) {
  return String(msg || "").replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "［已隱藏］").trim().slice(0, 600);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("contact_messages")
    .select("name, message, created_at, reply, replied_at")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) {
    console.error("public-messages error:", error);
    return res.status(500).json({ error: "載入留言失敗" });
  }
  const messages = (data || []).map((m) => ({
    name: maskName(m.name),
    message: cleanMessage(m.message),
    created_at: m.created_at,
    reply: m.reply ? cleanReply(m.reply) : null,
    replied_at: m.replied_at || null,
  }));
  res.setHeader("Cache-Control", "public, s-maxage=10, stale-while-revalidate=30");
  return res.status(200).json({ messages, autoReply: { zh: AUTO_REPLY_ZH, en: AUTO_REPLY_EN } });
}
