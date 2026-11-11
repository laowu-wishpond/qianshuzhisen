// 客人「再給我 6 小時」。
//   GET  /api/extend-hold?b=<訂單完整編號>  → 回傳這筆訂單的狀態（給 extend.html 顯示用）
//   POST /api/extend-hold { bookingId }     → 把保留時間多延 EXTEND_HOURS 小時（每筆最多 MAX_EXTENSIONS 次），並 email 通知大哥
// 只有「待匯款、保留時間還沒到」的訂單才能延長；已經釋出的營位可能被別人訂走，不能延長。
import { getSupabaseAdmin } from "../lib/supabase.js";
import { stayInfo } from "../lib/stay.js";
import { EXTEND_HOURS, MAX_EXTENSIONS } from "../lib/siteStatus.js";
import { emailConfigured, postBatch } from "../lib/email.js";
import { ownerExtendPayload, getSettings } from "../lib/reminders.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = "id, customer_name, customer_phone, site_id, check_in, check_out, nights_count, booking_date, early_arrival, total_amount, payment_status, payment_verified, trashed, hold_expires_at, hold_extensions, transfer_last5";

function stateOf(b) {
  if (b.trashed || b.payment_status === "cancelled" || b.payment_status === "failed") return "cancelled";
  if (b.payment_status === "paid") return b.payment_verified ? "confirmed" : "reported";
  if (b.payment_status === "pending") return b.hold_expires_at && new Date(b.hold_expires_at) > new Date() ? "awaiting_payment" : "expired";
  return "cancelled";
}

function view(b) {
  const st = stayInfo(b);
  const state = stateOf(b);
  return {
    ok: true,
    state,
    code: String(b.id).slice(0, 8),
    site: b.site_id,
    start: st.start,
    end: st.end,
    early: st.early,
    nights: st.nights,
    total: Number(b.total_amount || 0),
    holdExpiresAt: state === "awaiting_payment" ? b.hold_expires_at : null,
    extensions: b.hold_extensions || 0,
    canExtend: state === "awaiting_payment" && (b.hold_extensions || 0) < MAX_EXTENSIONS,
    extendHours: EXTEND_HOURS,
  };
}

// ---- 購物車整筆訂單：id 可以是整筆訂單 id；底下所有營位一起延長 ----
async function loadGroup(supabase, id) {
  const { data: g } = await supabase.from("booking_groups").select("id").eq("id", id).maybeSingle();
  if (!g) return null;
  const { data: rows } = await supabase.from("bookings").select(COLS).eq("group_id", id);
  return rows && rows.length ? rows : null;
}

