/* 後台「團客包場／封鎖營位」：選日期＋區域，一鍵把那幾晚的營位全部佔住（預約頁會顯示額滿）。
   後端：POST /api/admin-bookings { action: "block-create" | "block-remove" }，列表：GET /api/admin-bookings?blocks=1 */
(function () {
  var box = document.getElementById("blockBox");
  if (!box) return;
  var nameEl = document.getElementById("blkName");
  var inEl = document.getElementById("blkIn");
  var outEl = document.getElementById("blkOut");
  var noteEl = document.getElementById("blkNote");
  var msgEl = document.getElementById("blkMsg");
  var listEl = document.getElementById("blkList");
  var btn = document.getElementById("blkCreate");
  var ZONE_COUNT = { A: 10, B: 5, C: 9, D: 11 };
  var ZONE_IDS = {
    A: ["A1","A2","A3","A4","A5","A6","A7","A8","A9","A10"],
    B: ["B1","B2","B3","B4","B5"],
    C: ["C1","C2","C3","C4","C5","C6","C7","C8","C9"],
    D: ["D1","D2","D3","D4","D5","D6","D7","D8","D9","D10","D11"]
  };

  function say(text, ok) { msgEl.textContent = text || ""; msgEl.style.color = ok ? "#7fd18b" : "#f29a9a"; }
  function md(s) { return Number(s.slice(5, 7)) + "/" + Number(s.slice(8, 10)); }
  function selectedZones() {
    return Array.prototype.slice.call(box.querySelectorAll(".blkZone")).filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
  }
  function api(method, url, body) {
    return fetch(url, { method: method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || "操作失敗"); return d; }); });
  }
  function refreshVacancy() { var b = document.getElementById("vacRefresh"); if (b) b.click(); }

  function loadList() {
    listEl.innerHTML = '<p style="opacity:.8;">載入中…</p>';
    return api("GET", "/api/admin-bookings?blocks=1").then(function (d) {
      var blocks = d.blocks || [];
      listEl.innerHTML = "";
      if (!blocks.length) { listEl.innerHTML = '<p style="opacity:.8;">目前沒有包場。</p>'; return; }
      blocks.forEach(function (b) {
        var row = document.createElement("div");
        row.style.cssText = "display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid rgba(128,128,128,.25);";
        var t = document.createElement("span");
        t.style.cssText = "flex:1;min-width:220px;";
        t.textContent = "包場「" + b.name + "」　" + md(b.check_in) + " 入住 → " + md(b.check_out) + " 退房　共 " + b.sites.length + " 個營位";
        var x = document.createElement("button");
        x.type = "button"; x.className = "btn btn-outline"; x.textContent = "解除包場";
        x.addEventListener("click", function () {
          if (!window.confirm("確定要解除「" + b.name + "」（" + md(b.check_in) + "～" + md(b.check_out) + "）的包場嗎？\n解除後，這些營位會重新開放給客人預約。")) return;
          x.disabled = true;
          api("POST", "/api/admin-bookings", { action: "block-remove", group_id: b.group_id || null })
            .then(function () { say("已解除包場。", true); return loadList(); })
            .then(refreshVacancy)
            .catch(function (e) { x.disabled = false; say(e.message, false); });
        });
        row.appendChild(t); row.appendChild(x); listEl.appendChild(row);
      });
    }).catch(function (e) { listEl.innerHTML = ""; say(e.message, false); });
  }

  btn.addEventListener("click", function () {
    say("");
    var zones = selectedZones();
    var sites = [];
    zones.forEach(function (z) { sites = sites.concat(ZONE_IDS[z]); });
    var name = nameEl.value.trim();
    if (!name) return say("請填包場名稱", false);
    if (!inEl.value || !outEl.value) return say("請選入住日與退房日", false);
    if (outEl.value <= inEl.value) return say("退房日要比入住日晚", false);
    if (!sites.length) return say("請至少選一個區域", false);
    var nights = Math.round((new Date(outEl.value + "T00:00:00Z") - new Date(inEl.value + "T00:00:00Z")) / 86400000);
    if (!window.confirm("確定要幫「" + name + "」包場嗎？\n" + md(inEl.value) + " 入住 → " + md(outEl.value) + " 退房（共 " + nights + " 晚）\n鎖住 " + sites.length + " 個營位（" + zones.join("、") + " 區），客人那幾天就訂不到。")) return;
    btn.disabled = true;
    api("POST", "/api/admin-bookings", { action: "block-create", name: name, checkIn: inEl.value, checkOut: outEl.value, sites: sites, note: noteEl.value.trim() })
      .then(function (d) {
        say("包場建立好了：鎖住 " + d.sites + " 個營位、" + d.nights + " 晚。預約頁會顯示額滿。", true);
        nameEl.value = ""; noteEl.value = "";
        return loadList();
      })
      .then(refreshVacancy)
      .catch(function (e) { say(e.message, false); })
      .then(function () { btn.disabled = false; });
  });

  box.addEventListener("toggle", function () { if (box.open) loadList(); });
})();
