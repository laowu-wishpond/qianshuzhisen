// 依營位計價（前端 js/booking.js 與後端 api/create-booking.js 共用同一份邏輯，金額不會對不上）。
//
// 規則（林大哥確認）：
// - 價格是「每個營位／每晚」，整塊營位出租，不管幾帳、幾個人，同一營位同一晚價格都一樣。
// - 平日 = 週日～週四；假日 = 週五、週六、國定假日（國定假日即使落在週日～週四也算假日）。
// - 連住沒有折扣，每一晚各自依當天是平日或假日計價，再加總。
// - 夜衝 = 前一晚 18:00～22:00 進場，必須同時預訂隔日的正式營位。夜衝價 = 夜衝那一晚當天價格的 5 折：
//   那一晚是平日就收該營位平日價的一半，是假日（週五、週六、國定假日）就收假日價的一半（林大哥決定）。
//   夜衝那一晚營位也算被佔用，不能再賣給別人。
//   正式入住的每一晚照原價，夜衝只是多訂前一晚。
//   過年期間（2027/2/4～2/10）不提供夜衝，且每晚價格加三成（× 1.3）。
import { SITES, ZONES, getSite } from "./sites.js";
import { HOLIDAYS, HOLIDAYS_COVERED_THROUGH } from "./holidays.js";

export { SITES, ZONES, getSite, HOLIDAYS, HOLIDAYS_COVERED_THROUGH };

// 單筆訂單最多連住幾晚（避免有人亂填一整年）
export const MAX_NIGHTS = 14;

// 這個日期以前（不含當天）暫不開放訂位（林大哥決定：11/15 以前都不開放）。第一晚（含夜衝那一晚）早於這天就不能訂。
// 要提前或延後開放，改這一行（日期格式 YYYY-MM-DD）。已經訂好的訂單不受影響。
export const EARLIEST_STAY_DATE = "2026-11-15";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISODate(s) {
  if (typeof s !== "string" || !ISO_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// 一律用 UTC 運算日期，避免瀏覽器／伺服器時區不同造成差一天
export function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayOfWeek(iso) {
  return new Date(iso + "T00:00:00Z").getUTCDay(); // 0=週日 … 6=週六
}

export function holidayName(iso) {
  return HOLIDAYS[iso] || null;
}

// 這一晚算平日還是假日：週五、週六、國定假日 = holiday，其餘 = weekday
export function dayTypeOf(iso) {
  const dow = dayOfWeek(iso);
  if (dow === 5 || dow === 6) return "holiday";
  if (HOLIDAYS[iso]) return "holiday";
  return "weekday";
}

// 過年期間不提供夜衝（林大哥決定）。範圍 = 除夕前一日～春節補假結束，要和 lib/holidays.js 的春節日期一致。
// 明年（2028）的春節日期要等公告後，連同 holidays.js 一起更新。
export const NO_EARLY_PERIODS = [["2027-02-04", "2027-02-10"]];

// 過年期間加價三成（林大哥決定）：期間內每一晚，不管平日或假日，都用該營位原價 × 1.3（四捨五入到整數）。
// 目前價目的 1.3 倍都剛好是 10 的倍數。期間沿用 NO_EARLY_PERIODS（同一段春節日期）。
export const NEW_YEAR_RATE = 1.3;

export function isNewYearNight(iso) {
  return inNoEarlyPeriod(iso);
}

function inNoEarlyPeriod(iso) {
  return NO_EARLY_PERIODS.some(([from, to]) => iso >= from && iso <= to);
}

// 這一晚能不能當夜衝：只有過年期間不行（夜衝那一晚或隔天的正式入住日落在過年期間都算）。
// 平日、週五、週六、國定假日都可以夜衝。
// 回傳 null = 可以；"newyear" = 不可以的原因
export function earlyBlockReason(iso) {
  if (inNoEarlyPeriod(iso) || inNoEarlyPeriod(addDays(iso, 1))) return "newyear";
  return null;
}

export const EARLY_RATE = 0.5;
// 夜衝最高 2,000 元（林大哥決定；價目表公告「約假日價格的 50%，最高 2,000 元」）
export const EARLY_CAP = 2000;

// 夜衝價 = 夜衝那一晚當天價格 × 5 折（平日用平日價、假日用假日價），
// 但不超過該營位價目表公告的夜衝價（site.early），也不超過 EARLY_CAP（2,000）
export function earlyPrice(site, earlyDate) {
  const base = dayTypeOf(earlyDate) === "holiday" ? site.holiday : site.weekday;
  // 假日夜：直接用價目表公告的夜衝價（和公告圖一模一樣）；平日夜：平日價的 5 折（同樣不超過公告價與上限）
  if (dayTypeOf(earlyDate) === "holiday") return Math.min(site.early, EARLY_CAP);
  return Math.min(Math.round(base * EARLY_RATE), site.early, EARLY_CAP);
}

export function isEarlyAllowed(iso) {
  return earlyBlockReason(iso) === null;
}

// 入住日（含）到退房日（不含）之間每一晚，例如 12/5 入住、12/7 退房 = ["12-05","12-06"]
export function nightsBetween(checkIn, checkOut) {
  const list = [];
  let cur = checkIn;
  while (cur < checkOut && list.length <= MAX_NIGHTS + 1) {
    list.push(cur);
    cur = addDays(cur, 1);
  }
  return list;
}

// 算一筆訂單的價格。回傳 { ok, error?, nights:[{date,type,price}], early:{date,price}|null, subtotal, total }
// today 可以傳入（YYYY-MM-DD，台灣時間）讓呼叫端決定「不能訂過去的日期」；不傳就不檢查。
export function quoteStay({ siteId, checkIn, checkOut, earlyArrival, today }) {
  const site = getSite(siteId);
  if (!site) return { ok: false, error: "找不到這個營位" };
  if (!isValidISODate(checkIn) || !isValidISODate(checkOut)) {
    return { ok: false, error: "日期格式錯誤" };
  }
  if (checkOut <= checkIn) return { ok: false, error: "退房日必須晚於入住日" };
  if (today && checkIn < today) return { ok: false, error: "不能預訂已經過去的日期" };
  if ((earlyArrival ? addDays(checkIn, -1) : checkIn) < EARLIEST_STAY_DATE) {
    return { ok: false, error: "11/15 以前的日期暫不開放預約，請選擇 11/15（含）以後的日期" };
  }

  const dates = nightsBetween(checkIn, checkOut);
  if (dates.length > MAX_NIGHTS) {
    return { ok: false, error: "單筆訂單最多連住 " + MAX_NIGHTS + " 晚，更長的住宿請直接聯絡我們" };
  }

  const nights = dates.map((date) => {
    const type = dayTypeOf(date); // 只有 weekday / holiday（資料庫 day_type 欄位只收這兩種＋early）
    const base = type === "holiday" ? site.holiday : site.weekday;
    const newYear = isNewYearNight(date);
    return { date, type, newYear, price: newYear ? Math.round(base * NEW_YEAR_RATE) : base };
  });
  const subtotal = nights.reduce((sum, n) => sum + n.price, 0);

  let early = null;
  if (earlyArrival) {
    const earlyDate = addDays(checkIn, -1);
    if (earlyBlockReason(earlyDate) === "newyear") {
      return { ok: false, error: "過年期間不提供夜衝，請取消夜衝或改選其他日期" };
    }
    early = { date: earlyDate, price: earlyPrice(site, earlyDate) };
  }
  const total = subtotal + (early ? early.price : 0);

  return { ok: true, site, nights, early, subtotal, total };
}
