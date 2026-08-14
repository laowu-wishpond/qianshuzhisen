// GET   /api/admin-messages           → 查留言列表
// PATCH /api/admin-messages { id, status } → 更新單筆留言狀態（new / read）
import { getSupabaseAdmin } from "../lib/supabase.js";
import { isAuthorized } from "../lib/adminAuth.js";

const ALLOWED_STATUS = ["new", "read"];

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "未登入或登入已逾期，請重新登入" });
  }

  const supabase = getSupabaseAdmin();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("contact_messages")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("admin-messages GET error:", error);
      return res.status(500).json({ error: "查詢留言失敗" });
    }
    return res.status(200).json({ messages: data || [] });
  }

  if (req.method === "PATCH") {
    const { id, status } = req.body || {};
    if (!id || !status || !ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({ error: "缺少或不合法的參數" });
    }
    const { error } = await supabase
      .from("contact_messages")
      .update({ status })
      .eq("id", id);

    if (error) {
      console.error("admin-messages PATCH error:", error);
      return res.status(500).json({ error: "更新失敗" });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
