/* 後台「每日空位表」：左邊 35 個營位（A 琥珀／B 藍／C 綠／D 紫），上面是日期，
   格子有顏色＝那一晚被訂走（綠＝已對帳、黃＝客人已回報待對帳、橘＝待匯款保留中），空白＝空位。
   點日期看「那天哪些營位是空的」，點格子看是誰訂的。資料來自 /api/admin-vacancy（和預約日曆同一份資料）。 */
(function () {
  var box = document.getElementById("vacancyBox");
  if (!box) return;
  var gridEl = document.getElementById("vacGrid");
  var infoEl = document.getElementById("vacInfo");
  var fromEl = document.getElementById("vacFrom");
  var daysEl = document.getElementById("vacDays");
  var errEl = document.getElementById("vacErr");
  var ZONE = { A: "#e8a33d", B: "#4aa3df", C: "#5cb85c", D: "#b073d9" };
  var STATE = {
    confirmed: { bg: "#2e8b57", label: "已對帳" },
    reported: { bg: "#d9b13b", label: "待對帳（客人已回報末五碼）" },
    pending: { bg: "#e07b39", label: "待匯款（保留中，24 小時內沒匯款會釋出）" }
  };
  var OPEN_FROM = "2026-11-15"; // 開放預約的第一天
  var DOW = ["日", "一", "二", "三", "四", "五", "六"];
  var data = null;

  function iso(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { var d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function dow(s) { return new Date(s + "T00:00:00Z").getUTCDay(); }
  function md(s) { return Number(s.slice(5, 7)) + "/" + Number(s.slice(8, 10)); }
  function el(tag, css, text) { var n = document.createElement(tag); if (css) n.style.cssText = css; if (text != null) n.textContent = text; return n; }
  function todayTW() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }); }

  function load() {
    errEl.textContent = "";
    var from = fromEl.value || (todayTW() < OPEN_FROM ? OPEN_FROM : todayTW());
    fromEl.value = from;
    gridEl.innerHTML = '<p style="opacity:.8;">載入中…</p>';
    return fetch("/api/admin-vacancy?from=" + encodeURIComponent(from) + "&days=" + encodeURIComponent(daysEl.value), { cache: "no-store" })
      .then(function (r) {
        if (r.status === 401) { gridEl.innerHTML = ""; return null; }
        return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "載入失敗"); return d; });
      })
      .then(function (d) { if (d) { data = d; render(); } })
      .catch(function (e) { gridEl.innerHTML = ""; errEl.textContent = e.message; });
  }

  function dates() {
    var out = [];
    for (var i = 0; i < data.days; i++) out.push(addDays(data.from, i));
    return out;
  }
  function emptySites(date) {
    return data.sites.filter(function (s) { return !(data.cells[s.id] && data.cells[s.id][date]); });
  }
  function pill(id, zone) {
    var p = el("span", "display:inline-block;min-width:40px;text-align:center;color:#fff;font-weight:800;font-size:15px;padding:2px 8px;border-radius:999px;text-shadow:0 1px 1px rgba(0,0,0,.35);background:" + (ZONE[zone] || "#888") + ";", id);
    return p;
  }

  function showCell(site, date) {
    infoEl.innerHTML = "";
    var c = data.cells[site.id] && data.cells[site.id][date];
    var head = el("div", "font-size:17px;font-weight:700;margin-bottom:4px;");
    head.appendChild(pill(site.id, site.zone));
    head.appendChild(document.createTextNode("　" + md(date) + "（" + DOW[dow(date)] + "）"));
    infoEl.appendChild(head);
    if (!c) { infoEl.appendChild(el("div", "", "這一晚是空位，可以接受預約。")); return; }
    infoEl.appendChild(el("div", "", c.n + "　" + c.p + (c.e ? "　（夜衝）" : "")));
    infoEl.appendChild(el("div", "font-size:14px;opacity:.9;", "訂單編號 " + c.c + (c.g ? "（整筆購物車訂單 " + c.g + "）" : "") + "　" + c.i + " ～ " + c.o + "　NT$" + Number(c.a || 0).toLocaleString()));
    infoEl.appendChild(el("div", "font-weight:700;margin-top:2px;color:" + STATE[c.s].bg + ";", STATE[c.s].label));
  }

  function showDate(date) {
    infoEl.innerHTML = "";
    var free = emptySites(date);
    infoEl.appendChild(el("div", "font-size:17px;font-weight:700;margin-bottom:6px;", md(date) + "（" + DOW[dow(date)] + "）　空位 " + free.length + " / " + data.sites.length + " 個"));
    if (!free.length) { infoEl.appendChild(el("div", "", "這一晚已經客滿。")); return; }
    var wrap = el("div", "display:flex;flex-wrap:wrap;gap:6px;");
    free.forEach(function (s) { wrap.appendChild(pill(s.id, s.zone)); });
    infoEl.appendChild(wrap);
  }

  function render() {
    var ds = dates();
    var tbl = el("table", "border-collapse:separate;border-spacing:0;font-size:13px;");
    var thead = document.createElement("thead");
    var tr = document.createElement("tr");
    var corner = el("th", "position:sticky;left:0;z-index:3;background:#274a33;min-width:64px;padding:4px 6px;text-align:left;", "營位");
    tr.appendChild(corner);
    ds.forEach(function (d) {
      var w = dow(d), weekend = w === 5 || w === 6;
      var th = el("th", "min-width:46px;padding:3px 2px;text-align:center;cursor:pointer;line-height:1.3;" + (weekend ? "background:rgba(232,194,106,.25);" : "") + (d < OPEN_FROM ? "opacity:.45;" : "") + (d === data.today ? "outline:2px solid #fff;outline-offset:-2px;" : ""));
      th.innerHTML = md(d) + "<br><span style=\"font-weight:400;opacity:.85;\">" + DOW[w] + "</span>";
      th.title = "點一下看這天哪些營位是空的";
      th.addEventListener("click", function () { showDate(d); });
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    // 每天空位數
    var cnt = document.createElement("tr");
    cnt.appendChild(el("td", "position:sticky;left:0;z-index:2;background:#274a33;padding:3px 6px;font-weight:700;", "空位數"));
    ds.forEach(function (d) {
      var n = d < OPEN_FROM ? null : emptySites(d).length;
      var td = el("td", "text-align:center;font-weight:800;padding:3px 0;cursor:pointer;" + (n === 0 ? "color:#f29a9a;" : n != null && n <= 5 ? "color:#f2c766;" : "color:#9be59b;"), n == null ? "—" : String(n));
      td.addEventListener("click", function () { showDate(d); });
      cnt.appendChild(td);
    });
    thead.appendChild(cnt);
    tbl.appendChild(thead);

    var tb = document.createElement("tbody");
    var lastZone = null;
    data.sites.forEach(function (s) {
      var r = document.createElement("tr");
      var first = el("td", "position:sticky;left:0;z-index:2;background:#274a33;padding:2px 6px;border-top:" + (s.zone !== lastZone ? "3px solid " + (ZONE[s.zone] || "#888") : "1px solid rgba(255,255,255,.08)") + ";");
      first.appendChild(pill(s.id, s.zone));
      r.appendChild(first);
      ds.forEach(function (d) {
        var c = data.cells[s.id] && data.cells[s.id][d];
        var w = dow(d), weekend = w === 5 || w === 6;
        var css = "height:30px;min-width:46px;text-align:center;cursor:pointer;border-left:1px solid rgba(255,255,255,.08);overflow:hidden;white-space:nowrap;font-size:12px;" +
          "border-top:" + (s.zone !== lastZone ? "3px solid " + (ZONE[s.zone] || "#888") : "1px solid rgba(255,255,255,.08)") + ";";
        if (c) css += "background:" + STATE[c.s].bg + ";color:#fff;font-weight:700;";
        else if (d < OPEN_FROM) css += "background:rgba(0,0,0,.22);";
        else if (weekend) css += "background:rgba(232,194,106,.10);";
        var td = el("td", css, c ? (c.e ? "夜衝" : String(c.n || "").slice(0, 3)) : "");
        td.addEventListener("click", function () { showCell(s, d); });
        r.appendChild(td);
      });
      lastZone = s.zone;
      tb.appendChild(r);
    });
    tbl.appendChild(tb);
    gridEl.innerHTML = "";
    gridEl.appendChild(tbl);
    if (!infoEl.firstChild) infoEl.textContent = "點上面的「日期」可以看那天有哪些空位，點格子可以看是誰訂的。";
  }

  function shift(n) { fromEl.value = addDays(fromEl.value || todayTW(), n); load(); }
  document.getElementById("vacPrev").addEventListener("click", function () { shift(-7); });
  document.getElementById("vacNext").addEventListener("click", function () { shift(7); });
  document.getElementById("vacToday").addEventListener("click", function () { fromEl.value = todayTW() < OPEN_FROM ? OPEN_FROM : todayTW(); load(); });
  fromEl.addEventListener("change", load);
  daysEl.addEventListener("change", load);
  document.getElementById("vacRefresh").addEventListener("click", load);
  // 🔎 查某段日期（入住～退房）哪些營位「每一晚都空」。住 N 晚 = 入住日起算 N 個晚上，退房日那晚不算。
  function queryRange() {
    var inEl = document.getElementById("vacQIn"), outEl = document.getElementById("vacQOut");
    var cin = inEl.value, cout = outEl.value;
    errEl.textContent = "";
    if (!cin || !cout) { errEl.textContent = "請先選入住日和退房日"; return; }
    var n = Math.round((new Date(cout + "T00:00:00Z") - new Date(cin + "T00:00:00Z")) / 86400000);
    if (!(n >= 1)) { errEl.textContent = "退房日要比入住日晚至少一天"; return; }
    if (n > 60) { errEl.textContent = "一次最多查 60 晚"; return; }
    infoEl.textContent = "查詢中…";
    fetch("/api/admin-vacancy?from=" + encodeURIComponent(cin) + "&days=" + n, { cache: "no-store" })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "查詢失敗"); return d; }); })
      .then(function (d) {
        var nights = [];
        for (var i = 0; i < n; i++) nights.push(addDays(cin, i));
        var free = d.sites.filter(function (s) {
          return nights.every(function (nt) { return !(d.cells[s.id] && d.cells[s.id][nt]); });
        });
        infoEl.innerHTML = "";
        infoEl.appendChild(el("div", "font-size:17px;font-weight:700;margin-bottom:6px;", md(cin) + "（" + DOW[dow(cin)] + "）入住 ～ " + md(cout) + "（" + DOW[dow(cout)] + "）退房，共 " + n + " 晚　整段都空的營位：" + free.length + " / " + d.sites.length + " 個"));
        if (!free.length) { infoEl.appendChild(el("div", "", "這段期間沒有任何營位是整段都空的（可能每個營位都至少有一晚被訂走）。")); return; }
        var zones = {};
        free.forEach(function (s) { (zones[s.zone] = zones[s.zone] || []).push(s); });
        Object.keys(zones).sort().forEach(function (z) {
          var line = el("div", "display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:3px 0;");
          line.appendChild(el("span", "font-weight:700;min-width:48px;", z + " 區 " + zones[z].length));
          zones[z].forEach(function (s) { line.appendChild(pill(s.id, s.zone)); });
          infoEl.appendChild(line);
        });
      })
      .catch(function (e) { infoEl.textContent = ""; errEl.textContent = e.message; });
  }
  document.getElementById("vacQGo").addEventListener("click", queryRange);
  document.getElementById("vacQOut").addEventListener("change", function () { if (document.getElementById("vacQIn").value) queryRange(); });

  // 🖨 列印「營位預約總表」：每一個營位、每一天是誰訂的，客人到了第一線人員查表就能帶位。
  // 用目前畫面載入的日期範圍（從哪天開始、顯示幾天）；每 14 天一頁（A4 橫式）。
  function escH(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function printChart() {
    if (!data) { errEl.textContent = "請先等空位表載入完成"; return; }
    var ds = dates(), PER = 14, pages = [];
    for (var i = 0; i < ds.length; i += PER) pages.push(ds.slice(i, i + PER));
    var STY = { confirmed: "background:#cfe8d5;", reported: "background:#f7e7a6;", pending: "background:#f6cfae;" };
    var html = pages.map(function (pg) {
      var head = "<tr><th class=s>營位</th>" + pg.map(function (d) {
        var w = dow(d);
        return "<th" + (w === 5 || w === 6 ? " class=we" : "") + ">" + md(d) + "<br>" + DOW[w] + "</th>";
      }).join("") + "</tr>";
      var lastZone = null;
      var body = data.sites.map(function (s) {
        var top = s.zone !== lastZone ? " class=zt" : "";
        lastZone = s.zone;
        return "<tr" + top + "><td class=s>" + escH(s.id) + "</td>" + pg.map(function (d) {
          var c = data.cells[s.id] && data.cells[s.id][d];
          if (!c) return "<td class=" + ((dow(d) === 5 || dow(d) === 6) ? "we" : "e") + "></td>";
          return "<td style=\"" + STY[c.s] + "\">" + (c.e ? "<b>夜衝</b><br>" : "") + escH(c.n) + (c.s === "pending" ? "<br><i>未匯款</i>" : "") + "</td>";
        }).join("") + "</tr>";
      }).join("");
      return "<div class=pg><h2>營位預約總表　" + md(pg[0]) + " ～ " + md(pg[pg.length - 1]) + "</h2><table><thead>" + head + "</thead><tbody>" + body + "</tbody></table></div>";
    }).join("");
    var doc = "<!doctype html><html lang=\"zh-Hant\"><head><meta charset=\"utf-8\"><title>水松千樹之森_營位預約總表_" + md(ds[0]) + "</title><style>" +
      "@page{size:A4 landscape;margin:8mm}body{font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#111;margin:12px;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
      "h2{font-size:15px;margin:0 0 6px}.bar{margin-bottom:10px}.bar button{font-size:15px;padding:8px 18px;cursor:pointer}" +
      "table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #888;padding:2px 3px;text-align:center;vertical-align:middle;height:22px;overflow:hidden;word-break:break-all;line-height:1.2}" +
      "th{background:#eee}th.s,td.s{width:46px;font-weight:700;background:#eee}th.we,td.we{background:#fff6dc}tr.zt td,tr.zt th{border-top:3px solid #333}i{font-style:normal;color:#a33;font-size:10px}" +
      ".pg{page-break-after:always}.pg:last-child{page-break-after:auto}.note{margin:6px 0 0;color:#444;font-size:11px}@media print{.bar{display:none}body{margin:0}}" +
      "</style></head><body><div class=\"bar\"><button onclick=\"window.print()\">🖨 列印</button> <span>（也可選「另存為 PDF」）</span></div>" + html +
      "<p class=note>綠＝已對帳　黃＝客人已回報匯款、待對帳　橘＝尚未匯款（保留中）　空白＝空位　淺黃欄＝週五、週六　列印日期：" + todayTW() + "</p></body></html>";
    var w = window.open("", "_blank");
    if (!w) { errEl.textContent = "瀏覽器擋住了新視窗，請允許彈出視窗後再按一次"; return; }
    w.document.open(); w.document.write(doc); w.document.close();
  }
  document.getElementById("vacPrint").addEventListener("click", printChart);

  window.tsfLoadVacancy = load;
})();
