// 網站開放開關。
// BOOKING_OPEN = false：關閉線上訂位（後端會直接拒絕所有新訂單，就算有人繞過頁面直接呼叫 API 也一樣）。
// 正式開放時改成 true，再 commit + push 即可。
// 另外：整站轉到「暫停開放」頁面的設定在專案根目錄 vercel.json，開放時把那個檔案刪掉（或清空 redirects）。
export const BOOKING_OPEN = false;
