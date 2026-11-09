// GET   /api/admin-messages           → 查留言列表
// PATCH /api/admin-messages { id, status } → 更新單筆留言狀態（new / read）
import { getSupabaseAdmin } from "../lib/supabase.js";
import { getRole, maskPhone } from "../lib/adminAuth.js";

const ALLOWED_STATUS = ["new", "read", "replied"];

export default async function handler(req, res) {
  const role = getRole(req);
  if (!role) {
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
    let messages = data || [];
    if (role !== "admin") {
      messages = messages.map((m) => ({ ...m, phone: maskPhone(m.phone) }));
    }
    return res.status(200).json({ messages, role });
  }

  if (req.method === "PATCH") {
    if (role !== "admin") {
      return res.status(403).json({ error: "唯讀帳號無法修改留言" });
    }
    const { id, status, reply, is_public } = req.body || {};
    if (!id) return res.status(400).json({ error: "缺少 id" });
    const patch = {};
    if (status !== undefined) {
      if (!ALLOWED_STATUS.includes(status)) return res.status(400).json({ error: "不合法的狀態" });
      patch.status = status;
    }
    if (reply !== undefined) {
      const text = String(reply || "").trim().slice(0, 600);
      patch.reply = text || null;
      patch.replied_at = text ? new Date().toISOString() : null;
      if (text) patch.status = "replied";
      else if (status === undefined) patch.status = "read";
    }
    if (is_public !== undefined) patch.is_public = !!is_public;
    if (!Object.keys(patch).length) return res.status(400).json({ error: "沒有要更新的內容" });
    const { error } = await supabase
      .from("contact_messages")
      .update(patch)
      .eq("id", id);

    if (error) {
      console.error("admin-messages PATCH error:", error);
      return res.status(500).json({ error: "更新失敗" });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
