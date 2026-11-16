// GET   /api/admin-bookings?from=YYYY-MM-DD&to=YYYY-MM-DD&status=pending  → 查訂單列表
// PATCH /api/admin-bookings  { id, payment_status }                       → 更新單筆訂單狀態
// GET   /api/admin-bookings?blocks=1                                      → 列出目前「包場／封鎖營位」
// POST  /api/admin-bookings  { action:"block-create", name, checkIn, checkOut, sites[], note } → 建立包場
// POST  /api/admin-bookings  { action:"block-remove", group_id }          → 解除包場
// 兩支都需要先登入（admin_session cookie 合法）才能用。
import { getSupabaseAdmin } from "../lib/supabase.js";
import { getRole, maskPhone } from "../lib/adminAuth.js";
import { sendBookingConfirmed, sendGroupConfirmed, emailConfigured } from "../lib/email.js";
import { loadNights } from "../lib/cart.js";
import { SITES, isValidISODate, addDays, dayTypeOf } from "../lib/pricing.js";

const ALLOWED_STATUS = ["pending", "paid", "failed", "cancelled"];

// 購物車整筆訂單：把每筆訂單附上整筆的編號、筆數、合計（列表上要以「一整筆」顯示）
async function attachGroups(supabase, bookings) {
  const gids = [...new Set(bookings.map((b) => b.group_id).filter(Boolean))];
  if (!gids.length) return bookings;
  const { data: gs } = await supabase.from("booking_groups").select("id,item_count,total_amount").in("id", gids);
  const m = new Map((gs || []).map((g) => [g.id, g]));
  return bookings.map((b) => {
    const g = b.group_id && m.get(b.group_id);
    return g ? { ...b, group_code: String(b.group_id).slice(0, 8), group_count: g.item_count, group_total: g.total_amount } : b;
  });
}

// 恢復已取消的訂單（單筆與整筆共用）
async function restoreBooking(supabase, id) {
  const { data: bk, error: bkErr } = await supabase.from("bookings").select("*").eq("id", id).maybeSingle();
  if (bkErr || !bk) return { ok: false, status: 404, error: "找不到這筆訂單" };
  if (bk.payment_status !== "cancelled") return { ok: false, status: 400, error: "這筆不是已取消狀態" };
  const { data: nights } = await supabase.from("booking_nights").select("site_id,night_date").eq("booking_id", id);
  for (const n of nights || []) {
    const { data: clash } = await supabase
      .from("booking_nights").select("id")
      .eq("site_id", n.site_id).eq("night_date", n.night_date).eq("is_active", true).neq("booking_id", id).limit(1);
    if (clash && clash.length) return { ok: false, status: 409, error: "無法恢復：" + n.site_id + " 營位 " + n.night_date + " 那晚已被別人訂走了。" };
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
    return { ok: false, status: rErr.code === "23505" ? 409 : 500, error: rErr.code === "23505" ? "無法恢復：該營位日期已被別人訂走了。" : "恢復失敗" };
  }
  return { ok: true, state };
}


// ===== 包場／封鎖營位 =====
// 做法：幫每個營位建一筆「已付款、已對帳」的 0 元訂單（名稱以「包場 」開頭）並佔住每一晚，
// 預約頁就會顯示額滿。不寄任何 Email（沒有 Email、也標成已寄過），不算入每日待處理。
const BLOCK_PHONE = "0939235168";
const BLOCK_PREFIX = "包場 ";
const BLOCK_MAX_NIGHTS = 30;
const todayTW = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });

async function listBlocks(supabase) {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, group_id, customer_name, check_in, check_out, site_id, notes")
    .like("customer_name", BLOCK_PREFIX + "%")
    .eq("trashed", false)
    .neq("payment_status", "cancelled")
    .gte("check_out", todayTW())
    .order("check_in", { ascending: true })
    .limit(2000);
  if (error) { console.error("admin-bookings blocks list error:", error); return { ok: false, status: 500, error: "讀取包場失敗" }; }
  const map = new Map();
  for (const b of data || []) {
    const key = b.group_id || b.id;
    if (!map.has(key)) map.set(key, { group_id: b.group_id || null, id: b.id, name: String(b.customer_name).slice(BLOCK_PREFIX.length), check_in: b.check_in, check_out: b.check_out, sites: [] });
    map.get(key).sites.push(b.site_id);
  }
  return { ok: true, blocks: [...map.values()] };
}

