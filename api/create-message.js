// POST /api/create-message
// contact.html 的留言表單送出時呼叫這支，把留言寫進 Supabase 的 contact_messages 表，
// 取代原本純前端 alert() 的假送出。

import { getSupabaseAdmin } from "../lib/supabase.js";
import { sendMessageAutoReply, AUTO_REPLY_ZH, AUTO_REPLY_EN } from "../lib/email.js";
import { handleNewMessage } from "../lib/messageDesk.js";
import { getSettings } from "../lib/reminders.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, phone, message, email } = req.body || {};

  if (!name || !phone) {
    return res.status(400).json({ error: "缺少姓名或聯絡電話" });
  }

  const cleanEmail = email ? String(email).trim() : "";
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: "Email 格式不正確" });
  }

  const supabase = getSupabaseAdmin();

  const { data: row, error } = await supabase.from("contact_messages").insert({
    name: String(name).trim(),
    phone: String(phone).trim(),
    // 資料表沒有 email 欄位：有填的話附在訊息最後，營主回覆時看得到
    message: (message ? String(message).trim() : "") + (cleanEmail ? "\n\n（客人 Email：" + cleanEmail + "）" : "") || null,
  }).select().single();

  if (error) {
    console.error("create-message insert error:", error);
    return res.status(500).json({ error: "留言送出失敗，請稍後再試或直接致電營主" });
  }

  // 留言處理台：已匯款且對帳完成的客人 → 自動回「營位保留成功＋訂單編號」；需要大哥回答的 → 立刻 email 通知大哥。
  // 任何一步失敗都不能影響留言送出。
  let handled = null;
  try {
    const settings = await getSettings(supabase);
    handled = await handleNewMessage(supabase, row, settings);
  } catch (e) {
    console.error("message desk error:", e);
  }

  // 一般自動回覆：有留 email、而且沒有收到「保留成功」信時，才寄「已收到您的訊息」（失敗不影響留言送出）
  if (cleanEmail && !(handled && handled.customerMailed)) await sendMessageAutoReply({ email: cleanEmail, name });

  const auto = handled && handled.replied && handled.decision.reply ? handled.decision.reply : { zh: AUTO_REPLY_ZH, en: AUTO_REPLY_EN };
  return res.status(200).json({ ok: true, autoReply: auto });
}
