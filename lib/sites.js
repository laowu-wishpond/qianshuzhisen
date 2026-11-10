// 水松千樹之森（第一期「松語森林」）35 個營位的資料與價格。
// 資料來源：林大哥提供的「營位價目表（含夜衝）」＋「營位尺寸一覽表」。
// 價格是「每個營位／每晚」，整塊營位出租：不管搭幾帳、幾個人，同一個營位同一晚價格都一樣。
//   weekday = 平日價（週日～週四，國定假日除外）
//   holiday = 假日價（週五、週六、國定假日）
//   early   = 價目表公告的夜衝價（假日夜衝價，也是夜衝的上限）。實際夜衝價由 lib/pricing.js 的 earlyPrice() 算：
//             夜衝那一晚當天價格的 5 折，但不超過這個 early 值，也不超過 2,000 元（林大哥決定：夜衝最高 2,000）
// maxTents = 建議可搭帳數上限；small = true 代表該營位只適合小帳（表上標「小帳」）。
// 這支檔案前端（js/booking.js）和後端（api/）共用，改價格只要改這裡。

export const ZONES = {
  A: { zh: "松風區", en: "Songfeng Zone" },
  B: { zh: "松影區", en: "Songying Zone" },
  C: { zh: "松韻區", en: "Songyun Zone" },
  D: { zh: "松嵐區", en: "Songlan Zone" },
};

export const SITES = [
  { id: "A1", zone: "A", length: 20, width: 8, maxTents: 2, small: false, weekday: 1800, holiday: 2400, early: 1200 },
  { id: "A2", zone: "A", length: 15, width: 7, maxTents: 1, small: false, weekday: 1400, holiday: 1800, early: 900 },
  { id: "A3", zone: "A", length: 15, width: 8, maxTents: 1, small: false, weekday: 1500, holiday: 2000, early: 1000 },
  { id: "A4", zone: "A", length: 11, width: 8, maxTents: 1, small: false, weekday: 1200, holiday: 1600, early: 800 },
  { id: "A5", zone: "A", length: 13, width: 8, maxTents: 1, small: false, weekday: 1400, holiday: 1800, early: 900 },
  { id: "A6", zone: "A", length: 12, width: 8, maxTents: 1, small: false, weekday: 1200, holiday: 1600, early: 800 },
  { id: "A7", zone: "A", length: 17, width: 8, maxTents: 2, small: false, weekday: 1600, holiday: 2200, early: 1100 },
  { id: "A8", zone: "A", length: 12, width: 8, maxTents: 1, small: false, weekday: 1200, holiday: 1600, early: 800 },
  { id: "A9", zone: "A", length: 20, width: 6, maxTents: 1, small: false, weekday: 1500, holiday: 2000, early: 1000 },
  { id: "A10", zone: "A", length: 12, width: 11, maxTents: 2, small: false, weekday: 1600, holiday: 2200, early: 1100 },
  { id: "B1", zone: "B", length: 10, width: 3, maxTents: 1, small: true, weekday: 800, holiday: 1000, early: 500 },
  { id: "B2", zone: "B", length: 24, width: 8, maxTents: 2, small: false, weekday: 1200, holiday: 1700, early: 900 },
  { id: "B3", zone: "B", length: 36, width: 8, maxTents: 3, small: false, weekday: 2800, holiday: 4000, early: 1800 },
  { id: "B4", zone: "B", length: 35, width: 6, maxTents: 2, small: false, weekday: 3600, holiday: 5200, early: 2000 },
  { id: "B5", zone: "B", length: 65, width: 8, maxTents: 4, small: false, weekday: 4000, holiday: 6000, early: 2000 },
  { id: "C1", zone: "C", length: 28, width: 16, maxTents: 4, small: false, weekday: 3600, holiday: 5200, early: 2000 },
  { id: "C2", zone: "C", length: 25, width: 10, maxTents: 2, small: false, weekday: 2400, holiday: 3400, early: 1700 },
  { id: "C3", zone: "C", length: 25, width: 10, maxTents: 2, small: false, weekday: 2400, holiday: 3400, early: 1700 },
  { id: "C4", zone: "C", length: 11, width: 8, maxTents: 1, small: false, weekday: 1200, holiday: 1600, early: 800 },
  { id: "C5", zone: "C", length: 13, width: 8, maxTents: 1, small: false, weekday: 1400, holiday: 1800, early: 900 },
  { id: "C6", zone: "C", length: 10, width: 11, maxTents: 1, small: false, weekday: 1400, holiday: 1800, early: 900 },
  { id: "C7", zone: "C", length: 28, width: 7, maxTents: 2, small: false, weekday: 2000, holiday: 2800, early: 1400 },
  { id: "C8", zone: "C", length: 31, width: 5, maxTents: 2, small: true, weekday: 1800, holiday: 2400, early: 1200 },
  { id: "C9", zone: "C", length: 40, width: 6, maxTents: 2, small: false, weekday: 2400, holiday: 3400, early: 1700 },
  { id: "D1", zone: "D", length: 11, width: 8, maxTents: 1, small: false, weekday: 1200, holiday: 1600, early: 800 },
  { id: "D2", zone: "D", length: 16, width: 9, maxTents: 2, small: false, weekday: 1600, holiday: 2200, early: 1100 },
  { id: "D3", zone: "D", length: 40, width: 7, maxTents: 3, small: false, weekday: 2600, holiday: 3600, early: 1600 },
  { id: "D4", zone: "D", length: 13, width: 10, maxTents: 1, small: false, weekday: 1500, holiday: 2000, early: 1000 },
  { id: "D5", zone: "D", length: 24, width: 6, maxTents: 2, small: false, weekday: 1600, holiday: 2200, early: 1100 },
  { id: "D6", zone: "D", length: 18, width: 4, maxTents: 1, small: true, weekday: 1000, holiday: 1400, early: 700 },
  { id: "D7", zone: "D", length: 13, width: 9, maxTents: 1, small: false, weekday: 1400, holiday: 1800, early: 900 },
  { id: "D8", zone: "D", length: 18, width: 9, maxTents: 2, small: false, weekday: 1800, holiday: 2400, early: 1200 },
  { id: "D9", zone: "D", length: 12, width: 5, maxTents: 1, small: true, weekday: 1000, holiday: 1400, early: 700 },
  { id: "D10", zone: "D", length: 20, width: 4, maxTents: 1, small: true, weekday: 1200, holiday: 1600, early: 800 },
  { id: "D11", zone: "D", length: 5, width: 5, maxTents: 1, small: true, weekday: 700, holiday: 900, early: 450 },
];

export function getSite(id) {
  return SITES.find((s) => s.id === id) || null;
}
