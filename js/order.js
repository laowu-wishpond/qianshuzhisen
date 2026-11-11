// 查詢訂單頁：用訂單編號＋電話查狀態；還沒回報末五碼的，可以在這裡補填。
(function () {
  var form = document.getElementById("orderForm");
  if (!form) return;
  var codeEl = document.getElementById("ocode");
  var phoneEl = document.getElementById("ophone");
  var btn = document.getElementById("obtn");
  var errEl = document.getElementById("oerr");
  var resEl = document.getElementById("oresult");

  function en() { return typeof isEnglish === "function" && isEnglish(); }
  function t(zh, e) { return en() ? e : zh; }
  function clock(iso) {
    return new Date(iso).toLocaleString(en() ? "en-US" : "zh-TW", {
      timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
    });
  }
  function el(tag, css, text) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;
    return n;
  }

  // 從網址帶入（例如 order.html?c=3f9a1c27）
  try {
    var qs = new URLSearchParams(location.search);
    if (qs.get("c")) codeEl.value = qs.get("c");
    var saved = localStorage.getItem("tsf_last_order");
    if (!codeEl.value && saved) codeEl.value = saved;
  } catch (e) { /* ignore */ }

  function render(d) {
    resEl.innerHTML = "";
    var headline, color = "#f2c766", detail = "";
    if (d.state === "confirmed") {
      headline = t("✅ 預約成功", "✅ Booking confirmed");
      color = "#8fd68f";
      detail = t("我們已確認收到您的款項，營位已為您保留。期待在森林見到您！", "We've confirmed your payment and your site is reserved. See you in the forest!");
    } else if (d.state === "reported") {
      headline = t("🕓 已收到您的匯款回報，查帳中", "🕓 Payment report received — we're checking");
      color = "#8fd68f";
      detail = t("您回報的末五碼是 " + d.last5 + "，營位已為您保留。我們查帳以後，會主動寄 email 通知您預約成功。", "You reported last 5 digits " + d.last5 + ". Your site is held. We'll email you once the payment is confirmed.");
    } else if (d.state === "awaiting_payment") {
      headline = t("⏳ 營位保留中，等待匯款", "⏳ Site held — waiting for your transfer");
      detail = t("請在 " + clock(d.holdExpiresAt) + " 前完成匯款，並在下方回報匯款帳號末五碼；逾時系統會自動釋出營位。", "Please transfer before " + clock(d.holdExpiresAt) + " and send the last 5 digits below. Otherwise the site is released automatically.");
    } else if (d.state === "expired") {
      headline = t("⌛ 保留時間已過，營位已釋出", "⌛ Hold expired — site released");
      color = "#f29a9a";
      detail = t("如果您已經匯款，請直接電話聯絡我們（0939-235-168）；也可以重新預約。", "If you've already paid, please call us (0939-235-168), or book again.");
    } else {
      headline = t("這筆訂單已取消", "This booking was cancelled");
      color = "#f29a9a";
      detail = t("如有疑問，請電話聯絡我們（0939-235-168）。", "Questions? Call us at 0939-235-168.");
    }
    resEl.appendChild(el("h3", "color:" + color + ";margin:0 0 8px;", headline));
    resEl.appendChild(el("p", "margin:0 0 12px;", detail));

    var info = el("p", "margin:0;line-height:1.9;");
    var dates = d.checkIn ? (d.checkOut ? d.checkIn + " ～ " + d.checkOut + (d.nights ? "（" + (d.earlyArrival && d.days ? t(d.days + "天" + d.nights + "夜，含夜衝", d.days + " days / " + d.nights + " nights, incl. early arrival") : d.nights + t("晚", " nights")) + "）" : "") : d.checkIn) : "";
    info.appendChild(document.createTextNode(t("訂單編號：", "Order no.: ") + d.code));
    info.appendChild(document.createElement("br"));
    info.appendChild(document.createTextNode(t("姓名：", "Name: ") + d.name));
    info.appendChild(document.createElement("br"));
    if (d.site) { info.appendChild(document.createTextNode(t("營位：", "Site: ") + d.site + (d.earlyArrival ? t("（含夜衝）", " (early arrival)") : ""))); info.appendChild(document.createElement("br")); }
    if (dates) { info.appendChild(document.createTextNode(t("日期：", "Dates: ") + dates)); info.appendChild(document.createElement("br")); }
    info.appendChild(document.createTextNode(t("金額：NT$ ", "Amount: NT$ ") + d.total.toLocaleString()));
    resEl.appendChild(info);

    if (d.state === "awaiting_payment") {
      var row = el("div", "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px;");
      var inp = document.createElement("input");
      inp.type = "text"; inp.inputMode = "numeric"; inp.maxLength = 5; inp.pattern = "[0-9]*";
      inp.placeholder = t("匯款帳號末五碼", "Last 5 digits of your account");
      inp.style.cssText = "max-width:200px;";
      var b2 = document.createElement("button");
      b2.type = "button"; b2.className = "btn btn-primary";
      b2.textContent = t("我已匯款，回報末五碼", "I've paid — send last 5 digits");
      var msg = el("p", "margin:10px 0 0;");
      row.appendChild(inp); row.appendChild(b2);
      resEl.appendChild(row); resEl.appendChild(msg);
      if (d.canExtend) {
        var xrow = el("div", "margin-top:14px;");
        var xb = document.createElement("button");
        xb.type = "button"; xb.className = "btn";
        xb.textContent = t("還需要一點時間？再給我 " + d.extendHours + " 小時", "Need more time? Give me " + d.extendHours + " more hours");
        var xmsg = el("p", "margin:10px 0 0;");
        xb.addEventListener("click", function () {
          xb.disabled = true;
          fetch("/api/extend-hold", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId: d.bookingId }) })
            .then(function (r) { return r.json().then(function (x) { if (!r.ok) throw new Error(x.error || "failed"); return x; }); })
            .then(function () { doLookup(); })
            .catch(function (e) { xb.disabled = false; xmsg.style.color = "#f29a9a"; xmsg.textContent = e.message; });
        });
        xrow.appendChild(xb); xrow.appendChild(xmsg);
        resEl.appendChild(xrow);
      }
      b2.addEventListener("click", function () {
        var v = inp.value.trim();
        if (!/^\d{5}$/.test(v)) { msg.style.color = "#f29a9a"; msg.textContent = t("請填 5 位數字", "Please enter exactly 5 digits."); return; }
        b2.disabled = true;
        fetch("/api/report-transfer", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId: d.bookingId, last5: v })
        })
          .then(function (r) { return r.json().then(function (x) { if (!r.ok) throw new Error(x.error || "failed"); return x; }); })
          .then(function () { doLookup(); })
          .catch(function (e) { b2.disabled = false; msg.style.color = "#f29a9a"; msg.textContent = e.message; });
      });
    }
    resEl.hidden = false;
    try { resEl.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { /* ignore */ }
  }

  function doLookup() {
    errEl.textContent = "";
    var code = codeEl.value.trim();
    var phone = phoneEl.value.trim();
    if (!code || !phone) { errEl.textContent = t("請填訂單編號和電話", "Please enter your order number and phone."); return Promise.resolve(); }
    btn.disabled = true;
    return fetch("/api/lookup-booking", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code, phone: phone })
    })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "failed"); return d; }); })
      .then(function (d) {
        try { localStorage.setItem("tsf_last_order", d.code); } catch (e) { /* ignore */ }
        render(d);
      })
      .catch(function (e) { resEl.hidden = true; errEl.textContent = e.message; })
      .finally(function () { btn.disabled = false; });
  }

  form.addEventListener("submit", function (ev) { ev.preventDefault(); doLookup(); });
})();
