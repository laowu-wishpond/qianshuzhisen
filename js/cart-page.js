/* 購物車結帳頁：列出每個營位「每一晚的日期＋金額」與總金額（伺服器算的），確認後一次送出，一次匯款。 */
(function () {
  var itemsEl = document.getElementById("cartItems");
  if (!itemsEl) return;
  var emptyEl = document.getElementById("cartEmpty");
  var mainEl = document.getElementById("cartMain");
  var doneEl = document.getElementById("cartDone");
  var totalEl = document.getElementById("cartTotal");
  var countEl = document.getElementById("cartCount");
  var submitBtn = document.getElementById("cartSubmit");
  var resultEl = document.getElementById("cartResult");
  var confirmEl = document.getElementById("cartConfirm");
  var formEl = document.getElementById("cartForm");
  var quote = null;
  var submitted = false;

  function en() { return document.documentElement.lang === "en"; }
  function t(zh, e) { return en() ? e : zh; }
  function money(n) { return "NT$" + Number(n || 0).toLocaleString(); }
  var DOW_ZH = ["日", "一", "二", "三", "四", "五", "六"];
  var DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function dlabel(iso) {
    var d = new Date(iso + "T00:00:00Z");
    var m = d.getUTCMonth() + 1, day = d.getUTCDate(), w = d.getUTCDay();
    return en() ? (m + "/" + day + " (" + DOW_EN[w] + ")") : (m + "/" + day + "（" + DOW_ZH[w] + "）");
  }
  function clock(iso) {
    return new Date(iso).toLocaleString(en() ? "en-US" : "zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  function el(tag, css, text) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;
    return n;
  }
  function post(url, body) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || t("失敗，請稍後再試", "Failed, please try again")); e.data = d; e.status = r.status; throw e; } return d; }); });
  }
  function payload() {
    return TSFCart.get().map(function (x) { return { siteId: x.siteId, checkIn: x.checkIn, checkOut: x.checkOut, earlyArrival: !!x.earlyArrival, people: x.people }; });
  }

  /* ---------- 購物車內容 ---------- */
  function renderItems(q) {
    itemsEl.innerHTML = "";
    var allOk = true;
    q.items.forEach(function (it, i) {
      if (!it.ok) allOk = false;
      var card = el("div", "border:1px solid " + (it.ok ? "rgba(255,255,255,.25)" : "#f29a9a") + ";border-radius:12px;padding:14px 16px;margin:0 0 14px;background:rgba(255,255,255,.04);");
      var head = el("div", "display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;");
      var title = el("div", "line-height:1.6;");
      title.appendChild(el("strong", "font-size:18px;", it.siteId + t(" 營位", " site")));
      var nightsN = it.nights.length + (it.early ? 1 : 0);
      var startLbl = it.early ? it.early.date : it.checkIn;
      title.appendChild(el("div", "opacity:.9;", dlabel(startLbl) + " ～ " + dlabel(it.checkOut) + t("（退房）　", " (check-out)  ") + (it.early ? t((nightsN + 1) + " 天 " + nightsN + " 夜，含夜衝", (nightsN + 1) + " days / " + nightsN + " nights incl. early arrival") : nightsN + t(" 晚", nightsN > 1 ? " nights" : " night"))));
      head.appendChild(title);
      var rm = el("button", "background:none;border:1px solid rgba(255,255,255,.4);color:inherit;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:14px;", t("🗑 移除", "🗑 Remove"));
      rm.type = "button";
      rm.addEventListener("click", function () { TSFCart.remove(i); load(); });
      head.appendChild(rm);
      card.appendChild(head);

      if (!it.ok) {
        card.appendChild(el("p", "color:#f29a9a;font-weight:700;margin:10px 0 0;", "⚠ " + it.error));
        itemsEl.appendChild(card);
        return;
      }
      var tbl = el("div", "margin-top:10px;");
      if (it.early) {
        var er = el("div", "display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px dashed rgba(255,255,255,.15);");
        er.appendChild(el("span", "", dlabel(it.early.date) + "　" + t("夜衝（前一晚 18:00～22:00 進場）", "Early arrival (18:00–22:00)")));
        er.appendChild(el("span", "", money(it.early.price)));
        tbl.appendChild(er);
      }
      it.nights.forEach(function (n) {
        var row = el("div", "display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px dashed rgba(255,255,255,.15);");
        var tag = n.newYear ? t("過年加價 +30%", "Lunar New Year +30%") : n.type === "holiday" ? t("假日", "Holiday") : t("平日", "Weekday");
        row.appendChild(el("span", "", dlabel(n.date) + "　" + tag));
        row.appendChild(el("span", "", money(n.price)));
        tbl.appendChild(row);
      });
      card.appendChild(tbl);
      var foot = el("div", "display:flex;justify-content:space-between;gap:10px;margin-top:8px;font-weight:700;");
      foot.appendChild(el("span", "font-weight:400;opacity:.85;", t("入住人數 ", "Guests: ") + it.people));
      foot.appendChild(el("span", "", t("小計 ", "Subtotal ") + money(it.total)));
      card.appendChild(foot);
      itemsEl.appendChild(card);
    });
    totalEl.textContent = money(q.total);
    countEl.textContent = String(q.items.length);
    submitBtn.disabled = !allOk;
    if (!allOk) {
      resultEl.style.color = "#f29a9a";
      resultEl.textContent = t("有項目無法訂購（紅框），請先移除它，再送出訂單。", "Some items can't be booked (red). Please remove them before submitting.");
    } else if (!submitted) {
      resultEl.textContent = "";
    }
  }

  function load() {
    var items = payload();
    if (!items.length) {
      mainEl.hidden = true;
      emptyEl.hidden = false;
      return Promise.resolve();
    }
    emptyEl.hidden = true;
    mainEl.hidden = false;
    itemsEl.innerHTML = "";
    itemsEl.appendChild(el("p", "opacity:.8;", t("正在計算每一晚的價格與確認空位…", "Calculating nightly prices and checking availability…")));
    return post("/api/cart-quote", { items: items })
      .then(function (q) { quote = q; renderItems(q); })
      .catch(function (e) {
        itemsEl.innerHTML = "";
        itemsEl.appendChild(el("p", "color:#f29a9a;", e.message));
      });
  }

  /* ---------- 送出訂單 ---------- */
  submitBtn.addEventListener("click", function () {
    resultEl.style.color = "#f29a9a";
    if (!formEl.reportValidity()) return;
    if (!confirmEl.checked) { resultEl.textContent = t("請勾選「我已確認營位、日期與金額」", "Please tick the confirmation box."); return; }
    submitBtn.disabled = true;
    var oldHtml = submitBtn.innerHTML;
    submitBtn.textContent = t("送出中…", "Submitting…");
    resultEl.style.color = "";
    resultEl.textContent = "";
    post("/api/create-cart-order", {
      name: document.getElementById("cname").value,
      phone: document.getElementById("cphone").value,
      email: document.getElementById("cemail").value,
      items: payload()
    })
      .then(function (d) {
        submitted = true;
        TSFCart.clear();
        try {
          localStorage.setItem("tsf_pending_hold", JSON.stringify({ bookingId: d.orderId, holdExpiresAt: d.holdExpiresAt }));
          localStorage.setItem("tsf_last_order", d.code);
        } catch (e) { /* ignore */ }
        showDone(d);
      })
      .catch(function (e) {
        resultEl.style.color = "#f29a9a";
        resultEl.textContent = t("送出失敗：", "Failed: ") + e.message;
        submitBtn.disabled = false;
        submitBtn.innerHTML = oldHtml;
        if (e.status === 409 || e.status === 400) load();
      });
  });

  /* ---------- 送出後：整筆訂單編號、金額、匯款、回報末五碼 ---------- */
  function showDone(d) {
    mainEl.hidden = true;
    emptyEl.hidden = true;
    doneEl.hidden = false;
    doneEl.innerHTML = "";
    doneEl.appendChild(el("h2", "color:#8fd68f;margin:0 0 6px;", t("✅ 訂單已送出，營位已為您保留", "✅ Order received — your sites are held")));
    var codeBox = el("div", "margin:10px 0 14px;font-size:16px;");
    codeBox.appendChild(document.createTextNode(t("訂單編號：", "Order no.: ")));
    codeBox.appendChild(el("strong", "font-size:26px;letter-spacing:2px;user-select:all;", d.code));
    codeBox.appendChild(el("div", "font-size:14px;opacity:.85;", t("（請截圖或記下來，查詢訂單與回報匯款都會用到）", "(Please screenshot or write it down — you'll need it to check your order and report payment)")));
    doneEl.appendChild(codeBox);

    d.items.forEach(function (it) {
      var row = el("div", "border:1px solid rgba(255,255,255,.25);border-radius:10px;padding:10px 14px;margin:0 0 10px;");
      var startLbl = it.early ? it.early.date : it.checkIn;
      row.appendChild(el("div", "font-weight:700;", it.siteId + t(" 營位　", " site  ") + dlabel(startLbl) + " ～ " + dlabel(it.checkOut)));
      if (it.early) {
        var r2 = el("div", "display:flex;justify-content:space-between;opacity:.9;font-size:15px;");
        r2.appendChild(el("span", "", dlabel(it.early.date) + "　" + t("夜衝", "Early arrival")));
        r2.appendChild(el("span", "", money(it.early.price)));
        row.appendChild(r2);
      }
      it.nights.forEach(function (n) {
        var r = el("div", "display:flex;justify-content:space-between;opacity:.9;font-size:15px;");
        var tag = n.newYear ? t("過年加價", "Lunar New Year") : n.type === "holiday" ? t("假日", "Holiday") : t("平日", "Weekday");
        r.appendChild(el("span", "", dlabel(n.date) + "　" + tag));
        r.appendChild(el("span", "", money(n.price)));
        row.appendChild(r);
      });
      row.appendChild(el("div", "text-align:right;font-weight:700;margin-top:4px;", t("小計 ", "Subtotal ") + money(it.total)));
      doneEl.appendChild(row);
    });

    var tot = el("div", "display:flex;justify-content:space-between;align-items:baseline;margin:14px 0;font-size:18px;");
    tot.appendChild(el("span", "", t("請一次匯款合計", "Please transfer in one payment")));
    tot.appendChild(el("strong", "font-size:30px;color:var(--gold, #e0ab3d);", money(d.totalAmount)));
    doneEl.appendChild(tot);

    var bank = el("div", "line-height:1.9;padding:12px 14px;border:2px solid #e8c26a;border-radius:10px;background:rgba(255,244,214,.10);");
    bank.appendChild(el("div", "font-weight:700;", t("匯款資料", "Bank transfer details")));
    bank.appendChild(el("div", "", t("中國信託（822）敦北分行", "CTBC Bank (822), Dunbei Branch")));
    bank.appendChild(el("div", "", t("帳號：015536772101", "Account: 015536772101")));
    bank.appendChild(el("div", "", t("戶名：林長南", "Account name: Lin Chang-Nan")));
    doneEl.appendChild(bank);

    var holdP = el("p", "margin:14px 0 8px;font-weight:700;", t("請在 " + clock(d.holdExpiresAt) + " 前匯款，並在下面回報匯款帳號末五碼（整筆訂單只要回報一次）。逾時系統會自動釋出所有營位。", "Please pay before " + clock(d.holdExpiresAt) + " and send the last 5 digits of your transfer account below (once for the whole order). Otherwise all sites are released automatically."));
    doneEl.appendChild(holdP);

    var row = el("div", "display:flex;gap:8px;flex-wrap:wrap;align-items:center;");
    var inp = document.createElement("input");
    inp.type = "text"; inp.inputMode = "numeric"; inp.maxLength = 5; inp.pattern = "[0-9]*";
    inp.placeholder = t("匯款帳號末五碼", "Last 5 digits of your account");
    inp.style.cssText = "max-width:200px;";
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "btn btn-primary";
    btn.textContent = t("我已匯款，回報末五碼", "I've paid — send last 5 digits");
    var msg = el("p", "margin:10px 0 0;");
    row.appendChild(inp); row.appendChild(btn);
    doneEl.appendChild(row); doneEl.appendChild(msg);
    btn.addEventListener("click", function () {
      var v = inp.value.trim();
      if (!/^\d{5}$/.test(v)) { msg.style.color = "#f29a9a"; msg.textContent = t("請填 5 位數字", "Please enter exactly 5 digits."); return; }
      btn.disabled = true;
      post("/api/report-transfer", { bookingId: d.orderId, last5: v })
        .then(function () {
          try { localStorage.removeItem("tsf_pending_hold"); } catch (e) { /* ignore */ }
          row.style.display = "none";
          holdP.textContent = t("感謝您！已收到您回報的末五碼 " + v + "，所有營位都為您保留。我們查帳以後，會主動寄一封 email 通知您預約成功（請也看一下垃圾信件匣）。", "Thank you! We've received the last 5 digits (" + v + ") and all your sites are held. We'll email you once the payment is confirmed (please check your spam folder too).");
          msg.textContent = "";
        })
        .catch(function (e) { btn.disabled = false; msg.style.color = "#f29a9a"; msg.textContent = e.message; });
    });

    var note = el("p", "margin:16px 0 0;font-size:14px;opacity:.9;");
    note.appendChild(document.createTextNode(t("確認信已寄到您的信箱（含每個營位、每一晚的金額）。之後可到「", "A confirmation email with every site and nightly price has been sent. You can check your order anytime at “")));
    var a = document.createElement("a");
    a.href = "order.html?c=" + d.code;
    a.textContent = t("查詢訂單", "Check my order");
    note.appendChild(a);
    note.appendChild(document.createTextNode(t("」，輸入訂單編號和電話。", "” with your order number and phone.")));
    doneEl.appendChild(note);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { /* ignore */ }
  }

  window.addEventListener("tsf-cart-changed", function () { if (!submitted) load(); });
  try {
    new MutationObserver(function () { if (quote && !submitted) renderItems(quote); }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  } catch (e) { /* ignore */ }
  load();
})();
