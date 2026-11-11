/* 全站最上方「入園／退房時間」提示條：每一頁都看得到，不能關掉。
   時間改這裡就好（同時也要改 lib/siteStatus.js 的 CHECK_IN_TIME / CHECK_OUT_TIME，email 才會跟著變）。 */
(function () {
  var CHECK_IN = "14:00";
  var CHECK_OUT = "12:00";
  var isEn = document.documentElement.lang === "en";

  var st = document.createElement("style");
  st.textContent =
    "#timeBar{background:#2f5a3a;color:#fff;text-align:center;padding:9px 14px;font-size:16px;line-height:1.6;font-weight:600;letter-spacing:.02em;position:relative;z-index:62;}" +
    "#timeBar b{font-weight:800;color:#ffe08a;font-size:1.08em;}" +
    "#timeBar .tb-sep{opacity:.5;margin:0 .7em;}" +
    "#timeBar .tb-sub{font-size:13.5px;font-weight:400;opacity:.9;}" +
    "@media (max-width:640px){#timeBar{font-size:14.5px;padding:8px 10px;}#timeBar .tb-sep{margin:0 .4em;}}";
  document.head.appendChild(st);

  var bar = document.createElement("div");
  bar.id = "timeBar";
  bar.setAttribute("role", "note");
  bar.innerHTML =
    '<span class="lang-zh"' + (isEn ? " hidden" : "") + '>🕑 入園時間 <b>' + CHECK_IN + '</b><span class="tb-sep">｜</span>退房時間 <b>隔天 ' + CHECK_OUT + '</b><span class="tb-sep">｜</span><span class="tb-sub">夜衝：前一晚 18:00～22:00 進場</span></span>' +
    '<span class="lang-en"' + (isEn ? "" : " hidden") + '>🕑 Check-in <b>' + CHECK_IN + '</b><span class="tb-sep">|</span>Check-out <b>12:00 next day</b><span class="tb-sep">|</span><span class="tb-sub">Early arrival: 18:00–22:00 the night before</span></span>';
  document.body.insertBefore(bar, document.body.firstChild);
})();
