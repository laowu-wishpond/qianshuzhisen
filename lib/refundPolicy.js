// 取消訂位／退款規則（客人自己申請取消時，系統照這裡自動計算）。
// 數字存在資料庫 automation_settings，大哥想改時改這幾個值就好（不用改程式）：
//   refund_tiers           退款階梯，格式「天數:退款%」，由大到小。預設 14:100,7:60,3:40,0:0
//                          意思：入住前 ≥14 天退 100%、≥7 天退 60%、≥3 天退 40%、其餘（2 天內）退 0%
//   refund_processing_fee  有退款時，每筆訂單扣的退款手續費（元），預設 30
//   refund_policy_since    這個時間「之後下單」的訂單才適用（更早的訂單請電話聯絡，由營主人工處理）
// 計算基準：第一晚的入園時間（一般營位 14:00；有夜衝＝前一晚 18:00）。
import { stayInfo } from "./stay.js";

export const DEFAULT_TIERS = "14:100,7:60,3:40,0:0";
export const DEFAULT_PROCESSING_FEE = 30;
export const CHECK_IN_HOUR = 14;
export const EARLY_IN_HOUR = 18;

export function parseTiers(str) {
  const out = String(str || DEFAULT_TIERS).split(",").map((x) => {
    const [d, p] = x.split(":").map((n) => Number(String(n).trim()));
    return { days: d, percent: p };
  }).filter((t) => Number.isFinite(t.days) && Number.isFinite(t.percent) && t.percent >= 0 && t.percent <= 100);
  out.sort((a, b) => b.days - a.days);
  return out.length ? out : parseTiers(DEFAULT_TIERS);
}

export function readPolicy(settings = {}) {
  const fee = Number(settings.refund_processing_fee);
  return {
    tiers: parseTiers(settings.refund_tiers),
    processingFee: Number.isFinite(fee) && fee >= 0 ? fee : DEFAULT_PROCESSING_FEE,
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
  const daysLeft = hoursLeft / 24;
  const tier = hoursLeft < 0 ? { percent: 0, days: 0 } : policy.tiers.find((t) => daysLeft >= t.days) || { percent: 0, days: 0 };
  const gross = Math.round((total * tier.percent) / 100);
  const processingFee = gross > 0 ? Math.min(policy.processingFee, gross) : 0;
  const refund = gross - processingFee;
  return { total, percent: tier.percent, gross, processingFee, refund, hoursLeft, daysLeft };
}
