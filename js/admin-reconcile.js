// 後台「對帳輔助」：上傳匯款截圖／明細 → 轉成文字 → 和已回報末五碼的訂單比對 → 抓錯 → 一次對帳完成。
(function () {
  var panel = document.getElementById("reconcilePanel");
  if (!panel) return;
  var fileEl = document.getElementById("rcFiles");
  var ocrBtn = document.getElementById("rcOcr");
  var ocrMsg = document.getElementById("rcOcrMsg");
  var textEl = document.getElementById("rcText");
  var matchBtn = document.getElementById("rcMatch");
  var clearBtn = document.getElementById("rcClear");
  var msgEl = document.getElementById("rcMsg");
  var outEl = document.getElementById("rcOut");
  var lastText = "";

  function el(tag, css, text) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;
    return n;
  }
  function money(n) { return "NT$" + Number(n || 0).toLocaleString(); }

  function post(body) {
    return fetch("/api/admin-reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || "失敗，請稍後再試"); return d; }); });
  }

  /* ---------- 截圖轉文字（在這支手機／電腦上辨識，不會把截圖傳到別的地方） ---------- */
  var tessLoading = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tessLoading) return tessLoading;
    tessLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
      s.onload = function () { resolve(window.Tesseract); };
      s.onerror = function () { tessLoading = null; reject(new Error("文字辨識工具載入失敗，請檢查網路後再試，或改成直接貼上明細文字")); };
      document.head.appendChild(s);
    });
    return tessLoading;
  }

  ocrBtn.addEventListener("click", function () {
    var files = Array.prototype.slice.call(fileEl.files || []);
    if (!files.length) { ocrMsg.textContent = "請先選擇截圖（可以一次選很多張）"; return; }
    ocrBtn.disabled = true;
    ocrMsg.textContent = "載入文字辨識工具…（第一次會比較久）";
    loadTesseract().then(function (T) {
      // 用「一整塊文字、一行一行讀」的模式（PSM 6）：銀行明細是一行一筆交易，預設模式會把一行拆散、漏掉金額
      return T.createWorker("eng").then(function (worker) {
        return worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" }).then(function () {
          var parts = [];
          var chain = Promise.resolve();
          files.forEach(function (f, i) {
            chain = chain.then(function () {
              ocrMsg.textContent = "辨識第 " + (i + 1) + " / " + files.length + " 張…";
              return worker.recognize(f).then(function (r) { parts.push(r.data.text || ""); });
            });
          });
          return chain.then(function () {
            textEl.value = (textEl.value ? textEl.value.replace(/\s+$/, "") + "\n" : "") + parts.join("\n");
            ocrMsg.textContent = "辨識完成。請看一下下面的文字有沒有明顯認錯的數字（可以直接修改），再按「開始比對」。";
          });
        }).then(function () { return worker.terminate(); }, function (e) { worker.terminate(); throw e; });
      });
    }).catch(function (e) { ocrMsg.textContent = e.message; })
      .finally(function () { ocrBtn.disabled = false; });
  });

  clearBtn.addEventListener("click", function () {
    textEl.value = ""; fileEl.value = ""; outEl.innerHTML = ""; msgEl.textContent = ""; ocrMsg.textContent = ""; lastText = "";
  });

  /* ---------- 比對 ---------- */
  var groups = [
    { key: "ok", title: "✅ 完全相符（末五碼和金額都對）", color: "#8fd68f" },
    { key: "amount_mismatch", title: "⚠️ 末五碼找到了，但金額不對", color: "#f2c766" },
    { key: "amount_only", title: "⚠️ 金額對，但找不到這組末五碼（客人可能填錯）", color: "#f2c766" },
    { key: "ambiguous", title: "⚠️ 有多筆可能，要人工看", color: "#f2c766" },
    { key: "not_found", title: "❌ 明細裡沒看到（可能還沒入帳，或截圖沒涵蓋到）", color: "#f29a9a" }
  ];

  function rowBox(r, withCheck) {
    var box = el("div", "border:1px solid rgba(128,128,128,.35);border-radius:8px;padding:8px 10px;margin:6px 0;");
    var head = el("div", "display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;");
    if (withCheck) {
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = true; cb.className = "rc-check"; cb.setAttribute("data-id", r.id);
      cb.style.cssText = "width:20px;height:20px;margin-top:2px;";
      head.appendChild(cb);
    }
    var info = el("div", "flex:1;min-width:200px;line-height:1.6;");
    info.appendChild(el("strong", "", r.name + "　" + r.site + "　" + money(r.total)));
    info.appendChild(el("div", "font-size:13px;opacity:.85;", "訂單編號 " + r.code + "　末五碼 " + r.last5 + "　" + (r.start || "") + " ～ " + (r.end || "") + "　電話 " + (r.phone || "")));
    if (r.note) info.appendChild(el("div", "font-size:14px;margin-top:2px;", r.note));
    if (r.line) info.appendChild(el("pre", "font-size:12px;margin:4px 0 0;white-space:pre-wrap;opacity:.8;background:rgba(128,128,128,.12);padding:4px 6px;border-radius:6px;", "明細：" + r.line));
    head.appendChild(info);
    box.appendChild(head);
    return box;
  }

  function render(d) {
    outEl.innerHTML = "";
    var sum = el("p", "margin:8px 0;font-weight:600;");
    var c = d.counts || {};
    sum.textContent = "目前有 " + d.reportedTotal + " 筆「已回報末五碼、等對帳」的訂單；明細共 " + d.lineCount + " 行。結果：完全相符 " + (c.ok || 0) + " 筆；需要人工看 " + ((c.amount_mismatch || 0) + (c.amount_only || 0) + (c.ambiguous || 0)) + " 筆；明細裡沒看到 " + (c.not_found || 0) + " 筆。";
    outEl.appendChild(sum);

    groups.forEach(function (g) {
      var rows = d.rows.filter(function (r) { return r.status === g.key; });
      if (!rows.length) return;
      var sec = el("div", "margin:12px 0;");
      sec.appendChild(el("h4", "margin:0 0 4px;color:" + g.color + ";", g.title + "（" + rows.length + "）"));
      rows.forEach(function (r) { sec.appendChild(rowBox(r, g.key === "ok")); });
      outEl.appendChild(sec);
      if (g.key === "ok") {
        var bar = el("div", "margin:8px 0;display:flex;gap:10px;flex-wrap:wrap;align-items:center;");
        var btn = document.createElement("button");
        btn.type = "button"; btn.className = "btn btn-primary";
        var count = function () { return outEl.querySelectorAll(".rc-check:checked").length; };
        var label = function () { btn.textContent = "✅ 把打勾的 " + count() + " 筆全部「對帳完成」並寄預約成功信"; };
        label();
        sec.addEventListener("change", label);
        btn.addEventListener("click", function () {
          var ids = Array.prototype.map.call(outEl.querySelectorAll(".rc-check:checked"), function (x) { return x.getAttribute("data-id"); });
          if (!ids.length) { alert("沒有打勾的訂單"); return; }
          var total = rows.filter(function (r) { return ids.indexOf(r.id) >= 0; }).reduce(function (s, r) { return s + r.total; }, 0);
          if (!confirm("確定要把這 " + ids.length + " 筆（合計 " + money(total) + "）標記為「對帳完成」嗎？\n系統會同時寄「預約成功」email 給客人，寄出後無法收回。")) return;
          btn.disabled = true;
          post({ action: "confirm", text: lastText, ids: ids }).then(function (r) {
            var m = "已對帳完成 " + r.done + " 筆";
            if (r.skipped) m += "；有 " + r.skipped + " 筆因為狀態改變而略過";
            m += "。預約成功信：寄出 " + r.emailSent + " 封";
            if (r.noEmail) m += "，" + r.noEmail + " 位沒留 email";
            if (r.emailFail) m += "，" + r.emailFail + " 封寄失敗（請到該筆按「補寄」）";
            alert(m + "。");
            var rb = document.getElementById("refreshBtn"); if (rb) rb.click();
            return post({ action: "match", text: lastText }).then(render);
          }).catch(function (e) { btn.disabled = false; alert(e.message); });
        });
        bar.appendChild(btn);
        sec.appendChild(bar);
      }
    });

    if (d.unmatched && d.unmatched.length) {
      var det = document.createElement("details");
      det.style.cssText = "margin:14px 0;";
      det.appendChild(el("summary", "cursor:pointer;font-weight:600;", "帳上有入帳、但沒有訂單對得到的明細（" + d.unmatched.length + " 行）— 點開看看"));
      d.unmatched.forEach(function (u) {
        var b = el("div", "border:1px dashed rgba(128,128,128,.5);border-radius:8px;padding:6px 10px;margin:6px 0;");
        b.appendChild(el("pre", "font-size:12px;margin:0;white-space:pre-wrap;", u.line));
        if (u.maybe && u.maybe.length) {
          b.appendChild(el("div", "font-size:13px;margin-top:4px;color:#f2c766;", "金額相同、可能是還沒回報末五碼的客人：" + u.maybe.map(function (m) { return m.name + "（" + m.code + "，" + m.site + "）"; }).join("、")));
        }
        det.appendChild(b);
      });
      outEl.appendChild(det);
    }
    outEl.appendChild(el("p", "font-size:13px;opacity:.8;", "提醒：這是輔助工具，只有「完全相符」才能一鍵對帳；其他情況請自己看明細、必要時打電話確認，再到下面的訂單用「對帳完成」按鈕處理。"));
  }

  matchBtn.addEventListener("click", function () {
    var text = textEl.value.trim();
    if (!text) { msgEl.textContent = "請先上傳截圖辨識，或把銀行明細的文字貼在上面的框框"; return; }
    msgEl.textContent = "比對中…";
    matchBtn.disabled = true;
    lastText = text;
    post({ action: "match", text: text }).then(function (d) { msgEl.textContent = ""; render(d); })
      .catch(function (e) { msgEl.textContent = e.message; })
      .finally(function () { matchBtn.disabled = false; });
  });
})();
