/*
 日曆佔用數字目前仍為隨機示意資料（之後可接後端讀取真實預約狀況）。
 送出表單的部分已接上 /api/create-booking（Vercel Serverless Function + Supabase），
 會依付款方式：
   - 銀行匯款：寫入訂單，顯示既有的匯款須知
   - 線上刷卡（綠界）：寫入訂單後，自動組表單導向綠界收銀台
 注意：/api 這支後端要部署到 Vercel 才會生效，純靜態的 GitHub Pages 不能跑 Serverless Function。

 日曆現在支援全年切換月份（上一頁／下一頁），最早只能回到今天所在的月份，
 最晚開放到 24 個月後，避免使用者滑到太遠、資料也沒意義的月份。
*/

document.addEventListener("DOMContentLoaded", function () {
  function isEnglish() {
    return document.documentElement.lang === "en";
  }

  var calGrid = document.getElementById("calGrid");
  var selectedLabel = document.getElementById("selectedDateLabel");
  var monthLabelEl = document.getElementById("calMonthLabel");
  var prevBtn = document.getElementById("calPrevBtn");
  var nextBtn = document.getElementById("calNextBtn");
  if (!calGrid) return;

  var today = new Date();
  var minYear = today.getFullYear();
  var minMonth = today.getMonth() + 1;

  // 最多開放到 24 個月後
  var maxDate = new Date(minYear, minMonth - 1 + 24, 1);
  var maxYear = maxDate.getFullYear();
  var maxMonth = maxDate.getMonth() + 1;

  var year = minYear;
  var month = minMonth;

  var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var dowsZh = ["日", "一", "二", "三", "四", "五", "六"];
  var dowsEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var selectedCell = null;
  var selectedDateISO = null; // YYYY-MM-DD，送去後端用
  var requestSeq = 0; // 避免月份快速切換時，舊的 API 回應蓋掉新的日曆

  function updateMonthLabel() {
    if (!monthLabelEl) return;
    monthLabelEl.textContent = isEnglish()
      ? monthNames[month - 1] + " " + year
      : year + "年" + month + "月";
  }

  function updateNavButtons() {
    if (prevBtn) {
      prevBtn.disabled = year === minYear && month === minMonth;
    }
    if (nextBtn) {
      nextBtn.disabled = year === maxYear && month === maxMonth;
    }
  }

  function clearSelection() {
    selectedCell = null;
    selectedDateISO = null;
    if (selectedLabel) {
      selectedLabel.innerHTML =
        '<span class="lang-zh">請點選上方日期</span><span class="lang-en" hidden>Select a date above</span>';
      selectedLabel.querySelectorAll(".lang-en").forEach(function (el) {
        el.hidden = !isEnglish();
      });
      selectedLabel.querySelectorAll(".lang-zh").forEach(function (el) {
        el.hidden = isEnglish();
      });
    }
  }

  function loadMonth(y, m) {
    year = y;
    month = m;
    updateMonthLabel();
    updateNavButtons();
    clearSelection();

    var seq = ++requestSeq;
    calGrid.innerHTML = "";

    var dows = isEnglish() ? dowsEn : dowsZh;
    dows.forEach(function (d) {
      var el = document.createElement("div");
      el.className = "cal-dow";
      el.textContent = d;
      calGrid.appendChild(el);
    });

    var loadingEl = document.createElement("div");
    loadingEl.style.cssText = "grid-column:1/-1;font-size:13px;color:var(--gray);padding:8px 0;";
    loadingEl.textContent = isEnglish() ? "Loading availability…" : "空位資料載入中…";
    calGrid.appendChild(loadingEl);

    fetch("/api/get-availability?year=" + y + "&month=" + m)
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "load failed");
          return data;
        });
      })
      .then(function (data) {
        if (seq !== requestSeq) return; // 使用者已經切到別的月份，這筆回應過期了
        loadingEl.remove();
        renderDays(y, m, data.capacity || 60, data.daysInMonth, data.occupied || {});
      })
      .catch(function () {
        if (seq !== requestSeq) return;
        // 後端查詢失敗時，仍然把日曆畫出來（全部當作尚有空位），並提示改用電話確認，
        // 避免因為 API 出錯讓整個預約頁面掛掉。
        loadingEl.remove();
        var daysInMonth = new Date(y, m, 0).getDate();
        renderDays(y, m, 60, daysInMonth, {});
        var warnEl = document.createElement("p");
        warnEl.style.cssText = "font-size:12px;color:#f2c766;margin-top:8px;";
        warnEl.textContent = isEnglish()
          ? "Couldn't load live availability — please confirm by phone."
          : "空位資料暫時無法即時載入，請以電話確認為準。";
        calGrid.parentNode.insertBefore(warnEl, calGrid.nextSibling);
      });
  }

  function renderDays(y, m, capacity, daysInMonth, occupiedByDate) {
    var firstDayOfWeek = new Date(y, m - 1, 1).getDay(); // 0=Sun...6=Sat
    var isCurrentMonth = y === today.getFullYear() && m === today.getMonth() + 1;
    var todayDate = today.getDate();

    for (var i = 0; i < firstDayOfWeek; i++) {
      calGrid.appendChild(document.createElement("div"));
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var isPast = isCurrentMonth && day < todayDate;
      var dateISO = y + "-" + String(m).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      var occupied = occupiedByDate[dateISO] || 0;
      var ratio = occupied / capacity;
      var isFull = occupied >= capacity;
      var level = isFull ? "full" : ratio < 0.5 ? "low" : "mid";

      var cell = document.createElement("div");
      cell.className = "cal-day " + level + (isFull || isPast ? " disabled" : "");
      cell.innerHTML =
        '<span>' + day + '</span><span class="occ">' + occupied + "/" + capacity + "</span>";

      if (isFull || isPast) {
        cell.setAttribute("aria-disabled", "true");
      } else {
        cell.addEventListener("click", function () {
          if (selectedCell) selectedCell.classList.remove("selected");
          this.classList.add("selected");
          selectedCell = this;
          var d = this.querySelector("span").textContent;
          selectedDateISO = year + "-" + String(month).padStart(2, "0") + "-" + String(d).padStart(2, "0");
          selectedLabel.textContent = isEnglish()
            ? "Selected: " + monthNames[month - 1] + " " + d + ", " + year
            : "已選擇：" + year + " 年 " + month + " 月 " + d + " 日";
        });
      }

      calGrid.appendChild(cell);
    }
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", function () {
      if (prevBtn.disabled) return;
      var m = month - 1;
      var y = year;
      if (m < 1) { m = 12; y -= 1; }
      loadMonth(y, m);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", function () {
      if (nextBtn.disabled) return;
      var m = month + 1;
      var y = year;
      if (m > 12) { m = 1; y += 1; }
      loadMonth(y, m);
    });
  }

  loadMonth(year, month);

  var tentsInput = document.getElementById("tents");
  var peopleInput = document.getElementById("people");
  var perTentOut = document.getElementById("perTentOut");
  var totalOut = document.getElementById("totalOut");

  function calc() {
    var tents = Math.max(1, parseInt(tentsInput.value, 10) || 1);
    var people = Math.max(1, parseInt(peopleInput.value, 10) || 1);
    var perTent = 1200 + Math.max(0, people - 2) * 300;
    var total = perTent * tents;
    perTentOut.textContent = "NT$" + perTent.toLocaleString();
    totalOut.textContent = "NT$" + total.toLocaleString();
  }

  tentsInput.addEventListener("input", calc);
  peopleInput.addEventListener("input", calc);
  calc();

  var form = document.getElementById("bookingForm");
  var resultEl = document.getElementById("bookingResult");
  var bankNoticeEl = document.getElementById("bankTransferNotice");

  // 訪客從 LINE Pay 付款完成/取消後，會被導回這頁並帶上 ?linepay=success/fail/cancel
  (function () {
    var linepayStatus = new URLSearchParams(window.location.search).get("linepay");
    if (!linepayStatus || !resultEl) return;
    if (linepayStatus === "success") {
      resultEl.style.color = "#8fd68f";
      resultEl.textContent = isEnglish()
        ? "LINE Pay payment confirmed! We'll contact you soon to confirm your booking."
        : "LINE Pay 付款已確認！我們會盡快與您聯繫確認訂位。";
    } else if (linepayStatus === "cancel") {
      resultEl.style.color = "#f2c766";
      resultEl.textContent = isEnglish()
        ? "LINE Pay payment was cancelled. You can try again or choose another payment method."
        : "已取消 LINE Pay 付款，您可以重新嘗試或選擇其他付款方式。";
    } else {
      resultEl.style.color = "#f29a9a";
      resultEl.textContent = isEnglish()
        ? "LINE Pay payment failed. Please try again or contact us by phone."
        : "LINE Pay 付款未完成，請重新嘗試，或直接電話聯絡我們。";
    }
  })();

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      if (!selectedDateISO) {
        resultEl.style.color = "#f29a9a";
        resultEl.textContent = isEnglish()
          ? "Please select a date from the calendar above first."
          : "請先在上方日曆點選日期";
        return;
      }

      var paymentMethod = form.querySelector('input[name="paymentMethod"]:checked').value;
      var submitBtn = form.querySelector('button[type="submit"]');
      var submitBtnOriginalHTML = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.textContent = isEnglish() ? "Submitting…" : "送出中…";
      resultEl.style.color = "";
      resultEl.textContent = "";

      fetch("/api/create-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: document.getElementById("name").value,
          phone: document.getElementById("phone").value,
          email: document.getElementById("email").value,
          bookingDate: selectedDateISO,
          tents: tentsInput.value,
          people: peopleInput.value,
          paymentMethod: paymentMethod,
        }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || (isEnglish() ? "Submission failed" : "送出失敗"));
            return data;
          });
        })
        .then(function (data) {
          if (data.paymentMethod === "ecpay") {
            bankNoticeEl.style.display = "none";
            resultEl.style.color = "";
            resultEl.textContent = isEnglish()
              ? "Order created — redirecting to ECPay checkout…"
              : "訂單已建立，正在導向綠界收銀台…";
            // 動態組一個 form，POST 到綠界 AioCheckOut，瀏覽器會自動跳轉過去付款
            var ecpayForm = document.createElement("form");
            ecpayForm.method = "POST";
            ecpayForm.action = data.ecpayAction;
            Object.keys(data.ecpayParams).forEach(function (key) {
              var input = document.createElement("input");
              input.type = "hidden";
              input.name = key;
              input.value = data.ecpayParams[key];
              ecpayForm.appendChild(input);
            });
            document.body.appendChild(ecpayForm);
            ecpayForm.submit();
          } else if (data.paymentMethod === "linepay") {
            bankNoticeEl.style.display = "none";
            resultEl.style.color = "";
            resultEl.textContent = isEnglish()
              ? "Order created — redirecting to LINE Pay…"
              : "訂單已建立，正在導向 LINE Pay…";
            window.location.href = data.linepayUrl;
          } else {
            resultEl.style.color = "#8fd68f";
            resultEl.textContent = isEnglish()
              ? "Booking request submitted! Order ID: " + data.bookingId.slice(0, 8) + ". Please complete payment per the transfer details below."
              : "預約申請已送出！訂單編號：" + data.bookingId.slice(0, 8) + "，請依下方匯款須知完成付款。";
            form.reset();
          }
        })
        .catch(function (err) {
          resultEl.style.color = "#f29a9a";
          resultEl.textContent = isEnglish()
            ? "Submission failed: " + err.message + " (you can also reach us by phone)"
            : "送出失敗：" + err.message + "（也可以直接電話聯絡我們）";
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.innerHTML = submitBtnOriginalHTML;
        });
    });
  }
});
