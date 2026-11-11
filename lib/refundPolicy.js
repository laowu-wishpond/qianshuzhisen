// 取消訂位／退款規則（客人自己申請取消時，系統照這裡自動計算）。
// 數字存在資料庫 automation_settings，大哥想調整時改這三個值就好（不用改程式）：
//   refund_fee_percent       退款時扣的服務費 %（預設 10）
//   refund_no_refund_hours   入住前幾小時內不能退款（預設 24）
//   refund_policy_since      這個時間「之後下單」的訂單才適用（更早的訂單請電話聯絡，由營主人工處理）
// 計算基準：第一晚的入園時間（一般營位 14:00；有夜衝＝前一晚 18:00）。
import { stayInfo } from "./stay.js";

export const REFUND_DEFAULTS = { feePercent: 10, noRefundHours: 24, since: null };
export const CHECK_IN_HOUR = 14;
export const EARLY_IN_HOUR = 18;

export function readPolicy(settings = {}) {
  const fee = Number(settings.refund_fee_percent);
  const hrs = Number(settings.refund_no_refund_hours);
  return {
    feePercent: Number.isFinite(fee) && fee >= 0 && fee <= 100 ? fee : REFUND_DEFAULTS.feePercent,
    noRefundHours: Number.isFinite(hrs) && hrs >= 0 ? hrs : REFUND_DEFAULTS.noRefundHours,
    since: settings.refund_policy_since || null,
  };
}

// 第一晚入園時間（台灣時間 UTC+8）→ 毫秒
export function stayStartMs(b) {
  const st = stayInfo(b);
  const day = st.start || b.check_in || b.booking_date;
  if (!day) return NaN;
  const hh = String(st.early ? EARLY_IN_HOUR : CHECK_IN_HOUR).padStart(2, "0");
  return Date.parse(`${day}T${hh}:00:00+08:00`);
}

export function policyApplies(b, policy) {
  if (!policy.since) return true;
  return new Date(b.created_at).getTime() >= new Date(policy.since).getTime();
}

// 已付款（已對帳）訂單的退款試算。
export function calcRefund(b, policy, now = Date.now()) {
  const total = Number(b.total_amount || 0);
  const startMs = stayStartMs(b);
  const hoursLeft = Number.isFinite(startMs) ? (startMs - now) / 3600000 : -1;
  if (hoursLeft < policy.noRefundHours) {
    return { tier: "none", total, fee: total, refund: 0, hoursLeft };
  }
  const fee = Math.round((total * policy.feePercent) / 100);
  return { tier: "fee", total, fee, refund: total - fee, hoursLeft };
}
