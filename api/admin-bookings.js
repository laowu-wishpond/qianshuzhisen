// GET   /api/admin-bookings?from=YYYY-MM-DD&to=YYYY-MM-DD&status=pending  → 查訂單列表
// PATCH /api/admin-bookings  { id, payment_status }                       → 更新單筆訂單狀態
// 兩支都需要先登入（admin_session cookie 合法）才能用。
import { getSupabaseAdmin } from "../lib/supabase.js";
import { getRole, maskPhone } from "../lib/adminAuth.js";
import { sendBookingConfirmed, emailConfigured } from "../lib/email.js";

const ALLOWED_STATUS = ["pending", "paid", "failed", "cancelled"];

export default async function handler(req, res) {
  const role = getRole(req);
  if (!role) {
    return res.status(401).json({ error: "未登入或登入已逾期，請重新登入" });
  }

  const supabase = getSupabaseAdmin();

  if (req.method === "GET") {
    await supabase.rpc("expire_stale_holds");
    const { from, to, status, last4 } = req.query;
    // 末四碼查詢：輸入 4 碼（或 5 碼）數字，找匯款末五碼結尾相符的訂單；查詢時不受日期／狀態篩選限制
    const searchDigits = last4 ? String(last4).trim() : "";
    if (searchDigits && !/^\d{4,5}$/.test(searchDigits)) {
      return res.status(400).json({ error: "請輸入 4 或 5 位數字" });
    }
    // 搜尋：訂單編號（8 碼）／姓名／電話。不受日期、狀態篩選影響，垃圾桶裡的也找得到。
    const qRaw = String(req.query.q || "").trim().slice(0, 40);
    if (qRaw) {
      const found = new Map();
      const addRows = (rows) => (rows || []).forEach((b) => found.set(b.id, b));
      if (/^[0-9a-f]{8}$/i.test(qRaw)) {
        const c = qRaw.toLowerCase();
        const { data: byId } = await supabase.from("bookings").select("*")
          .gte("id", `${c}-0000-0000-0000-000000000000`).lte("id", `${c}-ffff-ffff-ffff-ffffffffffff`);
        addRows(byId);
      }
      const safe = qRaw.replace(/[%,()*\\]/g, "");
      if (safe) {
        const digitsQ = safe.replace(/\D/g, "");
        let orF = `customer_name.ilike.%${safe}%`;
        if (digitsQ.length >= 3) orF += `,customer_phone.like.%${digitsQ}%`;
        const { data: byText, error: qErr } = await supabase.from("bookings").select("*").or(orF).limit(100);
        if (qErr) { console.error("admin-bookings search error:", qErr); return res.status(500).json({ error: "搜尋失敗" }); }
        addRows(byText);
      }
      let list = [...found.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      if (role !== "admin") list = list.map((b) => ({ ...b, customer_phone: maskPhone(b.customer_phone) }));
      return res.status(200).json({ bookings: list, role });
    }

    // 末碼查詢：① 客人在「查詢訂單」頁回報的末五碼 ② 客人在「聯絡表單留言」裡寫的末碼（用留言的電話找出他的訂單）
    if (searchDigits) {
      const { data: byLast5, error: e1 } = await supabase
        .from("bookings").select("*").eq("trashed", false)
        .not("transfer_last5", "is", null).like("transfer_last5", "%" + searchDigits);
      if (e1) { console.error("admin-bookings last4 error:", e1); return res.status(500).json({ error: "查詢訂單失敗" }); }
      const { data: msgs } = await supabase
        .from("contact_messages").select("phone,message").ilike("message", "%" + searchDigits + "%");
      const snippetByPhone = new Map();
      (msgs || []).forEach((m) => {
        if (m.phone && !snippetByPhone.has(m.phone)) snippetByPhone.set(m.phone, String(m.message || "").replace(/\s+/g, " ").slice(0, 60));
      });
      let byMsg = [];
      if (snippetByPhone.size) {
        const { data: b2 } = await supabase
          .from("bookings").select("*").eq("trashed", false).gt("total_amount", 0)
          .in("customer_phone", [...snippetByPhone.keys()]);
        byMsg = (b2 || []).map((b) => ({ ...b, via_message: snippetByPhone.get(b.customer_phone) }));
      }
      const seen = new Set((byLast5 || []).map((b) => b.id));
      let merged = [...(byLast5 || []), ...byMsg.filter((b) => !seen.has(b.id))];
      merged.sort((a, b) => String(a.check_in || a.booking_date || "").localeCompare(String(b.check_in || b.booking_date || "")));
      if (role !== "admin") merged = merged.map((b) => ({ ...b, customer_phone: maskPhone(b.customer_phone) }));
      return res.status(200).json({ bookings: merged, role });
    }

    let query = supabase
      .from("bookings")
      .select("*")
      .order("booking_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (status === "trashed") {
      query = query.eq("trashed", true);
      if (from) query = query.gte("booking_date", from);
      if (to) query = query.lte("booking_date", to);
    } else {
      query = query.eq("trashed", false);
      if (from) query = query.gte("booking_date", from);
      if (to) query = query.lte("booking_date", to);
      if (status === "unreported") query = query.eq("payment_status", "pending").is("transfer_last5", null).gt("total_amount", 0);
      else if (status === "unverified") query = query.eq("payment_status", "paid").eq("payment_verified", false);
      else if (status && ALLOWED_STATUS.includes(status)) query = query.eq("payment_status", status);
    }

    const { data, error } = await query;
    if (error) {
      console.error("admin-bookings GET error:", error);
      return res.status(500).json({ error: "查詢訂單失敗" });
    }
    let bookings = data || [];
    // 已取消的訂單：若同一位客人（同電話）另有「有效」訂單，附上提示，避免大哥看錯那一筆
    const cancelledPhones = [...new Set(bookings.filter((b) => b.payment_status === "cancelled" && b.customer_phone).map((b) => b.customer_phone))];
    if (cancelledPhones.length) {
      const { data: alive } = await supabase
        .from("bookings")
        .select("id,customer_phone,site_id,check_in,payment_status,payment_verified")
        .in("customer_phone", cancelledPhones)
        .eq("trashed", false)
        .neq("payment_status", "cancelled")
        .gt("total_amount", 0);
      const byPhone = new Map();
      (alive || []).forEach((a) => {
        const st = a.payment_status === "paid" ? (a.payment_verified ? "已對帳" : "已付款待對帳") : "待匯款";
        const txt = String(a.id).slice(0, 8) + "（" + (a.site_id || "") + " " + (a.check_in || "") + "，" + st + "）";
        if (!byPhone.has(a.customer_phone)) byPhone.set(a.customer_phone, []);
        byPhone.get(a.customer_phone).push(txt);
      });
      bookings = bookings.map((b) =>
        b.payment_status === "cancelled" && byPhone.has(b.customer_phone) ? { ...b, active_alt: byPhone.get(b.customer_phone).join("、") } : b
      );
    }
    // 唯讀角色看不到完整電話
    if (role !== "admin") {
      bookings = bookings.map((b) => ({ ...b, customer_phone: maskPhone(b.customer_phone) }));
    }
    return res.status(200).json({ bookings, role });
  }

  if (req.method === "PATCH") {
    if (role !== "admin") {
      return res.status(403).json({ error: "唯讀帳號無法修改訂單" });
    }
    const { id, payment_status, handled, ids, trash, resend, restore } = req.body || {};
    // 補寄「預約成功」信（已對帳完成、當時還沒辦法寄信的客人）
    if (id && resend === true) {
      const { data: bk, error: bkErr } = await supabase.from("bookings").select("*").eq("id", id).maybeSingle();
      if (bkErr || !bk) return res.status(404).json({ error: "找不到這筆訂單" });
      if (bk.payment_status !== "paid") return res.status(400).json({ error: "這筆還不是已付款狀態，請先按「對帳完成」" });
      const r = await sendBookingConfirmed(bk);
      if (r.sent) await supabase.from("bookings").update({ confirmation_email_sent_at: new Date().toISOString() }).eq("id", id);
      return res.status(200).json({ ok: true, email: r.sent ? "sent" : r.reason });
    }
    // 恢復已取消的訂單（誤按取消、或客人又說要訂）。若營位日期已被別人訂走就不能恢復。
    if (id && restore === true) {
      const { data: bk, error: bkErr } = await supabase.from("bookings").select("*").eq("id", id).maybeSingle();
      if (bkErr || !bk) return res.status(404).json({ error: "找不到這筆訂單" });
      if (bk.payment_status !== "cancelled") return res.status(400).json({ error: "這筆不是已取消狀態" });
      const { data: nights } = await supabase.from("booking_nights").select("site_id,night_date").eq("booking_id", id);
      for (const n of nights || []) {
        const { data: clash } = await supabase
          .from("booking_nights")
          .select("id")
          .eq("site_id", n.site_id)
          .eq("night_date", n.night_date)
          .eq("is_active", true)
          .neq("booking_id", id)
          .limit(1);
        if (clash && clash.length) {
          return res.status(409).json({ error: "無法恢復：" + n.site_id + " 營位 " + n.night_date + " 那晚已被別人訂走了。" });
        }
      }
      // 恢復成什麼狀態：已對帳過→已付款；客人回報過末五碼→已付款（待對帳）；其他→待匯款（重新保留 24 小時）
      const patch = { trashed: false, trashed_at: null, cancel_reason: null, handled: false };
      let state;
      if (bk.payment_verified) { patch.payment_status = "paid"; state = "paid"; }
      else if (bk.transfer_last5) { patch.payment_status = "paid"; patch.payment_verified = false; state = "reported"; }
      else {
        patch.payment_status = "pending";
        patch.hold_expires_at = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        state = "pending";
      }
      const { error: rErr } = await supabase.from("bookings").update(patch).eq("id", id);
      if (rErr) {
        console.error("admin-bookings restore error:", rErr);
        return res.status(rErr.code === "23505" ? 409 : 500).json({ error: rErr.code === "23505" ? "無法恢復：該營位日期已被別人訂走了。" : "恢復失敗" });
      }
      return res.status(200).json({ ok: true, state });
    }
    // 批次：把打勾的訂單移到垃圾桶／從垃圾桶還原（不會真的刪除資料）
    if (Array.isArray(ids) && typeof trash === "boolean") {
      const list = ids.filter((x) => typeof x === "string").slice(0, 300);
      if (!list.length) return res.status(400).json({ error: "沒有選取訂單" });
      const { data: rows, error: selErr } = await supabase
        .from("bookings")
        .select("id,payment_status,payment_verified")
        .in("id", list);
      if (selErr) {
        console.error("admin-bookings trash select error:", selErr);
        return res.status(500).json({ error: "操作失敗" });
      }
      const okIds = [];
      let skipped = 0;
      (rows || []).forEach((r) => {
        // 已付款且已對帳的不能直接丟垃圾桶（請先確認要取消）
        if (trash && r.payment_status === "paid" && r.payment_verified) skipped += 1;
        else okIds.push(r.id);
      });
      if (okIds.length) {
        const now = new Date().toISOString();
        const patch = trash
          ? { trashed: true, trashed_at: now, payment_status: "cancelled", handled: false }
          : { trashed: false, trashed_at: null, handled: false };
        const { error: upErr } = await supabase.from("bookings").update(patch).in("id", okIds);
        if (upErr) {
          console.error("admin-bookings trash update error:", upErr);
          return res.status(500).json({ error: "操作失敗" });
        }
      }
      return res.status(200).json({ ok: true, moved: okIds.length, skipped });
    }
    if (id && typeof handled === "boolean" && !payment_status) {
      const { error: hErr } = await supabase
        .from("bookings")
        .update({ handled, handled_at: handled ? new Date().toISOString() : null })
        .eq("id", id);
      if (hErr) {
        console.error("admin-bookings handled error:", hErr);
        return res.status(500).json({ error: "更新失敗" });
      }
      return res.status(200).json({ ok: true });
    }
    if (!id || !payment_status) {
      return res.status(400).json({ error: "缺少 id 或 payment_status" });
    }
    if (!ALLOWED_STATUS.includes(payment_status)) {
      return res.status(400).json({ error: "不合法的狀態值" });
    }

    const patch = { payment_status };
    if (payment_status === "paid") patch.payment_verified = true; // 營主手動標記／按「對帳完成」＝已對帳

    const { data: updated, error } = await supabase
      .from("bookings")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error || !updated) {
      console.error("admin-bookings PATCH error:", error);
      return res.status(500).json({ error: "更新訂單狀態失敗" });
    }

    // 對帳完成 → 寄「預約成功」email（每筆只寄一次）
    let email = null;
    if (payment_status === "paid" && !updated.confirmation_email_sent_at) {
      const r = await sendBookingConfirmed(updated);
      if (r.sent) {
        await supabase.from("bookings").update({ confirmation_email_sent_at: new Date().toISOString() }).eq("id", id);
        email = "sent";
      } else {
        email = r.reason; // no_email / not_configured / send_failed
      }
    }
    return res.status(200).json({ ok: true, email, emailConfigured: emailConfigured() });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
