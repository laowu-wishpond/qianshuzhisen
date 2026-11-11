// POST /api/admin-reconcile  （只有完整管理者 admin 可用，唯讀帳號不行）
//   { action: "match",   text }        → 把銀行明細文字和「已回報末五碼、待對帳」的訂單比對，回傳每筆的結果（不改任何資料）
//   { action: "confirm", text, ids[] } → 對帳完成：只處理「重新比對後仍然完全相符」的訂單（伺服器自己再驗一次，不信任瀏覽器），
//                                        標記已對帳並寄「預約成功」信（每筆只寄一次，和後台「對帳完成」按鈕一樣）
import { getSupabaseAdmin } from "../lib/supabase.js";
import { getRole } from "../lib/adminAuth.js";
import { reconcile, STATUS } from "../lib/reconcile.js";
import { stayInfo } from "../lib/stay.js";
import { sendBookingConfirmed } from "../lib/email.js";

const COLS = "id, customer_name, customer_phone, customer_email, site_id, check_in, check_out, nights_count, booking_date, early_arrival, total_amount, payment_status, payment_verified, transfer_last5, transfer_reported_at, trashed, hold_expires_at, confirmation_email_sent_at";

function brief(b) {
  const st = stayInfo(b);
  return {
    id: b.id,
    code: String(b.id).slice(0, 8),
    name: b.customer_name,
    phone: b.customer_phone,
    site: b.site_id,
    start: st.start,
    end: st.end,
    early: st.early,
    total: Number(b.total_amount || 0),
    last5: b.transfer_last5 || "",
  };
}

async function loadPools(supabase) {
  await supabase.rpc("expire_stale_holds");
  const { data: reported, error } = await supabase
    .from("bookings").select(COLS)
    .eq("payment_status", "paid").eq("payment_verified", false).eq("trashed", false)
    .not("transfer_last5", "is", null)
    .limit(1000);
  if (error) throw error;
  const { data: pending } = await supabase
    .from("bookings").select(COLS)
    .eq("payment_status", "pending").eq("trashed", false)
    .gt("hold_expires_at", new Date().toISOString())
    .is("transfer_last5", null)
    .limit(1000);
  return { reported: reported || [], pending: pending || [] };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const role = getRole(req);
  if (!role) return res.status(401).json({ error: "未登入或登入已逾期，請重新登入" });
  if (role !== "admin") return res.status(403).json({ error: "唯讀帳號無法使用對帳輔助" });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action } = req.body || {};
  const text = String(req.body?.text || "").slice(0, 200000);
  if (!text.trim()) return res.status(400).json({ error: "沒有明細內容，請先貼上或上傳截圖" });

  const supabase = getSupabaseAdmin();
  let pools;
  try { pools = await loadPools(supabase); } catch (e) {
    console.error("admin-reconcile load error:", e);
    return res.status(500).json({ error: "讀取訂單失敗，請稍後再試" });
  }
  const out = reconcile(text, pools.reported, pools.pending);
  const byId = new Map([...pools.reported, ...pools.pending].map((b) => [b.id, b]));

  if (action === "match") {
    const rows = out.results.map((r) => ({ ...brief(byId.get(r.id)), status: r.status, note: r.note, line: r.line, seen: r.seen }));
    const unmatched = out.unmatched.map((u) => ({
      line: u.line, amounts: u.amounts,
      maybe: u.maybe.map((id) => brief(byId.get(id))),
    }));
    return res.status(200).json({ ok: true, lineCount: out.lineCount, counts: out.counts, rows, unmatched, reportedTotal: pools.reported.length });
  }

  if (action === "confirm") {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => typeof x === "string") : [];
    if (!ids.length) return res.status(400).json({ error: "沒有選任何訂單" });
    const okSet = new Set(out.results.filter((r) => r.status === STATUS.OK).map((r) => r.id));
    const done = [];
    const skipped = [];
    let emailSent = 0, emailFail = 0, noEmail = 0;
    for (const id of ids) {
      if (!okSet.has(id)) { skipped.push(id); continue; }
      const { data: upd, error } = await supabase
        .from("bookings")
        .update({ payment_verified: true })
        .eq("id", id).eq("payment_status", "paid").eq("payment_verified", false)
        .select("*").maybeSingle();
      if (error || !upd) { skipped.push(id); continue; }
      done.push(id);
      if (!upd.confirmation_email_sent_at) {
        const r = await sendBookingConfirmed(upd);
        if (r.sent) { emailSent += 1; await supabase.from("bookings").update({ confirmation_email_sent_at: new Date().toISOString() }).eq("id", id); }
        else if (r.reason === "no_email") noEmail += 1;
        else emailFail += 1;
      }
    }
    return res.status(200).json({ ok: true, done: done.length, skipped: skipped.length, emailSent, emailFail, noEmail });
  }

  return res.status(400).json({ error: "不明的動作" });
}
