// POST /api/cancel-booking { code, phone, confirm }
// 客人自己取消訂位。沒帶 confirm＝只試算（回傳會退多少），confirm:true＝真的取消、釋出營位、通知大哥與客人。
// 規則與數字見 lib/refundPolicy.js（數字存在 automation_settings，可由大哥調整）。
//   ・尚未付款：免費取消，營位釋出。
//   ・已付款且已對帳：依「入住前幾天」計算退款，後台出現「待退款」，由營主聯絡客人退款。
//   ・已回報匯款但還在查帳／規則啟用前下的訂單：請客人電話聯絡（人工處理）。
import { getSupabaseAdmin } from "../lib/supabase.js";
import { stayInfo } from "../lib/stay.js";
import { bookingState, codeOf } from "../lib/cart.js";
import { getSettings } from "../lib/reminders.js";
import { readPolicy, policyApplies, calcRefund } from "../lib/refundPolicy.js";
import { emailConfigured, postBatch, customerCancelPayload, ownerCancelPayload } from "../lib/email.js";

const onlyDigits = (s) => String(s || "").replace(/\D/g, "");
const SITE_DEFAULT = "https://www.tsforest.com.tw";
const COLS = "id, group_id, created_at, customer_name, customer_phone, customer_email, site_id, check_in, check_out, nights_count, booking_date, total_amount, payment_status, payment_verified, hold_expires_at, cancel_reason, early_arrival, trashed";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const code = String(req.body?.code || "").trim().replace(/^#/, "").toLowerCase();
  const phone = onlyDigits(req.body?.phone);
  const confirm = req.body?.confirm === true;
  if (!/^[0-9a-f]{8}$/.test(code) || phone.length < 8) {
    return res.status(400).json({ error: "請先輸入訂單編號與預約時留的電話" });
  }

  const supabase = getSupabaseAdmin();
  await supabase.rpc("expire_stale_holds");
  const range = (q) => q.gte("id", `${code}-0000-0000-0000-000000000000`).lte("id", `${code}-ffff-ffff-ffff-ffffffffffff`);

  // 找出整筆訂單的所有營位
  let members = [];
  const { data: found } = await range(supabase.from("bookings").select(COLS)).limit(5);
  const b = (found || []).find((r) => onlyDigits(r.customer_phone) === phone);
  let gid = b?.group_id || null;
  if (!gid && !b) {
    const { data: gs } = await range(supabase.from("booking_groups").select("id, customer_phone")).limit(5);
    const g = (gs || []).find((r) => onlyDigits(r.customer_phone) === phone);
    if (g) gid = g.id;
  }
  if (gid) {
    const { data: rows } = await supabase.from("bookings").select(COLS).eq("group_id", gid).order("check_in", { ascending: true });
    members = rows || [];
  } else if (b) {
    members = [b];
  }
  if (!members.length) return res.status(404).json({ error: "查無這筆訂單。請確認訂單編號與電話是否與預約時相同。" });

  const alive = members.filter((m) => !["cancelled", "expired"].includes(bookingState(m)));
  if (!alive.length) return res.status(409).json({ error: "這筆訂單已經取消或已過期，不需要再取消。" });

  const states = alive.map(bookingState);
  const allPaid = states.every((s) => s === "confirmed");
  const allUnpaid = states.every((s) => s === "awaiting_payment");
  if (!allPaid && !allUnpaid) {
    return res.status(409).json({ manual: true, error: "這筆訂單正在查帳或付款狀態比較特殊，請直接電話聯絡我們（0939-235-168），我們會幫您處理。" });
  }

  const settings = await getSettings(supabase);
  const policy = readPolicy(settings);
  if (allPaid && alive.some((m) => !policyApplies(m, policy))) {
    return res.status(409).json({ manual: true, error: "這筆訂單的取消與退款，請直接電話聯絡我們（0939-235-168），我們會依訂位當時的規定幫您處理。" });
  }

  // 試算
  const now = Date.now();
  const items = alive.map((m) => {
    const st = stayInfo(m);
    const c = allPaid ? calcRefund(m, policy, now) : { total: Number(m.total_amount || 0), percent: 0, gross: 0, processingFee: 0, refund: 0, hoursLeft: 999 };
    return { id: m.id, code: codeOf(m.id), site: m.site_id, start: st.start, end: m.check_out, total: Number(m.total_amount || 0), percent: c.percent, gross: c.gross, paid: allPaid };
  });
  const grossAll = items.reduce((s, x) => s + x.gross, 0);
  const processingFee = grossAll > 0 ? Math.min(policy.processingFee, grossAll) : 0;
  let feeLeft = processingFee;
  items.forEach((it) => {
    const cut = Math.min(feeLeft, it.gross);
    it.refund = it.gross - cut;
    it.fee = cut;
    feeLeft -= cut;
  });
  const totals = { paid: allPaid, total: items.reduce((s, x) => s + x.total, 0), gross: grossAll, processingFee, refund: grossAll - processingFee };
  const view = items.map(({ code, site, start, end, total, percent, refund, paid }) => ({ code, site, start, end, total, percent, refund, paid }));

  if (!confirm) {
    return res.status(200).json({ ok: true, preview: true, items: view, totals, tiers: policy.tiers, processingFeeRule: policy.processingFee });
  }

  // 正式取消：每筆都要在「還沒被改過」的狀態才更新，避免重複按
  const nowIso = new Date().toISOString();
  let changed = 0;
  for (const it of items) {
    const { data: upd, error } = await supabase.from("bookings").update({
      payment_status: "cancelled",
      cancel_reason: "customer",
      cancelled_at: nowIso,
      refund_amount: allPaid ? it.refund : null,
      refund_fee: allPaid ? it.total - it.refund : null,
      refund_status: allPaid && it.refund > 0 ? "pending" : "none",
      handled: false,
    }).eq("id", it.id).in("payment_status", ["pending", "paid"]).select("id");
    if (error) {
      console.error("cancel-booking update error:", error);
      return res.status(500).json({ error: "取消失敗，請稍後再試，或直接電話聯絡我們（0939-235-168）" });
    }
    if (upd && upd.length) changed += 1;
  }
  if (!changed) return res.status(409).json({ error: "這筆訂單剛剛已經被取消了。" });

  // 通知：客人、大哥（失敗不影響取消結果）
  const orderCode = gid ? String(gid).slice(0, 8) : code;
  let mailed = false;
  try {
    if (emailConfigured()) {
      const list = [];
      if (alive[0].customer_email) list.push(customerCancelPayload(alive[0].customer_email, alive[0].customer_name, orderCode, items, totals));
      if (settings.owner_email) list.push(ownerCancelPayload(settings.owner_email, alive[0].customer_name, alive[0].customer_phone, orderCode, items, totals, settings.site_url || SITE_DEFAULT));
      if (list.length) mailed = (await postBatch(list)).ok;
    }
  } catch (e) {
    console.error("cancel-booking mail error:", e);
  }
  return res.status(200).json({ ok: true, cancelled: true, items: view, totals, mailed });
}
