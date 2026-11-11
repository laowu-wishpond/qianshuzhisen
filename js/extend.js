// 「再給我 6 小時」頁：從匯款提醒信的連結進來（extend.html?b=訂單完整編號）。
(function () {
  var box = document.getElementById("xbox");
  if (!box) return;
  var id = "";
  try { id = new URLSearchParams(location.search).get("b") || ""; } catch (e) { /* ignore */ }

  function en() { return typeof isEnglish === "function" && isEnglish(); }
  function t(zh, e) { return en() ? e : zh; }
  function clock(iso) {
    return new Date(iso).toLocaleString(en() ? "en-US" : "zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  function el(tag, css, text) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;
    return n;
  }

  function render(d, justExtended) {
    box.innerHTML = "";
    var headline, color = "#f2c766", detail = "";
    if (justExtended) {
      headline = t("✅ 已幫您多保留 " + d.extendHours + " 小時", "✅ We've held your site " + d.extendHours + " more hours");
      color = "#8fd68f";
      detail = t("現在營位保留到 " + clock(d.holdExpiresAt) + "。請在這個時間前匯款，並到「查詢訂單」回報匯款帳號末五碼。", "Your site is held until " + clock(d.holdExpiresAt) + ". Please transfer before then and report the last 5 digits on the booking lookup page.");
    } else if (d.state === "awaiting_payment") {
      headline = t("⏳ 營位保留中，還沒收到匯款", "⏳ Site held — no payment yet");
      detail = t("目前保留到 " + clock(d.holdExpiresAt) + "。", "Currently held until " + clock(d.holdExpiresAt) + ".");
    } else if (d.state === "reported" || d.state === "confirmed") {
      headline = d.state === "confirmed" ? t("✅ 預約成功", "✅ Booking confirmed") : t("🕓 已收到您的匯款回報，查帳中", "🕓 Payment report received");
      color = "#8fd68f";
      detail = t("這筆訂單不需要延長，營位已為您保留。", "Nothing to extend — your site is held.");
    } else if (d.state === "expired") {
      headline = t("⌛ 保留時間已過，營位已釋出", "⌛ Hold expired — site released");
      color = "#f29a9a";
      detail = t("營位可能已被其他人預約，無法延長。如果您已經匯款，請直接電話聯絡我們（0939-235-168）；也可以重新預約。", "The site may have been booked by someone else, so it can't be extended. If you've already paid, please call 0939-235-168, or book again.");
    } else {
      headline = t("這筆訂單已取消", "This booking was cancelled");
      color = "#f29a9a";
      detail = t("如有疑問，請電話聯絡我們（0939-235-168）。", "Questions? Call us at 0939-235-168.");
    }
    box.appendChild(el("h3", "color:" + color + ";margin:0 0 8px;", headline));
    box.appendChild(el("p", "margin:0 0 12px;", detail));

    var info = el("p", "margin:0;line-height:1.9;");
    info.appendChild(document.createTextNode(t("訂單編號：", "Order no.: ") + d.code));
    info.appendChild(document.createElement("br"));
    info.appendChild(document.createTextNode(t("營位：", "Site: ") + d.site + (d.early ? t("（含夜衝）", " (early arrival)") : "")));
    info.appendChild(document.createElement("br"));
    if (d.start) { info.appendChild(document.createTextNode(t("日期：", "Dates: ") + d.start + " ～ " + d.end)); info.appendChild(document.createElement("br")); }
    info.appendChild(document.createTextNode(t("金額：NT$ ", "Amount: NT$ ") + d.total.toLocaleString()));
    box.appendChild(info);

    if (!justExtended && d.state === "awaiting_payment") {
      var msg = el("p", "margin:12px 0 0;");
      if (d.canExtend) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "btn btn-primary"; b.style.marginTop = "14px";
        b.textContent = t("再給我 " + d.extendHours + " 小時", "Give me " + d.extendHours + " more hours");
        b.addEventListener("click", function () {
          b.disabled = true;
          fetch("/api/extend-hold", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId: id }) })
            .then(function (r) { return r.json().then(function (x) { if (!r.ok) { var e = new Error(x.error || "failed"); e.data = x; throw e; } return x; }); })
            .then(function (x) { render(x, true); })
            .catch(function (e) { b.disabled = false; msg.style.color = "#f29a9a"; msg.textContent = e.message; });
        });
        box.appendChild(b);
      } else {
        msg.textContent = t("這筆訂單已經延長過了，無法再延長。需要幫忙請電話聯絡我們（0939-235-168）。", "This booking has already been extended and can't be extended again. Please call 0939-235-168 if you need help.");
      }
      box.appendChild(msg);
    }
    var link = el("p", "margin-top:16px;");
    var a = document.createElement("a");
    a.href = "order.html?c=" + encodeURIComponent(d.code);
    a.textContent = t("已經匯款了？到「查詢訂單」回報末五碼 →", "Already paid? Report your last 5 digits →");
    link.appendChild(a);
    box.appendChild(link);
    box.hidden = false;
  }

  if (!id) { box.hidden = false; box.appendChild(el("p", "", t("連結不正確，請從信件裡的按鈕進入。", "Invalid link — please use the button in your email."))); return; }
  fetch("/api/extend-hold?b=" + encodeURIComponent(id))
    .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "failed"); return d; }); })
    .then(function (d) { render(d, false); })
    .catch(function (e) { box.hidden = false; box.innerHTML = ""; box.appendChild(el("p", "color:#f29a9a;", e.message)); });
})();
