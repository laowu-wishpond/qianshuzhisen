// POST /api/create-message
// contact.html 的留言表單送出時呼叫這支，把留言寫進 Supabase 的 contact_messages 表，
// 取代原本純前端 alert() 的假送出。

import { getSupabaseAdmin } from "../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, phone, message } = req.body || {};

  if (!name || !phone) {
    return res.status(400).json({ error: "缺少姓名或聯絡電話" });
  }

  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("contact_messages").insert({
    name: String(name).trim(),
    phone: String(phone).trim(),
    message: message ? String(message).trim() : null,
  });

  if (error) {
    console.error("create-message insert error:", error);
    return res.status(500).json({ error: "留言送出失敗，請稍後再試或直接致電營主" });
  }

  return res.status(200).json({ ok: true });
}