async function createBlock(supabase, body) {
  const name = String(body.name || "").trim().slice(0, 30);
  if (!name) return { ok: false, status: 400, error: "請填包場名稱（例如：○○公司團客）" };
  const checkIn = body.checkIn, checkOut = body.checkOut;
  if (!isValidISODate(checkIn) || !isValidISODate(checkOut)) return { ok: false, status: 400, error: "請選入住日與退房日" };
  if (checkOut <= checkIn) return { ok: false, status: 400, error: "退房日要比入住日晚（例如 3/28 入住、3/29 退房＝鎖 3/28 那一晚）" };
  const dates = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) dates.push(d);
  if (dates.length > BLOCK_MAX_NIGHTS) return { ok: false, status: 400, error: "一次最多鎖 " + BLOCK_MAX_NIGHTS + " 晚" };
  const valid = new Set(SITES.map((x) => x.id));
  const sites = [...new Set((Array.isArray(body.sites) ? body.sites : []).map(String))].filter((x) => valid.has(x));
  if (!sites.length) return { ok: false, status: 400, error: "請至少選一個營位區域" };
  const note = String(body.note || "").trim().slice(0, 200);

  await supabase.rpc("expire_stale_holds");
  // 已經被別人訂走的就不能包（不會蓋掉客人的訂單）
  const { data: clash, error: cErr } = await supabase
    .from("booking_nights").select("booking_id, site_id, night_date")
    .eq("is_active", true).in("site_id", sites).gte("night_date", checkIn).lt("night_date", checkOut).limit(500);
  if (cErr) { console.error("admin-bookings block clash error:", cErr); return { ok: false, status: 500, error: "檢查營位失敗" }; }
  if (clash && clash.length) {
    const ids = [...new Set(clash.map((c) => c.booking_id))];
    const { data: bs } = await supabase.from("bookings").select("id, customer_name").in("id", ids.slice(0, 200));
    const nm = new Map((bs || []).map((b) => [b.id, b.customer_name]));
    const sample = clash.slice(0, 8).map((c) => c.site_id + " " + Number(c.night_date.slice(5, 7)) + "/" + Number(c.night_date.slice(8, 10)) + "（" + (nm.get(c.booking_id) || "?") + "）").join("、");
    return { ok: false, status: 409, error: "這段日期有 " + clash.length + " 個營位晚數已經被訂走，無法包場：" + sample + (clash.length > 8 ? " …" : "") + "。請先處理那幾筆訂單，或調整日期／範圍。" };
  }

  const now = new Date().toISOString();
  const { data: group, error: gErr } = await supabase.from("booking_groups")
    .insert({ customer_name: BLOCK_PREFIX + name, customer_phone: BLOCK_PHONE, customer_email: null, item_count: sites.length, total_amount: 0 })
    .select().single();
  if (gErr || !group) { console.error("admin-bookings block group error:", gErr); return { ok: false, status: 500, error: "建立包場失敗" }; }
  const rollback = async (bookingIds) => {
    if (bookingIds.length) {
      await supabase.from("booking_nights").delete().in("booking_id", bookingIds);
      await supabase.from("bookings").delete().in("id", bookingIds);
    }
    await supabase.from("booking_groups").delete().eq("id", group.id);
  };
  const text = BLOCK_PREFIX + name + "（" + checkIn + "～" + checkOut + "，共 " + sites.length + " 個營位；由後台建立" + (note ? "；備註：" + note : "") + "；金額另外結算）";
  const rows = sites.map((siteId) => ({
    customer_name: BLOCK_PREFIX + name, customer_phone: BLOCK_PHONE, customer_email: null,
    booking_date: checkIn, tents_count: 1, people_per_tent: 1, per_tent_price: null, total_amount: 0,
    payment_method: "bank_transfer", payment_status: "paid", payment_verified: true,
    notes: text, site_id: siteId, check_in: checkIn, check_out: checkOut, nights_count: dates.length,
    handled: true, handled_at: now, confirmation_email_sent_at: now, received_email_sent_at: now,
    group_id: group.id,
  }));
  const { data: bks, error: bErr } = await supabase.from("bookings").insert(rows).select("id, site_id");
  if (bErr || !bks || bks.length !== rows.length) {
    console.error("admin-bookings block bookings error:", bErr);
    await rollback(bks ? bks.map((b) => b.id) : []);
    return { ok: false, status: 500, error: "建立包場失敗" };
  }
  const nightRows = [];
  for (const b of bks) for (const d of dates) nightRows.push({ booking_id: b.id, site_id: b.site_id, night_date: d, kind: "regular", day_type: dayTypeOf(d), price: 0 });
  const { error: nErr } = await supabase.from("booking_nights").insert(nightRows);
  if (nErr) {
    await rollback(bks.map((b) => b.id));
    if (nErr.code === "23505") return { ok: false, status: 409, error: "剛剛有客人訂走了其中一個營位，包場沒有成立，請重新整理後再試一次。" };
    console.error("admin-bookings block nights error:", nErr);
    return { ok: false, status: 500, error: "建立包場失敗" };
  }
  return { ok: true, group_id: group.id, sites: sites.length, nights: dates.length };
}

