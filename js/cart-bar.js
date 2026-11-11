/* 每一頁右下角的「購物車」小按鈕：購物車有東西才會出現，點了到結帳頁。 */
(function () {
  if (!window.TSFCart) return;
  if (/\/cart(\.html)?$/.test(location.pathname)) return;
  var en = document.documentElement.lang === "en";

  var st = document.createElement("style");
  st.textContent =
    "#cartBar{position:fixed;right:16px;bottom:16px;z-index:80;background:#2f5a3a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-size:16px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.35);display:none;align-items:center;gap:8px;border:2px solid #ffe08a;}" +
    "#cartBar b{background:#ffe08a;color:#2f5a3a;border-radius:999px;min-width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-size:14px;padding:0 6px;}" +
    "#cartBar:hover{background:#3b6f49;}";
  document.head.appendChild(st);

  var a = document.createElement("a");
  a.id = "cartBar";
  a.href = "cart.html";
  document.body.appendChild(a);

  function refresh() {
    var n = TSFCart.count();
    a.style.display = n > 0 ? "inline-flex" : "none";
    var lang = document.documentElement.lang === "en";
    a.innerHTML = "🛒 " + (lang ? "Cart — checkout" : "購物車　去結帳") + " <b>" + n + "</b>";
  }
  refresh();
  window.addEventListener("tsf-cart-changed", refresh);
  window.addEventListener("storage", refresh);
  try { new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] }); } catch (e) { /* ignore */ }
})();
