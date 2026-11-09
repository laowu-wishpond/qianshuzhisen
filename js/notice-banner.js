/* 全站「重要公告」大通知。要撤掉時：把下面 ENABLED 改成 false 即可（或移除各頁的 notice-banner.js）。 */
(function () {
  var ENABLED = true;
  var KEY = "tsf_notice_hold24_closed";
  if (!ENABLED) return;
  try { if (sessionStorage.getItem(KEY)) return; } catch (e) { /* 無痕模式等情況，照常顯示 */ }

  var isEn = document.documentElement.lang === "en";

  var st = document.createElement("style");
  st.textContent =
    "#siteNotice{background:#fff4d6;color:#2b2416;border-bottom:3px solid #e8c26a;position:relative;z-index:61;}" +
    "#siteNotice .sn-in{max-width:980px;margin:0 auto;padding:14px 44px 14px 18px;line-height:1.75;font-size:15.5px;}" +
    "#siteNotice .sn-title{font-weight:800;font-size:17px;margin:0 0 4px;color:#7a4a00;}" +
    "#siteNotice p{margin:0 0 4px;}" +
    "#siteNotice ol{margin:4px 0 6px 1.3em;padding:0;}" +
    "#siteNotice li{margin:2px 0;}" +
    "#siteNotice b{font-weight:800;}" +
    "#siteNotice a{color:#7a4a00;text-decoration:underline;}" +
    "#siteNotice .sn-x{position:absolute;right:10px;top:8px;border:0;background:transparent;font-size:26px;line-height:1;cursor:pointer;color:#7a4a00;padding:2px 8px;}" +
    "@media (max-width:640px){#siteNotice .sn-in{font-size:14.5px;padding:12px 40px 12px 14px;}}";
  document.head.appendChild(st);

  var bar = document.createElement("div");
  bar.id = "siteNotice";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", isEn ? "Important notice" : "重要公告");
  bar.innerHTML =
    '<div class="sn-in">' +
    '<div class="lang-zh"' + (isEn ? " hidden" : "") + '>' +
      '<div class="sn-title">📢 重要公告</div>' +
      '<p>感謝大家熱情預約！開放預約後訂單湧入量遠超預期，我們已將<b>匯款保留時間延長為 24 小時</b>，請在時限內完成匯款並回報末五碼。</p>' +
      '<ol>' +
        '<li>送出預約後，您會先收到一封<b>「已收到您的預約」確認信</b>。</li>' +
        '<li>匯款完成、我們核對帳款後，會再寄一封<b>「預約成功」通知信</b>，收到這封信才代表預約完成、營位確定保留。</li>' +
      '</ol>' +
      '<p>可隨時到<a href="order.html">「查詢訂單」</a>查看狀態；有任何問題，歡迎來電 0939-235-168。</p>' +
    '</div>' +
    '<div class="lang-en"' + (isEn ? "" : " hidden") + '>' +
      '<div class="sn-title">📢 Important notice</div>' +
      '<p>Thank you for the overwhelming response! Because so many bookings came in at once, we have <b>extended the payment hold to 24 hours</b>. Please transfer within that time and report the last 5 digits of your account.</p>' +
      '<ol>' +
        '<li>After you submit a booking, you will first receive a <b>“We’ve received your booking”</b> email.</li>' +
        '<li>Once your payment is received and checked, we will send a <b>“Booking confirmed”</b> email. That email is what confirms your booking and secures your site.</li>' +
      '</ol>' +
      '<p>You can check your status anytime on the <a href="order.html">Check booking</a> page. Questions? Call 0939-235-168.</p>' +
    '</div>' +
    '<button type="button" class="sn-x" aria-label="close">×</button>' +
    '</div>';
  bar.querySelector(".sn-x").addEventListener("click", function () {
    bar.remove();
    try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* ignore */ }
  });
  document.body.insertBefore(bar, document.body.firstChild);
})();
