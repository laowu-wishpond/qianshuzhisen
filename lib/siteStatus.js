// 網站開放設定（前後端的「能不能預約」都以這裡為準，由伺服器判斷時間，不信任客人手機的時鐘）。
//
// BOOKING_OPENS_AT：開放線上預約的時間（台灣時間 +08:00）。這個時間之前，網站可以瀏覽，但送出預約會被後端拒絕，
//                   預約頁的按鈕也會顯示「幾點開放」。時間到了不需要任何人操作，自動開放。
// 要提前或延後：改下面這一行的時間，commit + push 即可。
// 要永遠開放：把時間改成過去的日期（例如 "2026-01-01T00:00:00+08:00"）。
// 要緊急暫停：把時間改成很久以後（例如 "2099-01-01T00:00:00+08:00"）。
export const BOOKING_OPENS_AT = "2026-11-09T11:55:00+08:00";

// 驗收用的私密預覽碼（和 api/preview.js、vercel.json 同一組）：
// 有預覽 cookie 的人（大哥驗收用）在開放時間前也能試訂位，試完到後台取消即可。
export const PREVIEW_KEY = "d311b4ebf170e9be";

export function hasPreviewCookie(cookieHeader) {
  return typeof cookieHeader === "string" && cookieHeader.split(/;\s*/).includes("preview=" + PREVIEW_KEY);
}

export function isBookingOpen(now = new Date(), cookieHeader = "") {
  if (hasPreviewCookie(cookieHeader)) return true;
  return now.getTime() >= new Date(BOOKING_OPENS_AT).getTime();
}

// 預約送出後，營位保留多少分鐘等匯款（林大哥決定：先送出先保留，限時匯款，逾時自動釋出）。
// 客人匯款後在網頁填「末五碼」回報，回報後就不會被自動釋出，等營主核對。
export const HOLD_MINUTES = 60;
