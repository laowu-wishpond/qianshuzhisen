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

    function nightLines(list) {
      var box = el("div", "margin:4px 0 8px;font-size:15px;");
      (list || []).forEach(function (n) {
        var tag = n.kind === "early" ? t("夜衝", "Early arrival") : n.dayType === "holiday" ? t("假日", "Holiday") : t("平日", "Weekday");
        var r = el("div", "display:flex;justify-content:space-between;gap:10px;opacity:.92;");
        r.appendChild(el("span", "", n.date + "　" + tag));
        r.appendChild(el("span", "", "NT$ " + Number(n.price || 0).toLocaleString()));
        box.appendChild(r);
      });
      return box;
    }
    var info = el("p", "margin:0;line-height:1.9;");
    info.appendChild(document.createTextNode((d.group ? t("整筆訂單編號：", "Order no. (whole order): ") : t("訂單編號：", "Order no.: ")) + d.code));
    info.appendChild(document.createElement("br"));
    info.appendChild(document.createTextNode(t("姓名：", "Name: ") + d.name));
    info.appendChild(document.createElement("br"));
    if (d.group) {
      info.appendChild(document.createTextNode(t("共 " + d.itemCount + " 個營位，一次匯款合計：NT$ ", d.itemCount + " sites, one payment total: NT$ ") + d.total.toLocaleString()));
      resEl.appendChild(info);
      (d.items || []).forEach(function (it) {
        var card = el("div", "border:1px solid rgba(255,255,255,.25);border-radius:10px;padding:10px 14px;margin:12px 0 0;");
        card.appendChild(el("div", "font-weight:700;", it.site + t(" 營位　", " site  ") + it.checkIn + " ～ " + it.checkOut + (it.earlyArrival ? t("（含夜衝）", " (incl. early arrival)") : "")));
        card.appendChild(nightLines(it.nightsDetail));
        card.appendChild(el("div", "text-align:right;font-weight:700;", t("小計 NT$ ", "Subtotal NT$ ") + Number(it.total || 0).toLocaleString()));
        resEl.appendChild(card);
      });
    } else {
      var dates = d.checkIn ? (d.checkOut ? d.checkIn + " ～ " + d.checkOut + (d.nights ? "（" + (d.earlyArrival && d.days ? t(d.days + "天" + d.nights + "夜，含夜衝", d.days + " days / " + d.nights + " nights, incl. early arrival") : d.nights + t("晚", " nights")) + "）" : "") : d.checkIn) : "";
      if (d.site) { info.appendChild(document.createTextNode(t("營位：", "Site: ") + d.site + (d.earlyArrival ? t("（含夜衝）", " (early arrival)") : ""))); info.appendChild(document.createElement("br")); }
      if (dates) { info.appendChild(document.createTextNode(t("日期：", "Dates: ") + dates)); info.appendChild(document.createElement("br")); }
      info.appendChild(document.createTextNode(t("金額：NT$ ", "Amount: NT$ ") + d.total.toLocaleString()));
      resEl.appendChild(info);
      if (d.nightsDetail && d.nightsDetail.length) resEl.appendChild(nightLines(d.nightsDetail));
    }

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
    if (d.state === "confirmed" || d.state === "awaiting_payment") addCancelBox(d);
    else if (d.state === "reported") {
      // 末五碼打錯了：對帳完成之前，客人可以自己更正
      var frow = el("div", "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px;");
      var fl = el("span", "font-size:14px;", t("末五碼填錯了？在這裡更正：", "Typed the wrong digits? Correct them here:"));
      var finp = document.createElement("input");
      finp.type = "text"; finp.inputMode = "numeric"; finp.maxLength = 5; finp.pattern = "[0-9]*";
      finp.placeholder = t("正確的末五碼", "Correct last 5 digits");
      finp.style.cssText = "max-width:180px;";
      var fb = document.createElement("button");
      fb.type = "button"; fb.className = "btn";
      fb.textContent = t("更正末五碼", "Correct digits");
      var fmsg = el("p", "margin:8px 0 0;");
      frow.appendChild(fl); frow.appendChild(finp); frow.appendChild(fb);
      resEl.appendChild(frow); resEl.appendChild(fmsg);
      fb.addEventListener("click", function () {
        var v = finp.value.trim();
        if (!/^\d{5}$/.test(v)) { fmsg.style.color = "#f29a9a"; fmsg.textContent = t("請填 5 位數字", "Please enter exactly 5 digits."); return; }
        fb.disabled = true;
        fetch("/api/report-transfer", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId: d.bookingId, last5: v, correct: true })
        })
          .then(function (r) { return r.json().then(function (x) { if (!r.ok) throw new Error(x.error || "failed"); return x; }); })
          .then(function () { doLookup(); })
          .catch(function (e) { fb.disabled = false; fmsg.style.color = "#f29a9a"; fmsg.textContent = e.message; });
      });
      resEl.appendChild(el("p", "margin-top:14px;font-size:14px;opacity:.85;", t("如需取消，請直接電話聯絡我們（0939-235-168）。", "To cancel, please call us at 0939-235-168.")));
    }
    resEl.hidden = false;
    try { resEl.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { /* ignore */ }
  }

  // ---------- 取消訂位／退款 ----------
  function money(n) { return "NT$ " + Number(n || 0).toLocaleString(); }
  function postCancel(confirm) {
    return fetch("/api/cancel-booking", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: codeEl.value.trim(), phone: phoneEl.value.trim(), confirm: !!confirm })
    }).then(function (r) { return r.json().then(function (x) { if (!r.ok) { var e = new Error(x.error || "failed"); e.manual = !!x.manual; throw e; } return x; }); });
  }
  function addCancelBox(d) {
    var paid = d.state === "confirmed";
    var box = el("div", "margin-top:20px;padding-top:16px;border-top:1px dashed rgba(255,255,255,.3);");
    var btn0 = document.createElement("button");
    btn0.type = "button"; btn0.className = "btn";
    btn0.textContent = t("我要取消訂位", "Cancel this booking");
    var out = el("div", "margin-top:12px;");
    box.appendChild(btn0); box.appendChild(out);
    if (paid) box.insertBefore(el("p", "margin:0 0 10px;font-size:14px;opacity:.85;line-height:1.7;",
      t("取消與退款規則：入住前 14 天（含）以上退 100%、7～13 天退 60%、3～6 天退 40%、2 天內不退款；有退款時另扣退款手續費 NT$30。詳見「服務條款與退訂政策」。",
        "Refund policy: 14+ days before check-in 100%, 7–13 days 60%, 3–6 days 40%, within 2 days no refund; NT$30 processing fee is deducted when a refund is made. See the Terms page.")), btn0);
    btn0.addEventListener("click", function () {
      btn0.disabled = true; out.innerHTML = "";
      postCancel(false).then(function (x) {
        out.appendChild(el("p", "margin:0 0 8px;font-weight:700;", x.totals.paid ? t("取消後的退款試算：", "Refund estimate if you cancel:") : t("這筆訂單尚未付款，取消不會產生費用。", "This booking is unpaid; cancelling costs nothing.")));
        if (x.totals.paid) {
          x.items.forEach(function (it) {
            var r = el("div", "display:flex;justify-content:space-between;gap:10px;font-size:15px;");
            r.appendChild(el("span", "", it.site + "　" + it.start + "（" + money(it.total) + "）"));
            r.appendChild(el("span", "white-space:nowrap;", it.percent > 0 ? t("退 " + it.percent + "%", "refund " + it.percent + "%") : t("不退款", "no refund")));
            out.appendChild(r);
          });
          if (x.totals.processingFee > 0) out.appendChild(el("div", "font-size:14px;opacity:.85;margin-top:4px;", t("退款手續費：-" + money(x.totals.processingFee), "Processing fee: -" + money(x.totals.processingFee))));
          out.appendChild(el("div", "font-size:18px;font-weight:700;margin-top:6px;color:" + (x.totals.refund > 0 ? "#8fd68f" : "#f29a9a") + ";", t("預計退款：", "Estimated refund: ") + money(x.totals.refund)));
        }
        out.appendChild(el("p", "margin:10px 0;font-size:14px;opacity:.85;", t("按下「確定取消」後營位會立刻釋出，無法復原。", "Once you confirm, the site is released immediately and this cannot be undone.")));
        var ok = document.createElement("button");
        ok.type = "button"; ok.className = "btn btn-primary";
        ok.textContent = t("確定取消", "Yes, cancel it");
        var no = document.createElement("button");
        no.type = "button"; no.className = "btn"; no.style.marginLeft = "8px";
        no.textContent = t("先不要", "Keep my booking");
        out.appendChild(ok); out.appendChild(no);
        no.addEventListener("click", function () { out.innerHTML = ""; btn0.disabled = false; });
        ok.addEventListener("click", function () {
          ok.disabled = true; no.disabled = true;
          postCancel(true).then(function (y) {
            out.innerHTML = "";
            out.appendChild(el("p", "margin:0;font-weight:700;color:#8fd68f;", t("✅ 已取消。", "✅ Cancelled.")));
            if (y.totals.paid && y.totals.refund > 0) out.appendChild(el("p", "margin:6px 0 0;", t("應退款 " + money(y.totals.refund) + "。我們會與您聯繫確認退款帳戶，並以銀行匯款退回。", "Refund due: " + money(y.totals.refund) + ". We will contact you to confirm your bank account and send the refund by bank transfer.")));
            else if (y.totals.paid) out.appendChild(el("p", "margin:6px 0 0;", t("依規定入住前 2 天內取消，恕無法退款。", "Cancellations within 2 days of check-in are not refundable.")));
            setTimeout(function () { doLookup(); }, 2500);
          }).catch(function (e) { out.innerHTML = ""; out.appendChild(el("p", "color:#f29a9a;margin:0;", e.message)); btn0.disabled = false; });
        });
      }).catch(function (e) { out.appendChild(el("p", "color:#f29a9a;margin:0;", e.message)); btn0.disabled = false; });
    });
    resEl.appendChild(box);
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
