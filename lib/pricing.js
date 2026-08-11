// 帳篷計價公式，跟 js/booking.js 前端顯示的公式必須完全一致：
// 一帳 2 人 NT$1,200，超過 2 人每加 1 人 +NT$300
export function calcTentPrice(tentsCount, peoplePerTent) {
  const tents = Math.max(1, parseInt(tentsCount, 10) || 1);
  const people = Math.max(1, parseInt(peoplePerTent, 10) || 1);
  const perTent = 1200 + Math.max(0, people - 2) * 300;
  const total = perTent * tents;
  return { tents, people, perTent, total };
}