async function removeBlock(supabase, body) {
  const gid = String(body.group_id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gid)) return { ok: false, status: 400, error: "缺少包場編號" };
  const { data: rows, error } = await supabase.from("bookings").select("id, customer_name").eq("group_id", gid);
  if (error) return { ok: false, status: 500, error: "讀取包場失敗" };
  if (!rows || !rows.length) return { ok: false, status: 404, error: "找不到這個包場（可能已經解除了）" };
  // 保險：只刪名稱以「包場 」開頭的，絕不碰客人的訂單
  if (rows.some((r) => !String(r.customer_name).startsWith(BLOCK_PREFIX))) return { ok: false, status: 400, error: "這不是包場，不能用這裡解除" };
  const ids = rows.map((r) => r.id);
  await supabase.from("booking_nights").delete().in("booking_id", ids);
  const { error: dErr } = await supabase.from("bookings").delete().in("id", ids);
  if (dErr) { console.error("admin-bookings block remove error:", dErr); return { ok: false, status: 500, error: "解除包場失敗" }; }
  await supabase.from("booking_groups").delete().eq("id", gid);
  return { ok: true, removed: ids.length };
}

export default async function handler(req, res) {
  const role = getRole(req);
  if (!role) {
    return res.status(401).json({ error: "未登入或登入已逾期，請重新登入" });
  }

  const supabase = getSupabaseAdmin();

  if (req.method === "GET" && req.query.blocks) {
    const r = await listBlocks(supabase);
    return r.ok ? res.status(200).json({ blocks: r.blocks }) : res.status(r.status).json({ error: r.error });
  }

  if (req.method === "POST") {
    if (role !== "admin") return res.status(403).json({ error: "唯讀帳號無法設定包場" });
    const body = req.body || {};
    let r;
    if (body.action === "block-create") r = await createBlock(supabase, body);
    else if (body.action === "block-remove") r = await removeBlock(supabase, body);
    else return res.status(400).json({ error: "未知的動作" });
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    const { ok, ...rest } = r;
    return res.status(200).json({ ok: true, ...rest });
  }

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
        const { data: gs } = await supabase.from("booking_groups").select("id")
          .gte("id", `${c}-0000-0000-0000-000000000000`).lte("id", `${c}-ffff-ffff-ffff-ffffffffffff`);
        for (const g of gs || []) {
          const { data: gb } = await supabase.from("bookings").select("*").eq("group_id", g.id);
          addRows(gb);
        }
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
      list = await attachGroups(supabase, list);
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
      merged = await attachGroups(supabase, merged);
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
    bookings = await attachGroups(supabase, bookings);
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
    // ===== 購物車整筆訂單：groupId 帶整筆的 id，底下所有營位一起處理，只寄一封信 =====
    // ===== 標記已退款（客人自己取消後，營主匯款完按這顆）=====
    if (req.body?.refundDone === true && id) {
      const { data: one } = await supabase.from("bookings").select("id, group_id").eq("id", id).maybeSingle();
      if (!one) return res.status(404).json({ error: "找不到這筆訂單" });
      let q = supabase.from("bookings").update({ refund_status: "done", refund_done_at: new Date().toISOString(), handled: true, handled_at: new Date().toISOString() }).eq("refund_status", "pending");
      q = one.group_id ? q.eq("group_id", one.group_id) : q.eq("id", id);
      const { error: rErr } = await q;
      if (rErr) {
        console.error("admin-bookings refundDone error:", rErr);
        return res.status(500).json({ error: "更新失敗" });
      }
      return res.status(200).json({ ok: true });
    }
    const groupId = req.body?.groupId;
    if (typeof groupId === "string" && groupId) {
      const { data: members, error: mErr } = await supabase.from("bookings").select("*").eq("group_id", groupId);
      if (mErr || !members || !members.length) return res.status(404).json({ error: "找不到這筆整筆訂單" });
      const sendAll = async (rows) => {
        const nights = await loadNights(supabase, rows.map((b) => b.id));
        const r = await sendGroupConfirmed(rows, nights);
        if (r.sent) await supabase.from("bookings").update({ confirmation_email_sent_at: new Date().toISOString() }).in("id", rows.map((b) => b.id));
        return r.sent ? "sent" : r.reason;
      };
      if (resend === true) {
        const live = members.filter((b) => b.payment_status === "paid");
        if (!live.length) return res.status(400).json({ error: "這筆還不是已付款狀態，請先按「整筆對帳完成」" });
        return res.status(200).json({ ok: true, email: await sendAll(live) });
      }
      if (restore === true) {
        const cancelled = members.filter((b) => b.payment_status === "cancelled");
        if (!cancelled.length) return res.status(400).json({ error: "這筆整筆訂單沒有已取消的營位" });
        const results = [];
        for (const b of cancelled) results.push({ id: b.id, site: b.site_id, ...(await restoreBooking(supabase, b.id)) });
        const failed = results.filter((x) => !x.ok);
        if (failed.length) {
          return res.status(409).json({ error: failed.map((x) => x.site + "：" + x.error).join("；") + (results.length > failed.length ? "（其他營位已恢復）" : "") });
        }
        return res.status(200).json({ ok: true, count: results.length, state: results[0].state });
      }
      if (payment_status) {
        if (!ALLOWED_STATUS.includes(payment_status)) return res.status(400).json({ error: "不合法的狀態值" });
        const targets = members.filter((b) => b.payment_status !== "cancelled" || payment_status === "cancelled");
        if (!targets.length) return res.status(400).json({ error: "這筆整筆訂單沒有可處理的營位" });
        const patch = { payment_status };
        if (payment_status === "paid") patch.payment_verified = true;
        const { data: updated, error: uErr } = await supabase.from("bookings").update(patch).in("id", targets.map((b) => b.id)).select("*");
        if (uErr || !updated) {
          console.error("admin-bookings group PATCH error:", uErr);
          return res.status(500).json({ error: "更新訂單狀態失敗" });
        }
        let email = null;
        if (payment_status === "paid" && updated.some((b) => !b.confirmation_email_sent_at)) email = await sendAll(updated);
        return res.status(200).json({ ok: true, email, emailConfigured: emailConfigured(), count: updated.length });
      }
      return res.status(400).json({ error: "缺少要執行的動作" });
    }
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
      const r = await restoreBooking(supabase, id);
      if (!r.ok) return res.status(r.status).json({ error: r.error });
      return res.status(200).json({ ok: true, state: r.state });
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
