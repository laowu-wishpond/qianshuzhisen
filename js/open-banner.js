/* 「線上預約開放時間」提醒條：預約還沒開放時，每一頁最上方顯示幾月幾號幾點開放；時間一到自動消失。
   開放時間由伺服器決定（lib/siteStatus.js 的 BOOKING_OPENS_AT，經 /api/booking-status 取得），這裡不用改。 */
(function () {
  var BAR_ID = "openBanner";

  function injectStyle() {
    if (document.getElementById("openBannerStyle")) return;
    var st = document.createElement("style");
    st.id = "openBannerStyle";
    st.textContent =
      "#openBanner{background:#e8c26a;color:#1d2a1f;text-align:center;padding:10px 16px;font-size:15px;line-height:1.5;font-weight:600;letter-spacing:.02em;position:relative;z-index:60;}" +
      "#openBanner b{font-weight:800;}" +
      "#openBanner a{color:#1d2a1f;text-decoration:underline;margin-left:8px;}" +
      "@media (max-width:640px){#openBanner{font-size:14px;padding:9px 12px;}}";
    document.head.appendChild(st);
  }

  function label(iso, en) {
    var opt = { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false };
    return new Date(iso).toLocaleString(en ? "en-US" : "zh-TW", opt);
  }

  function render(data) {
    var bar = document.getElementById(BAR_ID);
    if (data.open) {
      if (bar) bar.remove();
      return;
    }
    injectStyle();
    var isEn = document.documentElement.lang === "en";
    if (!bar) {
      bar = document.createElement("div");
      bar.id = BAR_ID;
      document.body.insertBefore(bar, document.body.firstChild);
    }
    var onBooking = /booking\.html/.test(location.pathname);
    bar.innerHTML =
      '<span class="lang-zh"' + (isEn ? " hidden" : "") + ">線上預約將於 <b>" + label(data.opensAt, false) + "</b> 開放，現在可以先瀏覽營位與價格" +
      (onBooking ? "" : '<a href="booking.html">查看營位</a>') + "</span>" +
      '<span class="lang-en"' + (isEn ? "" : " hidden") + ">Online booking opens <b>" + label(data.opensAt, true) + "</b> (Taiwan time). Browse the campsites and rates in the meantime." +
      (onBooking ? "" : '<a href="booking.html">View sites</a>') + "</span>";
  }

  function refresh() {
    fetch("/api/booking-status", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function () {});
  }

  refresh();
  setInterval(refresh, 30000);
})();