function groupView(rows, gid) {
  const states = rows.map(stateOf);
  const pending = rows.filter((b, i) => states[i] === "awaiting_payment");
  const alive = rows.filter((b, i) => states[i] !== "cancelled" && states[i] !== "expired");
  let state;
  if (pending.length) state = "awaiting_payment";
  else if (alive.length && alive.every((b) => stateOf(b) === "confirmed")) state = "confirmed";
  else if (alive.length) state = "reported";
  else state = states.includes("expired") ? "expired" : "cancelled";
  const stays = (alive.length ? alive : rows).map(stayInfo);
  return {
    ok: true,
    group: true,
    state,
    code: String(gid).slice(0, 8),
    site: (alive.length || rows.length) + " 個營位（整筆訂單）",
    start: stays.map((x) => x.start).sort()[0] || "",
    end: stays.map((x) => x.end).sort().slice(-1)[0] || "",
    early: stays.some((x) => x.early),
    nights: stays.reduce((s, x) => s + x.nights, 0),
    total: (alive.length ? alive : rows).reduce((s, b) => s + Number(b.total_amount || 0), 0),
    holdExpiresAt: state === "awaiting_payment" ? pending.map((b) => b.hold_expires_at).sort()[0] : null,
    extensions: Math.max(...rows.map((b) => b.hold_extensions || 0)),
    canExtend: state === "awaiting_payment" && pending.every((b) => (b.hold_extensions || 0) < MAX_EXTENSIONS),
    extendHours: EXTEND_HOURS,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const supabase = getSupabaseAdmin();

  if (req.method === "GET") {
    const id = String(req.query?.b || "");
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "連結不正確" });
    await supabase.rpc("expire_stale_holds");
    const { data: b } = await supabase.from("bookings").select(COLS).eq("id", id).maybeSingle();
    if (!b) {
      const rows = await loadGroup(supabase, id);
      if (rows) return res.status(200).json(groupView(rows, id));
      return res.status(404).json({ error: "找不到這筆訂單" });
    }
    return res.status(200).json(view(b));
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const id = String(req.body?.bookingId || "");
  if (!UUID_RE.test(id)) return res.status(400).json({ error: "訂單編號不正確" });

  await supabase.rpc("expire_stale_holds");
  const { data: cur } = await supabase.from("bookings").select(COLS).eq("id", id).maybeSingle();
  if (!cur) {
    const rows = await loadGroup(supabase, id);
    if (!rows) return res.status(404).json({ error: "找不到這筆訂單" });
    const gv = groupView(rows, id);
    if (gv.state !== "awaiting_payment") {
      return res.status(409).json({ error: "這筆訂單的保留時間已過或已處理，無法延長。如果您已匯款，請直接電話聯絡我們（0939-235-168）。", ...gv });
    }
    if (!gv.canExtend) {
      return res.status(409).json({ error: "這筆訂單已經延長過了，無法再延長。需要幫忙請電話聯絡我們（0939-235-168）。", ...gv });
    }
    let n = 0;
    const done = [];
    for (const b of rows.filter((x) => stateOf(x) === "awaiting_payment")) {
      const newExpiry = new Date(new Date(b.hold_expires_at).getTime() + EXTEND_HOURS * 3600 * 1000).toISOString();
      const { data: u } = await supabase
        .from("bookings")
        .update({ hold_expires_at: newExpiry, hold_extensions: (b.hold_extensions || 0) + 1, final_reminder_sent_at: null })
        .eq("id", b.id).eq("payment_status", "pending").eq("trashed", false)
        .eq("hold_extensions", b.hold_extensions || 0).gt("hold_expires_at", new Date().toISOString())
        .select(COLS).maybeSingle();
      if (u) { n += 1; done.push(u); }
    }
    if (!n) return res.status(409).json({ error: "這筆訂單剛剛已被處理，請重新整理頁面確認狀態。" });
    try {
      if (emailConfigured()) {
        const settings = await getSettings(supabase);
        if (settings.owner_email) {
          const first = done[0];
          await postBatch([ownerExtendPayload(settings.owner_email, { ...first, site_id: done.length + " 個營位（整筆 " + String(id).slice(0, 8) + "）", total_amount: done.reduce((s, b) => s + Number(b.total_amount || 0), 0) })]);
        }
      }
    } catch (e) {
      console.error("extend-hold group owner notify error:", e);
    }
    const { data: fresh } = await supabase.from("bookings").select(COLS).eq("group_id", id);
    return res.status(200).json(groupView(fresh || rows, id));
  }
  const v = view(cur);
  if (v.state !== "awaiting_payment") {
    return res.status(409).json({ error: "這筆訂單的保留時間已過或已處理，無法延長。如果您已匯款，請直接電話聯絡我們（0939-235-168）。", ...v });
  }
  if (!v.canExtend) {
    return res.status(409).json({ error: "這筆訂單已經延長過了，無法再延長。需要幫忙請電話聯絡我們（0939-235-168）。", ...v });
  }

  const newExpiry = new Date(new Date(cur.hold_expires_at).getTime() + EXTEND_HOURS * 3600 * 1000).toISOString();
  // 條件式更新：同時按兩次、或別人剛好處理過，只會有一次成功
  const { data: upd, error } = await supabase
    .from("bookings")
    .update({
      hold_expires_at: newExpiry,
      hold_extensions: (cur.hold_extensions || 0) + 1,
      final_reminder_sent_at: null,
    })
    .eq("id", id)
    .eq("payment_status", "pending")
    .eq("trashed", false)
    .eq("hold_extensions", cur.hold_extensions || 0)
    .gt("hold_expires_at", new Date().toISOString())
    .select(COLS)
    .maybeSingle();
  if (error) {
    console.error("extend-hold error:", error);
    return res.status(500).json({ error: "延長失敗，請稍後再試或直接電話聯絡我們" });
  }
  if (!upd) return res.status(409).json({ error: "這筆訂單剛剛已被處理，請重新整理頁面確認狀態。" });

  // 通知大哥（失敗不影響客人）
  try {
    if (emailConfigured()) {
      const settings = await getSettings(supabase);
      if (settings.owner_email) await postBatch([ownerExtendPayload(settings.owner_email, upd)]);
    }
  } catch (e) {
    console.error("extend-hold owner notify error:", e);
  }
  return res.status(200).json(view(upd));
}
