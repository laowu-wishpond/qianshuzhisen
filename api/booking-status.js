// GET /api/booking-status → { open, opensAt }
// 預約頁用：伺服器判斷現在能不能預約（依 lib/siteStatus.js 的開放時間），到點自動變成 open。
import { BOOKING_OPENS_AT, isBookingOpen } from "../lib/siteStatus.js";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    open: isBookingOpen(new Date(), req.headers.cookie || ""),
    opensAt: BOOKING_OPENS_AT,
  });
}
