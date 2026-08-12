/*
 日曆佔用數字目前仍為隨機示意資料（之後可接後端讀取真實預約狀況）。
 送出表單的部分已接上 /api/create-booking（Vercel Serverless Function + Supabase），
 會依付款方式：
   - 銀行匯款：寫入訂單，顯示既有的匯款須知
   - 線上刷卡（綠界）：寫入訂單後，自動組表單導向綠界收銀台
 注意：/api 這支後端要部署到 Vercel 才會生效，純靜態的 GitHub Pages 不能跑 Serverless Function。
*/

document.addEventListener("DOMContentLoaded", function () {
  function isEnglish() {
    return document.documentElement.lang === "en";
  }

  var calGrid = document.getElementById("calGrid");
  var selectedLabel = document.getElementById("selectedDateLabel");
  if (!calGrid) return;

  var year = 2026;
  var month = 8; // 8月
  var daysInMonth = 31;
  var firstDayOfWeek = 6; // 2026/8/1 是星期六

  var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var dows = isEnglish()
    ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    : ["日", "一", "二", "三", "四", "五", "六"];
  dows.forEach(function (d) {
    var el = document.createElement("div");
    el.className = "cal-dow";
    el.textContent = d;
    calGrid.appendChild(el);
  });

  for (var i = 0; i < firstDayOfWeek; i++) {
    calGrid.appendChild(document.createElement("div"));
  }

  var selectedCell = null;
  var selectedDateISO = null; // YYYY-MM-DD，送去後端用

  for (var day = 1; day <= daysInMonth; day++) {
    var occupied = (day * 13) % 61;
    var ratio = occupied / 60;
    var level = ratio < 0.5 ? "low" : ratio < 0.85 ? "mid" : "full";

    var cell = document.createElement("div");
    cell.className = "cal-day " + level;
    cell.innerHTML =
      '<span>' + day + '</span><span class="occ">' + occupied + "/60</span>";

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

    calGrid.appendChild(cell);
  }

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

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      if (!selectedDateISO) {
        resultEl.style.color = "#b00020";
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
          } else {
            resultEl.style.color = "#1a7d3f";
            resultEl.textContent = isEnglish()
              ? "Booking request submitted! Order ID: " + data.bookingId.slice(0, 8) + ". Please complete payment per the transfer details below."
              : "預約申請已送出！訂單編號：" + data.bookingId.slice(0, 8) + "，請依下方匯款須知完成付款。";
            form.reset();
          }
        })
        .catch(function (err) {
          resultEl.style.color = "#b00020";
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
