// 網站開放開關。
// BOOKING_OPEN = false：關閉線上訂位（後端會直接拒絕所有新訂單，就算有人繞過頁面直接呼叫 API 也一樣）。
// 目前已正式開放。若要再次暫停，改成 false 並在 vercel.json 加回導向設定，再 commit + push。
export const BOOKING_OPEN = true;
