/*
 依營位預約（林大哥規則）：
 - 客人先選「入住日 → 退房日」（可連住，連住不打折），再點地圖或清單選一個營位。
 - 價格是「每個營位／每晚」，整塊出租，不限帳數、不看人數；平日（週日～週四）與假日（週五、週六、國定假日）不同價。
 - 夜衝（前一晚 18:00～22:00 進場）可勾選，必須同時預訂隔日正式營位；夜衝價 = 夜衝那一晚當天價格的 5 折。
 - 價格資料與計價公式在 lib/sites.js、lib/holidays.js、lib/pricing.js，
   前端（這支）與後端（api/create-booking.js）共用同一份，金額不會對不上；改價格只要改 lib/sites.js。
 - 空位來自 /api/get-availability（Supabase booking_nights 表的真實資料）。
 - 送出表單接 /api/create-booking，付款方式：銀行匯款／綠界刷卡／LINE Pay。
 注意：/api 這支後端要部署到 Vercel 才會生效，純靜態的 GitHub Pages 不能跑 Serverless Function。

 日曆支援全年切換月份，最早只能回到今天所在的月份，最晚開放到 24 個月後。
*/

document.addEventListener("DOMContentLoaded", function () {
  var calGrid = document.getElementById("calGrid");
  if (!calGrid) return;

  function isEnglish() {
    return document.documentElement.lang === "en";
  }
  function t(zh, en) {
    return isEnglish() ? en : zh;
  }

  var selectedLabel = document.getElementById("selectedDateLabel");
  var monthLabelEl = document.getElementById("calMonthLabel");
  var prevBtn = document.getElementById("calPrevBtn");
  var nextBtn = document.getElementById("calNextBtn");
  var pinsEl = document.getElementById("sitePins");
  var siteSelect = document.getElementById("siteSelect");
  var siteInfoEl = document.getElementById("siteInfo");
  var quoteBox = document.getElementById("quoteBox");
  var peopleInput = document.getElementById("people");
  var earlyBox = document.getElementById("earlyArrival");
  var earlyNote = document.getElementById("earlyNote");
  var totalOut = document.getElementById("totalOut");
  var form = document.getElementById("bookingForm");
  var resultEl = document.getElementById("bookingResult");
  var bankNoticeEl = document.getElementById("bankTransferNotice");

  /* ---------- 開放預約時間（由伺服器判斷，到點自動開放） ---------- */
  var gateOpen = true;
  var gateOpensAt = null;
  var gateBtn = form ? form.querySelector('button[type="submit"]') : null;
  var gateBtnHTML = gateBtn ? gateBtn.innerHTML : "";
  var gateNote = null;
  if (form && gateBtn) {
    gateNote = document.createElement("p");
    gateNote.className = "notice";
    gateNote.style.cssText = "margin-top:14px;font-weight:600;";
    gateNote.hidden = true;
    gateBtn.insertAdjacentElement("beforebegin", gateNote);
  }
  function gateTimeLabel() {
    if (!gateOpensAt) return "";
    var d = new Date(gateOpensAt);
    var opt = { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false };
    return d.toLocaleString(document.documentElement.lang === "en" ? "en-US" : "zh-TW", opt);
  }
  function applyGate() {
    if (!gateBtn) return;
    var en = typeof isEnglish === "function" && isEnglish();
    if (gateOpen) {
      if (gateNote) gateNote.hidden = true;
      if (gateBtn.dataset.gated) {
        gateBtn.disabled = false;
        gateBtn.innerHTML = gateBtnHTML;
        delete gateBtn.dataset.gated;
      }
    } else {
      var label = gateTimeLabel();
      gateBtn.dataset.gated = "1";
      gateBtn.disabled = true;
      gateBtn.textContent = en ? "Booking opens " + label : label + " 開放預約";
      if (gateNote) {
        gateNote.hidden = false;
        gateNote.textContent = en
          ? "Online booking opens " + label + " (Taiwan time). Until then you can browse the campsites and prices."
          : "線上預約將於 " + label + " 開放，目前可以先瀏覽營位與價格。";
      }
    }
  }
  function refreshGate() {
    fetch("/api/booking-status", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        gateOpen = !!d.open;
        gateOpensAt = d.opensAt;
        applyGate();
      })
      .catch(function () { /* 查不到就維持原狀，真正擋單的是後端 */ });
  }
  refreshGate();
  setInterval(refreshGate, 30000);

  // 地圖上每個營位的位置（以 images/site-map.jpg 1374×1145 的像素座標，程式會換算成百分比）
  var MAP_W = 1374;
  var MAP_H = 1145;
  var MAP_POS = {
    A1: [1100, 421], A2: [946, 332], A3: [1001, 432], A4: [888, 379], A5: [934, 473],
    A6: [822, 432], A7: [759, 483], A8: [795, 578], A9: [703, 531], A10: [748, 632],
    B1: [752, 151], B2: [722, 226], B3: [665, 292], B4: [582, 363], B5: [429, 461],
    C1: [362, 960], C2: [316, 895], C3: [270, 836], C4: [184, 764], C5: [145, 720],
    C6: [108, 675], C7: [264, 630], C8: [236, 587], C9: [230, 534],
    D1: [73, 510], D2: [87, 430], D3: [289, 320], D4: [103, 352], D5: [316, 250],
    D6: [327, 189], D7: [150, 260], D8: [201, 142], D9: [322, 126], D10: [194, 68], D11: [282, 68]
  };

  var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var dowsZh = ["日", "一", "二", "三", "四", "五", "六"];
  var dowsEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // 「重新選擇日期」按鈕（用程式建立，放在日期說明文字旁）
  var resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "cal-reset-btn";
  resetBtn.hidden = true;
  selectedLabel.insertAdjacentElement("afterend", resetBtn);
  resetBtn.addEventListener("click", function () {
    checkIn = null;
    checkOut = null;
    updateAll();
  });

  var P = null; // lib/pricing.js（動態載入，前後端共用）
  var PHOTOS = {}; // lib/sitePhotos.js：各營位實景照片張數
  var previewId = null; // 點到「已被預訂」的營位時，只看照片、不選取
  // 營位備註（只顯示在營位資訊裡）。要加備註：在這裡新增一行即可。
  var SITE_NOTES = {
    C1: { zh: "適合露營車停放", en: "Suitable for motorhomes / RVs" }
  };
  var today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  var minYear = parseInt(today.slice(0, 4), 10);
  var minMonth = parseInt(today.slice(5, 7), 10);
  var maxDate = new Date(Date.UTC(minYear, minMonth - 1 + 24, 1));
  var maxYear = maxDate.getUTCFullYear();
  var maxMonth = maxDate.getUTCMonth() + 1;

  var year = minYear;
  var month = minMonth;

  var occupied = {}; // { "2026-12-05": ["A1", "B3"] }
  var availError = false;
  var requestSeq = 0;

  var checkIn = null;
  var checkOut = null;
  var siteId = null;

  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function money(n) {
    return "NT$" + Number(n).toLocaleString();
  }
  function md(iso) {
    return parseInt(iso.slice(5, 7), 10) + "/" + parseInt(iso.slice(8, 10), 10);
  }
  function dateLabel(iso) {
    var d = P.dayOfWeek(iso);
    return isEnglish() ? md(iso) + " " + dowsEn[d] : md(iso) + "（" + dowsZh[d] + "）";
  }
  function occSet(iso) {
    return occupied[iso] || [];
  }
  function siteObj() {
    return siteId ? P.getSite(siteId) : null;
  }
  function stayNights() {
    return checkIn && checkOut ? P.nightsBetween(checkIn, checkOut) : [];
  }
  // 這個營位在所選的每一晚是否都空著；還沒選完日期時回傳 null
  function siteFree(id) {
    var nights = stayNights();
    if (!nights.length) return null;
    return nights.every(function (d) {
      return occSet(d).indexOf(id) === -1;
    });
  }
  // 夜衝那一晚（入住日前一天）這個營位是否空著、且不是過去的日子
  function earlyFree(id) {
    if (!checkIn) return false;
    var d = P.addDays(checkIn, -1);
    return d >= today && occSet(d).indexOf(id) === -1;
  }

  /* ---------- 日曆 ---------- */

  function updateMonthLabel() {
    monthLabelEl.textContent = isEnglish()
      ? monthNames[month - 1] + " " + year
      : year + "年" + month + "月";
  }

  function updateNavButtons() {
    if (prevBtn) prevBtn.disabled = year === minYear && month === minMonth;
    if (nextBtn) nextBtn.disabled = year === maxYear && month === maxMonth;
  }

  function loadMonthData(y, m) {
    var seq = ++requestSeq;
    var first = y + "-" + pad(m) + "-01";
    var last = y + "-" + pad(m) + "-" + pad(new Date(y, m, 0).getDate());
    // 多抓前一天（夜衝）與後 14 天（連住跨到下個月）
    var from = P.addDays(first, -1);
    var to = P.addDays(last, P.MAX_NIGHTS);

    return fetch("/api/get-availability?from=" + from + "&to=" + to)
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "load failed");
          return data;
        });
      })
      .then(function (data) {
        if (seq !== requestSeq) return;
        availError = false;
        var d = from;
        while (d <= to) {
          delete occupied[d];
          d = P.addDays(d, 1);
        }
        Object.keys(data.occupiedSites || {}).forEach(function (k) {
          occupied[k] = data.occupiedSites[k];
        });
      })
      .catch(function () {
        if (seq !== requestSeq) return;
        availError = true;
      });
  }

  function renderCalendar() {
    updateMonthLabel();
    updateNavButtons();
    calGrid.innerHTML = "";

    (isEnglish() ? dowsEn : dowsZh).forEach(function (d) {
      var el = document.createElement("div");
      el.className = "cal-dow";
      el.textContent = d;
      calGrid.appendChild(el);
    });

    var firstDow = new Date(year, month - 1, 1).getDay();
    var daysInMonth = new Date(year, month, 0).getDate();
    var total = P.SITES.length;
    var lastCheckoutAllowed = checkIn ? P.addDays(checkIn, P.MAX_NIGHTS) : null;

    for (var i = 0; i < firstDow; i++) calGrid.appendChild(document.createElement("div"));

    for (var day = 1; day <= daysInMonth; day++) {
      var iso = year + "-" + pad(month) + "-" + pad(day);
      var used = occSet(iso).length;
      var free = total - used;
      var ratio = used / total;
      var isFull = free <= 0;
      var level = isFull ? "full" : ratio < 0.5 ? "low" : "mid";

      var disabled = iso < today;
      if (checkIn && iso > checkIn) {
        // 這天會當成「退房日」：當天早上就離場，客滿也沒關係；但不能超過最長連住晚數
        if (iso > lastCheckoutAllowed) disabled = true;
      } else if (isFull) {
        disabled = true; // 這天會當成「入住日」：當晚整個營區客滿就不能選
      }

      var cls = "cal-day " + level;
      if (disabled) cls += " disabled";
      if (checkIn && iso === checkIn) cls += " selected";
      else if (checkOut && iso === checkOut) cls += " selected-out";
      else if (checkIn && checkOut && iso > checkIn && iso < checkOut) cls += " in-range";

      var cell = document.createElement("div");
      cell.className = cls;
      var holiday = P.dayTypeOf(iso) === "holiday";
      var hName = P.holidayName(iso);
      cell.innerHTML =
        "<span>" + day + "</span>" +
        '<span class="occ">' + (availError ? "" : t("剩", "") + free + t("", " left")) + "</span>" +
        (holiday ? '<span class="hd-badge">' + t("假", "H") + "</span>" : "");
      cell.title = (hName ? hName + "　" : "") + (holiday ? t("假日價", "Holiday rate") : t("平日價", "Weekday rate"));

      if (disabled) {
        cell.setAttribute("aria-disabled", "true");
      } else {
        (function (isoDate) {
          cell.addEventListener("click", function () {
            pickDate(isoDate);
          });
        })(iso);
      }
      calGrid.appendChild(cell);
    }

    var oldWarn = document.getElementById("availWarn");
    if (oldWarn) oldWarn.remove();
    if (availError) {
      var warnEl = document.createElement("p");
      warnEl.id = "availWarn";
      warnEl.style.cssText = "font-size:12px;color:#f2c766;margin-top:8px;";
      warnEl.textContent = t(
        "空位資料暫時無法即時載入，請以電話確認為準。",
        "Couldn't load live availability — please confirm by phone."
      );
      calGrid.parentNode.insertBefore(warnEl, calGrid.nextSibling);
    }
  }

  // 點日期的規則：
  // - 還沒選過：這天是入住日，先預設住一晚（價格馬上算出來）
  // - 已選入住日後，點更晚的日期：改成退房日（連住多晚）
  // - 點入住日當天或更早的日期：重新以這天當入住日（預設住一晚）
  // - 想把入住日改到更晚，按「取消選擇日期」重選
  // - 再點一次入住日：取消全部日期選擇
  // - 再點一次退房日：退回只住一晚（再點入住日就能完全取消）
  function pickDate(iso) {
    if (checkIn && iso === checkIn) {
      checkIn = null;
      checkOut = null;
    } else if (checkIn && checkOut && iso === checkOut && P.addDays(checkIn, 1) !== checkOut) {
      checkOut = P.addDays(checkIn, 1);
    } else if (!checkIn) {
      checkIn = iso;
      checkOut = P.addDays(iso, 1);
    } else if (iso > checkIn) {
      checkOut = iso;
    } else {
      checkIn = iso;
      checkOut = P.addDays(iso, 1);
    }
    updateAll();
  }

  function goMonth(y, m) {
    year = y;
    month = m;
    updateMonthLabel();
    updateNavButtons();
    loadMonthData(y, m).then(updateAll);
  }

  /* ---------- 營位（地圖＋清單）---------- */

  function buildPins() {
    pinsEl.innerHTML = "";
    P.SITES.forEach(function (s) {
      var pos = MAP_POS[s.id];
      if (!pos) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "site-pin zone-" + s.zone;
      b.dataset.site = s.id;
      b.textContent = s.id;
      b.style.left = (pos[0] / MAP_W) * 100 + "%";
      b.style.top = (pos[1] / MAP_H) * 100 + "%";
      b.addEventListener("click", function () {
        if (b.classList.contains("unavailable")) {
          previewId = s.id; // 已被預訂：不能選，但仍可看實景照片
          updateSiteInfo();
          return;
        }
        chooseSite(s.id);
      });
      pinsEl.appendChild(b);
    });
  }

  function siteSummary(s) {
    return (
      s.id + " · " + s.length + "×" + s.width + t(" 公尺", " m") +
      " · " + t("平日 ", "weekday ") + money(s.weekday) + " / " + t("假日 ", "holiday ") + money(s.holiday)
    );
  }

  function buildSelect() {
    var keep = siteId;
    siteSelect.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = t("請選擇營位", "Select a campsite");
    siteSelect.appendChild(ph);
    Object.keys(P.ZONES).forEach(function (z) {
      var g = document.createElement("optgroup");
      g.label = z + t(" 區 ", " – ") + (isEnglish() ? P.ZONES[z].en : P.ZONES[z].zh);
      P.SITES.filter(function (s) {
        return s.zone === z;
      }).forEach(function (s) {
        var o = document.createElement("option");
        o.value = s.id;
        var free = siteFree(s.id);
        o.textContent = siteSummary(s) + (free === false ? t("（已被預訂）", " (booked)") : "");
        if (free === false) o.disabled = true;
        g.appendChild(o);
      });
      siteSelect.appendChild(g);
    });
    siteSelect.value = keep || "";
  }

  function updatePins() {
    Array.prototype.forEach.call(pinsEl.children, function (b) {
      var s = P.getSite(b.dataset.site);
      var free = siteFree(s.id);
      b.classList.toggle("unavailable", free === false);
      b.classList.toggle("selected", s.id === siteId);
      b.title = siteSummary(s) + (free === false ? t("（所選日期已被預訂）", " (booked for your dates)") : "");
      b.setAttribute("aria-label", b.title);
    });
  }

  function chooseSite(id) {
    previewId = null;
    siteId = id || null;
    var s = siteObj();
    updateAll();
  }

  function photoUrls(id) {
    var n = PHOTOS[id] || 0;
    var urls = [];
    for (var i = 1; i <= n; i++) urls.push("images/sites/" + id + (i === 1 ? "" : "-" + i) + ".jpg?v=20261108");
    return urls;
  }

  var photoBox = null;
  var photoState = { urls: [], i: 0, id: "" };

  function showPhoto() {
    var img = photoBox.querySelector("img");
    img.src = photoState.urls[photoState.i];
    img.alt = photoState.id + t(" 營位實景照片", " campsite photo");
    var multi = photoState.urls.length > 1;
    photoBox.querySelector(".prev").hidden = !multi;
    photoBox.querySelector(".next").hidden = !multi;
    photoBox.querySelector(".site-photo-cap").textContent =
      photoState.id + (multi ? "　" + (photoState.i + 1) + " / " + photoState.urls.length : "");
  }

  function closePhoto() {
    if (photoBox) photoBox.hidden = true;
    document.body.classList.remove("site-photo-open");
  }

  function stepPhoto(d) {
    var n = photoState.urls.length;
    photoState.i = (photoState.i + d + n) % n;
    showPhoto();
  }

  function openPhoto(urls, i, id) {
    if (!photoBox) {
      photoBox = document.createElement("div");
      photoBox.className = "site-photo-box";
      photoBox.hidden = true;
      photoBox.innerHTML =
        '<button type="button" class="site-photo-close" aria-label="關閉 / Close">×</button>' +
        '<button type="button" class="site-photo-nav prev" aria-label="上一張 / Previous">‹</button>' +
        '<img alt="">' +
        '<button type="button" class="site-photo-nav next" aria-label="下一張 / Next">›</button>' +
        '<div class="site-photo-cap"></div>';
      document.body.appendChild(photoBox);
      photoBox.addEventListener("click", function (e) {
        if (e.target === photoBox || e.target.classList.contains("site-photo-close")) closePhoto();
      });
      photoBox.querySelector(".prev").addEventListener("click", function () { stepPhoto(-1); });
      photoBox.querySelector(".next").addEventListener("click", function () { stepPhoto(1); });
      document.addEventListener("keydown", function (e) {
        if (photoBox.hidden) return;
        if (e.key === "Escape") closePhoto();
        else if (e.key === "ArrowLeft" && photoState.urls.length > 1) stepPhoto(-1);
        else if (e.key === "ArrowRight" && photoState.urls.length > 1) stepPhoto(1);
      });
    }
    photoState = { urls: urls, i: i, id: id };
    showPhoto();
    photoBox.hidden = false;
    document.body.classList.add("site-photo-open");
  }

  function updateSiteInfo() {
    var s = previewId ? P.getSite(previewId) : siteObj();
    if (!s) {
      siteInfoEl.innerHTML = "";
      return;
    }
    var zoneName = isEnglish() ? P.ZONES[s.zone].en : s.zone + " 區 " + P.ZONES[s.zone].zh;
    siteInfoEl.innerHTML =
      "<strong>" + s.id + "</strong>　" + zoneName + "　" + s.length + "×" + s.width + t(" 公尺", " m") + "<br>" +
      t("平日 ", "Weekday ") + money(s.weekday) + "　" + t("假日 ", "Holiday ") + money(s.holiday) + "　" +
      t("夜衝 ", "Early arrival ") + t("平日 " + money(P.earlyPrice(s, "2026-11-10")) + "／假日 " + money(P.earlyPrice(s, "2026-11-13")), "weekday " + money(P.earlyPrice(s, "2026-11-10")) + " / holiday " + money(P.earlyPrice(s, "2026-11-13"))) +
      (SITE_NOTES[s.id] ? '<br><span class="site-note">' + t(SITE_NOTES[s.id].zh, SITE_NOTES[s.id].en) + "</span>" : "") +
      (previewId ? '<br><span class="site-info-note">' + t("此營位在您選的日期已被預訂，僅供查看照片。", "This site is booked for your dates; photos are for viewing only.") + "</span>" : "");

    var urls = photoUrls(s.id);
    var wrap = document.createElement("div");
    if (urls.length) {
      wrap.className = "site-photos";
      var cur = 0;
      var big = document.createElement("button");
      big.type = "button";
      big.className = "site-photo-big";
      big.setAttribute("aria-label", s.id + t(" 實景照片，點擊放大", " photo, tap to enlarge"));
      var bigImg = document.createElement("img");
      bigImg.alt = s.id + t(" 營位實景照片", " campsite photo");
      bigImg.src = urls[0];
      var tip = document.createElement("span");
      tip.className = "site-photo-tip";
      tip.textContent = t("點照片放大", "Tap to enlarge");
      big.appendChild(bigImg);
      big.appendChild(tip);
      big.addEventListener("click", function () { openPhoto(urls, cur, s.id); });
      wrap.appendChild(big);
      if (urls.length > 1) {
        var row = document.createElement("div");
        row.className = "site-photo-thumbs";
        urls.forEach(function (u, i) {
          var tb = document.createElement("button");
          tb.type = "button";
          tb.className = "site-photo" + (i === 0 ? " active" : "");
          var im = document.createElement("img");
          im.src = u;
          im.alt = s.id + " " + (i + 1);
          tb.appendChild(im);
          tb.addEventListener("click", function () {
            cur = i;
            bigImg.src = u;
            Array.prototype.forEach.call(row.children, function (c, k) { c.classList.toggle("active", k === i); });
          });
          row.appendChild(tb);
        });
        wrap.appendChild(row);
      }
    } else {
      wrap.className = "site-photo-none";
      wrap.textContent = t("實景照片陸續更新中", "Site photos coming soon");
    }
    siteInfoEl.appendChild(wrap);
  }

  /* ---------- 明細與價格 ---------- */

  function updateSelectedLabel() {
    var text;
    if (!checkIn) {
      text = t("請點選入住日", "Select your check-in date");
    } else if (!checkOut) {
      text = t("入住日：", "Check-in: ") + dateLabel(checkIn) + t("　→ 請再點選退房日", "  → now select your check-out date");
    } else {
      var n = stayNights().length;
      text = t(
        dateLabel(checkIn) + " 入住 → " + dateLabel(checkOut) + " 退房，共 " + n + " 晚",
        dateLabel(checkIn) + " check-in → " + dateLabel(checkOut) + " check-out, " + n + " night(s)"
      );
    }
    selectedLabel.textContent = text;
    if (resetBtn) {
      resetBtn.hidden = !checkIn;
      resetBtn.textContent = t("✕ 取消選擇日期", "✕ Clear dates");
    }
  }

  function currentQuote() {
    if (!siteId || !checkIn || !checkOut) return null;
    return P.quoteStay({
      siteId: siteId,
      checkIn: checkIn,
      checkOut: checkOut,
      earlyArrival: earlyBox.checked && !earlyBox.disabled,
      today: today
    });
  }

  function updateEarly() {
    var s = siteObj();
    var note;
    var can = false;
    if (!s) {
      note = t("請先選擇營位", "Choose a campsite first");
    } else if (!checkIn) {
      note = t("請先選擇入住日", "Choose a check-in date first");
    } else if (P.earlyBlockReason(P.addDays(checkIn, -1))) {
      note = t("過年期間不提供夜衝", "Early arrival is not offered during Lunar New Year");
    } else if (!earlyFree(s.id)) {
      note = t("前一晚這個營位已被預訂或日期已過，無法加訂夜衝", "Not available: the night before is booked or already past");
    } else {
      can = true;
      var eDate = P.addDays(checkIn, -1);
      var ePrice = P.earlyPrice(s, eDate);
      var eHoliday = P.dayTypeOf(eDate) === "holiday";
      note = t(
        "夜衝（前一晚 18:00～22:00 進場）＋" + money(ePrice) + "，是前一晚" + (eHoliday ? "假日價" : "平日價") + "的 5 折；須同時預訂隔日正式營位，22:00 後請降低音量",
        "Early arrival (arrive 18:00–22:00 the night before) +" + money(ePrice) + " — 50% off that night's " + (eHoliday ? "holiday" : "weekday") + " rate; must be combined with the next day's stay; quiet after 22:00"
      );
    }
    earlyBox.disabled = !can;
    if (!can) earlyBox.checked = false;
    earlyNote.textContent = note;
  }

  function updateQuote() {
    var s = siteObj();
    var html = "";
    var total = 0;
    var blocked = false;

    if (!s) {
      html = t("請先在左邊選擇日期與營位，這裡會自動算出每晚的價格與總金額。", "Pick your dates and a campsite on the left; nightly prices and the total will appear here automatically.");
    } else if (!checkIn || !checkOut) {
      html =
        '<div class="quote-title">' + s.id + t("　營位價格", " rates") + "</div>" +
        t("平日 ", "Weekday ") + money(s.weekday) + "　" + t("假日 ", "Holiday ") + money(s.holiday) + "　" + t("夜衝 ", "Early ") + t("當晚價格 5 折", "50% off that night") +
        "<br>" + t("請在左邊選擇入住日與退房日。", "Select your check-in and check-out dates on the left.");
    } else {
      var free = siteFree(s.id);
      var q = currentQuote();
      if (free === false) {
        blocked = true;
        html = '<div class="quote-err">' + t(s.id + " 營位在所選日期已被預訂，請改選其他營位或日期。", s.id + " is booked for the selected dates. Please choose another site or dates.") + "</div>";
      } else if (!q.ok) {
        blocked = true;
        html = '<div class="quote-err">' + q.error + "</div>";
      } else {
        total = q.total;
        html = '<div class="quote-title">' + s.id + t("　住宿明細", " stay details") + "</div>";
        q.nights.forEach(function (n) {
          html +=
            '<div class="quote-row"><span>' + dateLabel(n.date) + "　" +
            (n.newYear ? '<span class="tag-holiday">' + t("過年加價 +30%", "Lunar New Year +30%") + "</span>" : n.type === "holiday" ? '<span class="tag-holiday">' + t("假日", "Holiday") + "</span>" : t("平日", "Weekday")) +
            "</span><span>" + money(n.price) + "</span></div>";
        });
        if (q.early) {
          html += '<div class="quote-row"><span>' + dateLabel(q.early.date) + "　" + t("加訂前一晚夜衝（18:00～22:00 進場，當晚價格 5 折）", "Early arrival the night before (18:00–22:00, 50% off)") + "</span><span>" + money(q.early.price) + "</span></div>";
        }
        if (checkOut > P.HOLIDAYS_COVERED_THROUGH) {
          var y = P.HOLIDAYS_COVERED_THROUGH.slice(0, 4);
          html += '<div class="quote-warn">' + t(
            "提醒：" + y + " 年以後的國定假日尚未公布，目前只將週五、週六算假日價，確認訂位時會再核對。",
            "Note: public holidays after " + y + " aren't published yet; only Fri/Sat are counted at holiday rates for now. We'll double-check when confirming."
          ) + "</div>";
        }
      }
    }

    quoteBox.innerHTML = html;
    totalOut.textContent = total > 0 ? money(total) : "—";
    quoteBox.dataset.blocked = blocked ? "1" : "";
  }

  function updateAll() {
    applyGate();
    renderCalendar();
    updateSelectedLabel();
    buildSelect();
    updatePins();
    updateSiteInfo();
    updateEarly();
    updateQuote();
  }

  /* ---------- 事件 ---------- */

  prevBtn.addEventListener("click", function () {
    if (prevBtn.disabled) return;
    var m = month - 1;
    var y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    goMonth(y, m);
  });
  nextBtn.addEventListener("click", function () {
    if (nextBtn.disabled) return;
    var m = month + 1;
    var y = year;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    goMonth(y, m);
  });
  siteSelect.addEventListener("change", function () {
    chooseSite(siteSelect.value);
  });
  earlyBox.addEventListener("change", updateQuote);

  // 切換中英文時，重新畫一次動態內容
  new MutationObserver(function () {
    if (P) updateAll();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

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

      function showError(zh, en) {
        resultEl.style.color = "#f29a9a";
        resultEl.textContent = isEnglish() ? en : zh;
      }

      if (!P) {
        showError("預約功能尚未載入完成，請稍候或重新整理頁面", "The booking tool hasn't finished loading. Please wait or refresh.");
        return;
      }
      if (!checkIn || !checkOut) {
        showError("請先在上方日曆點選入住日與退房日", "Please select check-in and check-out dates first.");
        return;
      }
      if (!siteId) {
        showError("請先選擇營位（點地圖上的編號或從清單選擇）", "Please choose a campsite (tap the map or use the list).");
        return;
      }
      var peopleN = parseInt(peopleInput.value, 10);
      if (!(peopleN >= 1) || peopleN > 60) {
        showError("請填入住人數（1～60 人）", "Please enter the number of guests (1–60).");
        peopleInput.focus();
        return;
      }
      if (quoteBox.dataset.blocked) {
        showError("所選營位在這些日期已被預訂，請改選其他營位或日期", "That campsite is booked for these dates. Please choose another site or dates.");
        return;
      }

      if (!gateOpen) {
        showError("線上預約尚未開放（" + gateTimeLabel() + " 開放）", "Online booking isn't open yet (opens " + gateTimeLabel() + ").");
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
          siteId: siteId,
          checkIn: checkIn,
          checkOut: checkOut,
          earlyArrival: earlyBox.checked && !earlyBox.disabled,
          people: peopleInput.value,
          paymentMethod: paymentMethod
        })
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) {
              var err = new Error(data.error || (isEnglish() ? "Submission failed" : "送出失敗"));
              err.status = res.status;
              throw err;
            }
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
              ? "Thank you for your booking! (Order " + data.bookingId.slice(0, 8) + ") Please transfer payment as shown below, then send us the last 5 digits of your account. Once we've checked the payment, we'll email you to confirm your booking."
              : "感謝您的預約！（訂單編號 " + data.bookingId.slice(0, 8) + "）請依下方匯款須知完成付款，並回報匯款帳號末五碼。我們查帳以後，會主動寄 email 通知您預約成功。";
            showHoldPanel(data);
            form.reset();
            checkIn = null;
            checkOut = null;
            chooseSite(null);
            loadMonthData(year, month).then(updateAll);
          }
        })
        .catch(function (err) {
          resultEl.style.color = "#f29a9a";
          resultEl.textContent = isEnglish()
            ? "Submission failed: " + err.message + " (you can also reach us by phone)"
            : "送出失敗：" + err.message + "（也可以直接電話聯絡我們）";
          if (err.status === 409) {
            // 營位剛好被別人訂走：重新抓空位，畫面上就會變灰
            loadMonthData(year, month).then(updateAll);
          }
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.innerHTML = submitBtnOriginalHTML;
          applyGate();
        });
    });
  }

  /* ---------- 匯款保留時間與回報末五碼 ---------- */
  var holdTimer = null;
  function showHoldPanel(data) {
    if (!data || !data.holdExpiresAt) return;
    var old = document.getElementById("holdPanel");
    if (old) old.remove();
    if (holdTimer) clearInterval(holdTimer);

    var expires = new Date(data.holdExpiresAt).getTime();
    // 記住這筆訂單：即使客人重新整理或離開再回來，仍可回報末五碼，也可到「查詢訂單」頁查
    try {
      localStorage.setItem("tsf_pending_hold", JSON.stringify({ bookingId: data.bookingId, holdExpiresAt: data.holdExpiresAt }));
      localStorage.setItem("tsf_last_order", String(data.bookingId).slice(0, 8));
    } catch (e) { /* 無痕模式等情況，忽略 */ }
    var panel = document.createElement("div");
    panel.id = "holdPanel";
    panel.className = "notice";
    panel.style.cssText = "margin-top:14px;";
    var info = document.createElement("p");
    info.style.cssText = "font-weight:600;margin:0 0 10px;";
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;";
    var input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.maxLength = 5;
    input.pattern = "[0-9]*";
    input.placeholder = t("匯款帳號末五碼", "Last 5 digits of your account");
    input.style.cssText = "max-width:200px;";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary";
    btn.textContent = t("我已匯款，回報末五碼", "I've paid — send last 5 digits");
    var msg = document.createElement("p");
    msg.style.cssText = "margin:10px 0 0;";
    row.appendChild(input);
    row.appendChild(btn);
    var codeNote = document.createElement("p");
    codeNote.style.cssText = "margin:10px 0 0;font-size:14px;";
    var codeStrong = document.createElement("strong");
    codeStrong.textContent = String(data.bookingId).slice(0, 8);
    var orderLink = document.createElement("a");
    orderLink.href = "order.html?c=" + String(data.bookingId).slice(0, 8);
    orderLink.textContent = t("查詢訂單", "Check your booking");
    codeNote.appendChild(document.createTextNode(t("您的訂單編號：", "Your order number: ")));
    codeNote.appendChild(codeStrong);
    codeNote.appendChild(document.createTextNode(t("（請截圖或記下來）。之後可到「", " (please screenshot or write it down). You can check your booking anytime on the “")));
    codeNote.appendChild(orderLink);
    codeNote.appendChild(document.createTextNode(t("」頁，輸入訂單編號和電話，查看有沒有訂位成功、付款成功。", "” page with your order number and phone.")));
    panel.appendChild(info);
    panel.appendChild(row);
    panel.appendChild(msg);
    panel.appendChild(codeNote);
    resultEl.insertAdjacentElement("afterend", panel);
    try { panel.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) { /* ignore */ }

    function clock(ms) {
      return new Date(ms).toLocaleTimeString(isEnglish() ? "en-US" : "zh-TW", {
        timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false
      });
    }
    function tick() {
      var leftMin = Math.max(0, Math.ceil((expires - Date.now()) / 60000));
      var left = leftMin > 90 ? Math.round(leftMin / 60) : leftMin;
      var leftUnitZh = leftMin > 90 ? " 小時" : " 分鐘";
      var leftUnitEn = leftMin > 90 ? " h" : " min";
      if (expires <= Date.now()) {
        clearInterval(holdTimer);
        try { localStorage.removeItem("tsf_pending_hold"); } catch (e) { /* ignore */ }
        info.textContent = t(
          "保留時間已到，營位已釋出。如果您已經匯款，請直接電話聯絡我們；也可以重新預約。",
          "The hold has expired and the site was released. If you've already paid, please call us — or book again."
        );
        row.style.display = "none";
        loadMonthData(year, month).then(updateAll);
        return;
      }
      info.textContent = t(
        "已為您保留營位，請在 " + clock(expires) + " 前（還剩約 " + left + leftUnitZh + "）完成匯款，並在下方回報匯款帳號末五碼。逾時系統會自動釋出營位給下一位。我們查帳以後，會主動寄 email 通知您預約成功。",
        "Your site is held. Please pay before " + clock(expires) + " (about " + left + leftUnitEn + " left) and send the last 5 digits of your transfer account below. Otherwise it will be released automatically. After we check the payment, we'll email you to confirm your booking."
      );
    }
    tick();
    holdTimer = setInterval(tick, 20000);

    btn.addEventListener("click", function () {
      var v = input.value.trim();
      if (!/^\d{5}$/.test(v)) {
        msg.style.color = "#f29a9a";
        msg.textContent = t("請填 5 位數字", "Please enter exactly 5 digits.");
        return;
      }
      btn.disabled = true;
      fetch("/api/report-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: data.bookingId, last5: v })
      })
        .then(function (r) {
          return r.json().then(function (d) {
            if (!r.ok) throw new Error(d.error || "failed");
            return d;
          });
        })
        .then(function () {
          clearInterval(holdTimer);
          try { localStorage.removeItem("tsf_pending_hold"); } catch (e) { /* ignore */ }
          row.style.display = "none";
          info.textContent = t(
            "感謝您的預約！已收到您回報的末五碼 " + v + "，營位已為您保留。我們查帳以後，會主動寄 email 通知您預約成功（請留意信箱，也請看一下垃圾信件匣）。",
            "Thank you for your booking! We've received the last 5 digits (" + v + ") and your site is held. Once we've checked the payment, we'll email you to confirm (please also check your spam folder)."
          );
          msg.textContent = "";
        })
        .catch(function (err) {
          btn.disabled = false;
          msg.style.color = "#f29a9a";
          msg.textContent = err.message;
        });
    });
  }

  /* ---------- 啟動 ---------- */

  // 重新整理或離開再回來：如果還有一筆保留中、尚未回報的訂單，把「回報末五碼」面板放回來
  setTimeout(function () {
    try {
      var raw = localStorage.getItem("tsf_pending_hold");
      if (!raw || document.getElementById("holdPanel")) return;
      var saved = JSON.parse(raw);
      if (saved && saved.bookingId && new Date(saved.holdExpiresAt).getTime() > Date.now()) {
        showHoldPanel(saved);
      } else {
        localStorage.removeItem("tsf_pending_hold");
      }
    } catch (e) { /* ignore */ }
  }, 800);

  Promise.all([
    import("/lib/pricing.js"),
    import("/lib/sitePhotos.js").catch(function () { return { SITE_PHOTOS: {} }; })
  ])
    .then(function (mods) {
      P = mods[0];
      PHOTOS = (mods[1] && mods[1].SITE_PHOTOS) || {};
      buildPins();
      chooseSite(null);
      return loadMonthData(year, month);
    })
    .then(updateAll)
    .catch(function (err) {
      console.error("booking init failed", err);
      if (quoteBox) {
        quoteBox.textContent = t(
          "預約功能載入失敗，請重新整理頁面，或直接電話聯絡我們。",
          "Couldn't load the booking tool. Please refresh, or contact us by phone."
        );
      }
    });
});
