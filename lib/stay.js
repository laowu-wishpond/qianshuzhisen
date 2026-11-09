// 夜衝＝前一晚就進場、當晚也住（另外計價）。所以有夜衝的訂單，實際住宿＝入住日前一天起算，晚數 +1。
// 例：入住 1/2、退房 1/3、有夜衝 → 實際 1/1 ～ 1/3，3 天 2 夜。
export function shiftDay(dateStr, delta) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d)) return dateStr;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function stayInfo(b) {
  const early = !!b.early_arrival;
  const base = Number(b.nights_count) || (b.check_out ? 1 : 0);
  const start = b.check_in || b.booking_date || "";
  const nights = base ? base + (early ? 1 : 0) : 0;
  return {
    early,
    start: early && start ? shiftDay(start, -1) : start,
    end: b.check_out || "",
    nights,
    days: nights ? nights + 1 : 0,
  };
}
