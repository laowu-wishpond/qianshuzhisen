document.addEventListener("DOMContentLoaded", function () {
  var loginSection = document.getElementById("loginSection");
  var dashboardSection = document.getElementById("dashboardSection");
  var messagesSection = document.getElementById("messagesSection");
  var loginForm = document.getElementById("loginForm");
  var loginError = document.getElementById("loginError");
  var logoutBtn = document.getElementById("logoutBtn");
  var refreshBtn = document.getElementById("refreshBtn");
  var bookingsBody = document.getElementById("bookingsBody");
  var dashError = document.getElementById("dashError");
  var filterFrom = document.getElementById("filterFrom");
  var filterTo = document.getElementById("filterTo");
  var filterStatus = document.getElementById("filterStatus");
  var sortBy = document.getElementById("sortBy");
  var last4Input = document.getElementById("last4Input");
  var last4Btn = document.getElementById("last4Btn");
  var last4Clear = document.getElementById("last4Clear");
  var last4Msg = document.getElementById("last4Msg");
  var activeLast4 = "";
  var activeQ = "";
  var qInput = document.getElementById("qInput");
  var qBtn = document.getElementById("qBtn");
  var qClear = document.getElementById("qClear");
  var qMsg = document.getElementById("qMsg");
  var messagesBody = document.getElementById("messagesBody");
  var messagesError = document.getElementById("messagesError");
  var roleBadge = document.getElementById("roleBadge");
  var paidSummary = document.getElementById("paidSummary");
  var currentRole = "admin"; // 由後端回傳；viewer = 唯讀

  function setRole(role) {
    currentRole = role === "viewer" ? "viewer" : "admin";
    roleBadge.hidden = currentRole !== "viewer";
  }

  var statusLabels = {
    pending: "待確認",
    paid: "已付款",
    failed: "刷卡失敗",
    cancelled: "已取消",
  };

  function showDashboard() {
    loginSection.hidden = true;
    dashboardSection.hidden = false;
    messagesSection.hidden = false;
    logoutBtn.hidden = false;
  }

  function showLogin() {
    loginSection.hidden = false;
    dashboardSection.hidden = true;
    messagesSection.hidden = true;
    logoutBtn.hidden = true;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  function makeActionBtn(label, onClick) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "admin-mini-btn";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function updateStatus(id, status) {
    fetch("/api/admin-bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, payment_status: status }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("更新失敗");
        return res.json().catch(function () { return {}; });
      })
      .then(function (r) {
        if (r && status === "paid") {
          var msgs = {
            sent: "已寄出「預約成功」email 給客人。",
            no_email: "這位客人沒有留 email，沒有寄信，請改用電話或簡訊通知。",
            not_configured: "尚未設定寄信功能（Vercel 缺 RESEND_API_KEY / EMAIL_FROM），這次沒有寄信。",
            send_failed: "寄信失敗，請稍後再按一次「對帳完成」重寄，或用電話通知客人。"
          };
          if (r.email && msgs[r.email]) alert("已標記對帳完成。" + msgs[r.email]);
        }
        return loadBookings();
      })
      .catch(function () {
        alert("更新失敗，請重新整理再試一次");
      });
  }

  // 保留單的補充說明：已回報匯款（末五碼）／保留到幾點／逾時自動釋出
  function holdNote(b) {
    function hhmm(iso) {
      return new Date(iso).toLocaleString("zh-TW", {
        timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
      });
    }
    var note = "";
    var altMsg = b.active_alt
      ? '<div style="font-size:13px;color:#ffb86b;font-weight:700;margin-top:4px;">⚠ 這位客人另有有效訂單：' + escapeHtml(b.active_alt) + "。對帳請看那一筆</div>"
      : "";
    var viaMsg = b.via_message
      ? '<div style="font-size:12px;color:#f2c766;margin-top:4px;">📩 客人在「留言」裡提到這個末碼：「' + escapeHtml(b.via_message) + '…」請核對金額與姓名</div>'
      : "";
    if (b.payment_status === "pending" && b.transfer_last5) {
      note = "客人已回報匯款，末五碼 " + b.transfer_last5 + "（請核對後標記已付款）";
    } else if (b.payment_status === "pending" && b.hold_expires_at) {
      note = new Date(b.hold_expires_at) > new Date()
        ? "保留到 " + hhmm(b.hold_expires_at) + "，尚未回報匯款"
        : "保留時間已過，等待系統釋出";
    } else if (b.payment_status === "cancelled" && b.cancel_reason === "expired") {
      note = "逾時未匯款，系統自動釋出";
    } else if (b.payment_status === "paid" && b.payment_verified === false) {
      note = "客人回報末五碼 " + (b.transfer_last5 || "") + "，系統已自動標記已付款。請對帳；對帳完成才會寄預約成功 email。";
    } else if (b.payment_status === "paid" && b.payment_verified !== false) {
      var mail = b.confirmation_email_sent_at
        ? "預約成功信已寄出（" + hhmm(b.confirmation_email_sent_at) + "）"
        : (b.customer_email ? "預約成功信尚未寄出（可按右邊「補寄預約成功信」）" : "沒有留 Email，請用電話／LINE 通知");
      return viaMsg + '<div style="font-size:13px;margin-top:6px;color:#9be59b;font-weight:700;">✓ 已對帳完成，不用再按</div>' +
        '<div style="font-size:12px;opacity:.9;margin-top:2px;">' + escapeHtml((b.transfer_last5 ? "末五碼 " + b.transfer_last5 + "　" : "") + mail) + "</div>";
    }
    return altMsg + viaMsg + (note ? '<div style="font-size:12px;opacity:.85;margin-top:4px;">' + escapeHtml(note) + "</div>" : "");
  }

  // 營位編號排序用：A2 → ["A", 2]；沒有營位的（舊訂單）排最後
  function siteKey(id) {
    var m = String(id || "").trim().toUpperCase().match(/^([A-Z]*)\s*0*(\d+)/);
    return m ? [m[1] || "~", parseInt(m[2], 10)] : ["~~", 0];
  }

  function sortBookings(list) {
    var mode = sortBy ? sortBy.value : "created_asc";
    var arr = list.slice();
    arr.sort(function (a, b) {
      if (mode === "site_asc") {
        var pa = siteKey(a.site_id), pb = siteKey(b.site_id);
        if (pa[0] !== pb[0]) return pa[0] < pb[0] ? -1 : 1;
        if (pa[1] !== pb[1]) return pa[1] - pb[1];
        var ca = a.check_in || a.booking_date || "", cb = b.check_in || b.booking_date || "";
        if (ca !== cb) return ca < cb ? -1 : 1;
        return a.created_at < b.created_at ? -1 : 1;
      }
      if (mode === "checkin_asc") {
        var da = a.check_in || a.booking_date || "", db = b.check_in || b.booking_date || "";
        return da < db ? -1 : da > db ? 1 : (a.created_at < b.created_at ? -1 : 1);
      }
      var ta = new Date(a.created_at).getTime(), tb = new Date(b.created_at).getTime();
      return mode === "created_desc" ? tb - ta : ta - tb;
    });
    return arr;
  }

  var shownBookings = [];
  var trashBar = document.getElementById("trashBar");
  var trashBtn = document.getElementById("trashBtn");
  var restoreBtn = document.getElementById("restoreBtn");
  var trashMsg = document.getElementById("trashMsg");
  var TRASH_HINT = "先在姓名前面的方格打勾，再按按鈕。垃圾桶只是收起來，不會真的刪除資料。";

  function checkedBookingIds() {
    return shownBookings.filter(function (x) { return x.handled; }).map(function (x) { return x.id; });
  }
  function updateTrashUi() {
    var inTrash = filterStatus.value === "trashed";
    if (trashBar) trashBar.style.display = currentRole === "admin" ? "" : "none";
    if (noticeBar) noticeBar.style.display = currentRole === "admin" ? "" : "none";
    var nSel = checkedBookingIds().length;
    if (noticeBtn) noticeBtn.textContent = "📧 ① 寄「已收到您的預約」給打勾的客人（" + nSel + "）";
    if (confirmBtn) confirmBtn.textContent = "📧 ② 寄「預約成功」給打勾的客人（" + nSel + "）";
    if (trashBtn) { trashBtn.style.display = inTrash ? "none" : ""; trashBtn.textContent = "🗑 把打勾的移到垃圾桶（" + checkedBookingIds().length + "）"; }
    if (restoreBtn) { restoreBtn.style.display = inTrash ? "" : "none"; restoreBtn.textContent = "↩ 把打勾的從垃圾桶還原（" + checkedBookingIds().length + "）"; }
  }
  function bulkTrash(trash) {
    var ids = checkedBookingIds();
    if (!ids.length) { alert("請先在姓名前面的方格打勾。"); return; }
    var q = trash
      ? "確定把 " + ids.length + " 筆打勾的訂單移到垃圾桶？\n\n沒付款、待對帳的會同時取消並釋出營位；已對帳完成的不會被移走。\n垃圾桶裡的資料不會真的刪除，之後可以還原。"
      : "確定把 " + ids.length + " 筆從垃圾桶還原？\n\n還原後狀態會是「已取消」，要恢復請再按「對帳完成」。";
    if (!confirm(q)) return;
    fetch("/api/admin-bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids, trash: trash }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("fail");
        return res.json();
      })
      .then(function (r) {
        var msg = (trash ? "已移到垃圾桶 " : "已還原 ") + r.moved + " 筆。";
        if (r.skipped) msg += "另有 " + r.skipped + " 筆已對帳完成，沒有移走（請到該筆按「取消訂單」）。";
        if (trashMsg) trashMsg.textContent = msg;
        return loadBookings();
      })
      .catch(function () { alert("操作失敗，請重新整理再試一次"); });
  }
  var noticeBar = document.getElementById("noticeBar");
  var noticeBtn = document.getElementById("noticeBtn");
  var noticeMsg = document.getElementById("noticeMsg");
  var confirmBtn = document.getElementById("confirmBtn");
  function runNotice(kind, btn) {
    var ids = checkedBookingIds();
    var label = kind === "received" ? "「已收到您的預約」" : "「預約成功」";
    if (!ids.length) { alert("請先在姓名前面的方格，勾選要寄信的客人，再按寄出。"); return; }
    btn.disabled = true;
    var resend = false;
    function post(preview) {
      return fetch("/api/admin-send-notice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: kind, ids: ids, preview: !!preview, resend: resend }) })
        .then(function (res) { return res.json().then(function (r) { return { ok: res.ok, r: r }; }); });
    }
    function skipText(sk) {
      var t = "";
      if (sk.noEmail && sk.noEmail.length) t += "\n・沒有留 Email（不寄）：" + sk.noEmail.join("、");
      if (sk.alreadySent && sk.alreadySent.length) t += "\n・已經寄過（不重寄）：" + sk.alreadySent.join("、");
      if (sk.wrongStatus && sk.wrongStatus.length) t += "\n・狀態不符（" + (kind === "received" ? "已對帳完成的請用②" : "還沒對帳完成") + "）：" + sk.wrongStatus.join("、");
      if (sk.dead && sk.dead.length) t += "\n・已取消／垃圾桶：" + sk.dead.join("、");
      return t;
    }
    post(true)
      .then(function (x) {
        if (!x.ok) { alert(x.r.error || "預覽失敗"); return null; }
        if (!x.r.configured) { alert("寄信功能還沒設定好（Vercel 缺 RESEND_API_KEY / EMAIL_FROM）。"); return null; }
        var again = (x.r.skipped && x.r.skipped.alreadySent) || [];
        // 打勾的人裡有「已經寄過」的 → 明確問要不要再寄一次
        if (again.length && confirm("打勾的人裡，有 " + again.length + " 位之前已經寄過" + label + "信：\n\n" + again.join("、") + "\n\n要把他們「再寄一次」嗎？\n\n按「確定」＝連他們一起重寄\n按「取消」＝只寄沒寄過的人")) {
          resend = true;
          return post(true);
        }
        return x;
      })
      .then(function (x) {
        if (!x) return null;
        if (!x.ok) { alert(x.r.error || "預覽失敗"); return null; }
        var s = x.r;
        var sk = skipText(s.skipped || {});
        if (!s.emails) { alert("打勾的 " + s.selected + " 筆都沒有可以寄的" + label + "信。" + sk); return null; }
        var names = s.recipients.slice(0, 20).join("\n");
        if (s.recipients.length > 20) names += "\n…等共 " + s.recipients.length + " 位";
        var msg = "要寄出 " + label + " 通知" + (resend ? "（含重寄）" : "") + "，共 " + s.emails + " 封，收件人：\n\n" + names + (sk ? "\n\n略過：" + sk : "") + "\n\n確定要寄出嗎？寄出後無法收回。";
        if (!confirm(msg)) return null;
        return post(false).then(function (y) {
          if (y.ok) {
            var done = label + "已寄出 " + y.r.sent + " 封（" + new Date().toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }) + "）。";
            noticeMsg.textContent = done;
            alert(done + "\n\n收件人：\n" + (y.r.recipients || []).join("\n") + "\n\n（是否送達可到 Resend 後台 Emails 頁查看）");
          } else {
            noticeMsg.textContent = y.r.error || "寄信失敗";
            alert(y.r.error || "寄信失敗");
          }
          return loadBookings();
        });
      })
      .catch(function () { alert("操作失敗，請重新整理再試一次"); })
      .finally(function () { btn.disabled = false; });
  }
  if (noticeBtn) noticeBtn.addEventListener("click", function () { runNotice("received", noticeBtn); });
  if (confirmBtn) confirmBtn.addEventListener("click", function () { runNotice("confirmed", confirmBtn); });
  if (trashBtn) trashBtn.addEventListener("click", function () { bulkTrash(true); });
  if (restoreBtn) restoreBtn.addEventListener("click", function () { bulkTrash(false); });

  // 購物車整筆訂單：同一筆的營位排在一起，上面加一條整筆標題列
  function clusterGroups(list) {
    var seen = {}, out = [];
    list.forEach(function (b) {
      if (!b.group_id) { out.push(b); return; }
      if (seen[b.group_id]) return;
      seen[b.group_id] = true;
      list.forEach(function (x) { if (x.group_id === b.group_id) out.push(x); });
    });
    return out;
  }
  function groupAction(groupId, body, okMsg) {
    body.groupId = groupId;
    return fetch("/api/admin-bookings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (r) { return { ok: res.ok, r: r }; }); })
      .then(function (x) {
        if (!x.ok) { alert(x.r.error || "操作失敗"); return; }
        var m = { sent: "已寄出一封「預約成功」email（含所有營位）。", no_email: "這位客人沒有留 email，沒有寄信，請改用電話或 LINE 通知。", not_configured: "尚未設定寄信功能，這次沒有寄信。", send_failed: "寄信失敗，請稍後再按一次重寄。" };
        alert((okMsg || "完成") + (x.r.email && m[x.r.email] ? m[x.r.email] : ""));
        return loadBookings();
      })
      .catch(function () { alert("操作失敗，請重新整理再試一次"); });
  }
  function groupHeaderRow(b, members, inTrashView) {
    var live = members.filter(function (x) { return x.payment_status !== "cancelled"; });
    var pending = live.filter(function (x) { return x.payment_status === "pending"; }).length;
    var unverified = live.filter(function (x) { return x.payment_status === "paid" && x.payment_verified === false; }).length;
    var cancelled = members.length - live.length;
    var state, cls;
    if (!live.length) { state = "整筆已取消"; cls = "cancelled"; }
    else if (pending) { state = "待匯款"; cls = "pending"; }
    else if (unverified) { state = "已付款（待對帳）"; cls = "paid"; }
    else { state = "已對帳完成"; cls = "paid"; }
    var total = members.reduce(function (n, x) { return n + (x.payment_status === "cancelled" ? 0 : Number(x.total_amount || 0)); }, 0);
    var tr = document.createElement("tr");
    tr.className = "group-head";
    var td = document.createElement("td");
    td.colSpan = 10;
    td.style.cssText = "background:rgba(232,194,106,.16);border-top:3px solid #e8c26a;padding:10px 12px;";
    var line = document.createElement("div");
    line.style.cssText = "display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;";
    line.innerHTML =
      "<b>🛒 整筆訂單 " + escapeHtml(b.group_code || String(b.group_id).slice(0, 8)) + "</b>" +
      "<span>" + escapeHtml(b.customer_name) + "　" + escapeHtml(b.customer_phone) + "</span>" +
      "<span>共 " + members.length + " 個營位" + (cancelled ? "（其中 " + cancelled + " 個已取消）" : "") + "</span>" +
      "<b>合計 NT$" + total.toLocaleString() + "</b>" +
      '<span class="status-badge status-' + cls + '">' + state + "</span>";
    td.appendChild(line);
    if (currentRole === "admin" && !inTrashView) {
      var btns = document.createElement("div");
      btns.style.cssText = "margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;";
      var gid = b.group_id;
      if (pending || unverified) {
        btns.appendChild(makeActionBtn("整筆對帳完成，寄一封確認信", function () {
          if (confirm("確認這整筆（" + live.length + " 個營位，合計 NT$" + total.toLocaleString() + "）款項都已入帳？\n按下去會把所有營位標記為已對帳，並只寄一封「預約成功」email 給客人。")) groupAction(gid, { payment_status: "paid" }, "已標記整筆對帳完成。");
        }));
      } else if (live.length) {
        btns.appendChild(makeActionBtn("再寄一次預約成功信（整筆）", function () {
          if (!b.customer_email) { alert("這位客人沒有留 email，請改用電話或 LINE 通知。"); return; }
          if (confirm("要寄「預約成功」email（含所有營位）給 " + b.customer_email + " 嗎？")) groupAction(gid, { resend: true }, "");
        }));
      }
      if (cancelled) {
        btns.appendChild(makeActionBtn("恢復已取消的營位", function () {
          if (confirm("要恢復這筆整筆訂單裡已取消的營位嗎？\n如果有營位那幾晚已被別人訂走，該營位就無法恢復。恢復時不會自動寄信。")) groupAction(gid, { restore: true }, "已恢復。");
        }));
      }
      if (live.length) {
        btns.appendChild(makeActionBtn("取消整筆訂單", function () {
          if (confirm("確定要取消這整筆訂單（" + live.length + " 個營位）嗎？取消後會釋出所有營位。")) groupAction(gid, { payment_status: "cancelled" }, "已取消整筆訂單。");
        }));
      }
      td.appendChild(btns);
    }
    tr.appendChild(td);
    return tr;
  }

  function renderBookings(bookings) {
    bookings = clusterGroups(sortBookings(bookings));
    shownBookings = bookings;
    updateTrashUi();
    bookingsBody.innerHTML = "";
    var vTotal = 0, vCount = 0, uTotal = 0, uCount = 0;
    bookings.forEach(function (b) {
      if (b.payment_status !== "paid") return;
      var amt = Number(b.total_amount || 0);
      if (b.payment_verified === false) { uTotal += amt; uCount += 1; }
      else { vTotal += amt; vCount += 1; }
    });
    paidSummary.style.whiteSpace = "pre-line";
    paidSummary.textContent =
      "目前列表合計（依上方日期／狀態篩選）\n" +
      "① 已對帳：" + vCount + " 筆，NT$" + vTotal.toLocaleString() + "\n" +
      "② 已付款（含未對帳）：" + (vCount + uCount) + " 筆，NT$" + (vTotal + uTotal).toLocaleString() +
      (uCount ? "（其中待對帳 " + uCount + " 筆，NT$" + uTotal.toLocaleString() + "）" : "");
    if (!bookings.length) {
      bookingsBody.innerHTML = '<tr><td colspan="10">目前沒有符合條件的訂單</td></tr>';
      return;
    }
    var lastGroup = null;
    bookings.forEach(function (b) {
      if (b.group_id && b.group_id !== lastGroup) {
        var gm = bookings.filter(function (x) { return x.group_id === b.group_id; });
        bookingsBody.appendChild(groupHeaderRow(b, gm, filterStatus.value === "trashed" || b.trashed === true));
      }
      lastGroup = b.group_id || null;
      var tr = document.createElement("tr");
      if (b.group_id) tr.style.borderLeft = "4px solid #e8c26a";
      // 新訂單：入住～退房＋營位；舊訂單（改成依營位計價之前建立的）只有單一日期，沒有營位
      var dateText;
      if (b.check_in) {
        var nn = Number(b.nights_count) || 1;
        var startD = b.check_in;
        if (b.early_arrival) {
          var dd = new Date(b.check_in + "T00:00:00Z");
          dd.setUTCDate(dd.getUTCDate() - 1);
          startD = dd.toISOString().slice(0, 10);
          nn += 1;
        }
        dateText = startD + " ～ " + b.check_out + "（" + (b.early_arrival ? (nn + 1) + "天" + nn + "夜，含夜衝" : nn + "晚") + "）";
      } else {
        dateText = b.booking_date;
      }
      tr.innerHTML =
        "<td>" + escapeHtml(dateText) +
        '<div style="font-size:12px;opacity:.75;margin-top:4px;">下單：' +
        escapeHtml(new Date(b.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })) +
        "</div></td>" +
        "<td>" + escapeHtml(b.site_id || "—") + "</td>" +
        "<td>" + (b.early_arrival ? "有（前一晚）" : "—") + "</td>" +
        '<td><label class="handled-wrap"><input type="checkbox" class="handled-cb"' +
        (b.handled ? " checked" : "") + (currentRole !== "admin" ? " disabled" : "") +
        ' aria-label="已處理"> <span>' + escapeHtml(b.customer_name) + "</span></label>" +
        '<div style="font-size:12px;opacity:.8;margin-top:3px;">' + (b.group_id ? '整筆訂單編號 <b style="user-select:all;letter-spacing:.5px;">' + escapeHtml(b.group_code || String(b.group_id).slice(0, 8)) + "</b>（本營位 " + escapeHtml(String(b.id || "").slice(0, 8)) + "）" : '訂單編號 <b style="user-select:all;letter-spacing:.5px;">' + escapeHtml(String(b.id || "").slice(0, 8)) + "</b>") + (b.trashed ? "（垃圾桶）" : "") + "</div></td>" +
        "<td>" + escapeHtml(b.customer_phone) + "</td>" +
        "<td>" + escapeHtml(b.people_per_tent) + "</td>" +
        "<td>NT$" + Number(b.total_amount || 0).toLocaleString() + "</td>" +
        "<td>" + (b.payment_method === "ecpay" ? "線上刷卡" : b.payment_method === "linepay" ? "LINE Pay" : "銀行匯款") + "</td>" +
        '<td><span class="status-badge status-' + b.payment_status + '">' +
        (b.payment_status === "paid" && b.payment_verified === false ? "已付款（待對帳）" : b.payment_status === "paid" ? "已對帳完成" : (statusLabels[b.payment_status] || b.payment_status)) +
        "</span>" + holdNote(b) + "</td>";

      var cb = tr.querySelector(".handled-cb");
      if (cb) {
        if (b.handled) tr.classList.add("row-handled");
        cb.addEventListener("change", function () {
          var want = cb.checked;
          fetch("/api/admin-bookings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: b.id, handled: want }),
          })
            .then(function (res) {
              if (!res.ok) throw new Error("fail");
              b.handled = want;
              tr.classList.toggle("row-handled", want);
              updateTrashUi();
            })
            .catch(function () {
              cb.checked = !want;
              alert("勾選沒有存成功，請重新整理再試一次");
            });
        });
      }

      var actionsTd = document.createElement("td");
      actionsTd.className = "admin-actions";

      var inTrashView = filterStatus.value === "trashed" || b.trashed === true;
      if (currentRole !== "admin" || inTrashView) {
        actionsTd.textContent = inTrashView ? "（在垃圾桶）" : "—";
      }
      if (b.group_id) {
        if (b.payment_status === "cancelled" && !inTrashView) tr.classList.add("row-cancelled");
        if (!inTrashView && currentRole === "admin") actionsTd.textContent = "（整筆訂單，請用上方整筆按鈕）";
        tr.appendChild(actionsTd);
        bookingsBody.appendChild(tr);
        return;
      }

      if (currentRole === "admin" && !inTrashView && b.payment_status !== "paid") {
        actionsTd.appendChild(
          makeActionBtn("對帳完成（標記已付款並寄確認信）", function () {
            updateStatus(b.id, "paid");
          })
        );
      }
      if (currentRole === "admin" && !inTrashView && b.payment_status === "paid" && b.payment_verified === false) {
        actionsTd.appendChild(
          makeActionBtn("對帳完成，寄確認信", function () {
            if (confirm("確認這筆款項已入帳？按下去會寄「預約成功」email 給客人。")) {
              updateStatus(b.id, "paid");
            }
          })
        );
      }
      if (currentRole === "admin" && !inTrashView && b.payment_status === "paid" && b.payment_verified !== false) {
        actionsTd.appendChild(
          makeActionBtn(b.confirmation_email_sent_at ? "已對帳 ✓ 再寄一次預約成功信" : "補寄預約成功信", function () {
            if (!b.customer_email) { alert("這位客人沒有留 email，請改用電話或 LINE 通知。"); return; }
            if (!confirm("要寄「預約成功」email 給 " + b.customer_email + " 嗎？")) return;
            fetch("/api/admin-bookings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: b.id, resend: true }),
            })
              .then(function (res) { if (!res.ok) throw new Error("fail"); return res.json(); })
              .then(function (r) {
                var m = { sent: "已寄出預約成功信。", no_email: "沒有 email。", not_configured: "尚未設定寄信功能。", send_failed: "寄信失敗（可能今天額度用完），請稍後再試。" };
                alert(m[r.email] || "完成");
                return loadBookings();
              })
              .catch(function () { alert("操作失敗，請重新整理再試一次"); });
          })
        );
      }
      if (b.payment_status === "cancelled" && !inTrashView) tr.classList.add("row-cancelled");
      if (currentRole === "admin" && !inTrashView && b.payment_status === "cancelled") {
        actionsTd.appendChild(
          makeActionBtn("恢復訂單", function () {
            if (!confirm("要恢復這筆訂單嗎？\n\n・原本已對帳／已回報匯款的，會回到「已付款」狀態\n・還沒匯款的，會回到「待匯款」並重新保留 24 小時\n・如果這個營位那幾晚已被別人訂走，就無法恢復\n\n恢復時不會自動寄信。")) return;
            fetch("/api/admin-bookings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, restore: true }) })
              .then(function (res) { return res.json().then(function (r) { return { ok: res.ok, r: r }; }); })
              .then(function (x) {
                if (!x.ok) { alert(x.r.error || "恢復失敗"); return; }
                alert("已恢復。" + (x.r.state === "pending" ? "狀態是「待匯款」，保留 24 小時。" : x.r.state === "reported" ? "狀態是「已付款（待對帳）」。" : "狀態是「已對帳完成」。"));
                return loadBookings();
              })
              .catch(function () { alert("操作失敗，請重新整理再試一次"); });
          })
        );
      }
      if (currentRole === "admin" && !inTrashView && b.payment_status !== "cancelled") {
        actionsTd.appendChild(
          makeActionBtn("取消訂單", function () {
            if (confirm("確定要取消這筆訂單嗎？取消後會釋出該日期的營位。")) {
              updateStatus(b.id, "cancelled");
            }
          })
        );
      }

      tr.appendChild(actionsTd);
      bookingsBody.appendChild(tr);
    });
  }

  function loadBookings() {
    dashError.textContent = "";
    bookingsBody.innerHTML = '<tr><td colspan="10">載入中…</td></tr>';

    var params = new URLSearchParams();
    if (filterFrom.value) params.set("from", filterFrom.value);
    if (filterTo.value) params.set("to", filterTo.value);
    if (filterStatus.value) params.set("status", filterStatus.value);
    if (activeQ) params.set("q", activeQ);
    else if (activeLast4) params.set("last4", activeLast4);

    return fetch("/api/admin-bookings?" + params.toString())
      .then(function (res) {
        if (res.status === 401) {
          showLogin();
          throw new Error("__unauthorized__");
        }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "載入失敗");
          return data;
        });
      })
      .then(function (data) {
        setRole(data.role);
        renderBookings(data.bookings || []);
        if (qMsg) {
          if (activeQ) {
            var qn = (data.bookings || []).length;
            qMsg.textContent = qn ? "搜尋「" + activeQ + "」找到 " + qn + " 筆（不受上方日期／狀態篩選影響，垃圾桶裡的也會列出）。" : "找不到「" + activeQ + "」的訂單。";
            qMsg.style.color = qn ? "#8fd68f" : "#f2c766";
          } else qMsg.textContent = "";
        }
        if (activeLast4 && !activeQ) {
          var n = (data.bookings || []).length;
          last4Msg.textContent = n
            ? "匯款末碼 " + activeLast4 + " 共找到 " + n + " 筆（不受上方日期／狀態篩選影響；包含客人在留言裡寫的末碼）。請核對金額與姓名。"
            : "找不到末碼 " + activeLast4 + " 的訂單（回報頁和留言都找過了）。可能客人還沒回報，或輸入有誤。";
          last4Msg.style.color = n ? "#8fd68f" : "#f2c766";
        } else {
          last4Msg.textContent = "";
        }
      })
      .catch(function (err) {
        if (err.message === "__unauthorized__") return;
        dashError.textContent = err.message;
        bookingsBody.innerHTML = "";
      });
  }

  function renderMessages(messages) {
    messagesBody.innerHTML = "";
    if (!messages.length) {
      messagesBody.innerHTML = '<tr><td colspan="6">目前沒有留言</td></tr>';
      return;
    }
    messages.forEach(function (m) {
      var tr = document.createElement("tr");
      var replied = m.status === "replied";
      if (replied) tr.classList.add("row-handled");
      var time = m.created_at ? new Date(m.created_at).toLocaleString("zh-TW") : "";
      var badgeCls = m.status === "new" ? "pending" : "paid";
      var badgeTxt = replied ? "已回覆" : m.status === "read" ? "已讀" : "新留言";
      tr.innerHTML =
        "<td>" + escapeHtml(time) + "</td>" +
        '<td><label class="handled-wrap"><input type="checkbox" class="handled-cb msg-cb"' +
        (replied ? " checked" : "") + (currentRole !== "admin" ? " disabled" : "") +
        ' aria-label="已回覆"> <span>' + escapeHtml(m.name) + "</span></label></td>" +
        "<td>" + escapeHtml(m.phone) + "</td>" +
        "<td>" + escapeHtml(m.message || "") +
        (m.reply ? '<div style="margin-top:6px;font-size:12px;opacity:.85;">營主回覆：' + escapeHtml(m.reply) + "</div>" : "") +
        (m.is_public === false ? '<div style="margin-top:6px;font-size:12px;color:#f2c766;">（已從公開留言板隱藏）</div>' : "") +
        "</td>" +
        '<td><span class="status-badge status-' + badgeCls + '">' + badgeTxt + "</span></td>";

      function patchMsg(body) {
        body.id = m.id;
        return fetch("/api/admin-messages", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
          .then(function (res) {
            if (!res.ok) throw new Error("更新失敗");
            return loadMessages();
          })
          .catch(function () {
            alert("更新失敗，請重新整理再試一次");
            return loadMessages();
          });
      }

      var cb = tr.querySelector(".msg-cb");
      if (cb) {
        cb.addEventListener("change", function () {
          patchMsg({ status: cb.checked ? "replied" : "read" });
        });
      }

      var msgTd = tr.children[3];
      var box = null;
      function toggleReplyBox() {
        if (box) { box.hidden = !box.hidden; if (!box.hidden) box.querySelector("textarea").focus(); return; }
        box = document.createElement("div");
        box.className = "reply-box";
        box.innerHTML =
          '<textarea maxlength="600" placeholder="輸入要回覆的內容（會公開顯示在網站的留言板上）"></textarea>' +
          '<div class="reply-btns"></div>';
        var ta = box.querySelector("textarea");
        ta.value = m.reply || "";
        var btns = box.querySelector(".reply-btns");
        btns.appendChild(makeActionBtn("送出回覆（並標記已回覆）", function () {
          var text = ta.value.trim();
          if (!text) { alert("請先輸入回覆內容。"); return; }
          patchMsg({ reply: text });
        }));
        if (m.reply) {
          btns.appendChild(makeActionBtn("刪除回覆", function () {
            if (confirm("確定刪除這則回覆？")) patchMsg({ reply: "", status: "read" });
          }));
        }
        btns.appendChild(makeActionBtn("收起", function () { box.hidden = true; }));
        msgTd.appendChild(box);
        ta.focus();
      }

      var actionsTd = document.createElement("td");
      if (currentRole === "admin") {
        actionsTd.appendChild(makeActionBtn(m.reply ? "修改回覆" : "回覆", toggleReplyBox));
        actionsTd.appendChild(
          makeActionBtn(m.is_public === false ? "公開顯示" : "隱藏留言", function () {
            patchMsg({ is_public: m.is_public === false });
          })
        );
        if (m.status === "new") {
          actionsTd.appendChild(makeActionBtn("標記已讀", function () { patchMsg({ status: "read" }); }));
        }
      } else {
        actionsTd.textContent = "—";
      }
      tr.appendChild(actionsTd);
      messagesBody.appendChild(tr);
    });
  }

  function loadMessages() {
    messagesError.textContent = "";
    messagesBody.innerHTML = '<tr><td colspan="6">載入中…</td></tr>';
    return fetch("/api/admin-messages")
      .then(function (res) {
        if (res.status === 401) return; // 主要登入狀態由訂單那支 API 判斷，這裡不重複跳轉
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "載入失敗");
          return data;
        });
      })
      .then(function (data) {
        if (data) renderMessages(data.messages || []);
      })
      .catch(function (err) {
        messagesError.textContent = err.message;
        messagesBody.innerHTML = "";
      });
  }

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    loginError.textContent = "";
    var pw = document.getElementById("pw").value;

    fetch("/api/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("密碼錯誤");
        return res.json();
      })
      .then(function (data) {
        setRole(data && data.role);
        loginForm.reset();
        showDashboard();
        loadBookings();
        loadMessages();
      })
      .catch(function () {
        loginError.textContent = "密碼錯誤，請再試一次";
      });
  });

  logoutBtn.addEventListener("click", function () {
    fetch("/api/admin-login", { method: "DELETE" }).finally(function () {
      showLogin();
    });
  });

  function runLast4() {
    var v = (last4Input.value || "").replace(/\D/g, "");
    if (v.length < 4 || v.length > 5) {
      last4Msg.textContent = "請輸入 4 或 5 位數字";
      last4Msg.style.color = "#f29a9a";
      return;
    }
    activeLast4 = v;
    last4Clear.hidden = false;
    loadBookings();
  }
  last4Btn.addEventListener("click", runLast4);
  last4Input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); runLast4(); }
  });
  last4Clear.addEventListener("click", function () {
    activeLast4 = "";
    last4Input.value = "";
    last4Clear.hidden = true;
    loadBookings();
  });

  function runQ() {
    var v = (qInput.value || "").trim();
    if (!v) { qMsg.textContent = "請輸入訂單編號、姓名或電話"; qMsg.style.color = "#f29a9a"; return; }
    activeQ = v;
    qClear.hidden = false;
    loadBookings();
  }
  if (qBtn) qBtn.addEventListener("click", runQ);
  if (qInput) qInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); runQ(); } });
  if (qClear) qClear.addEventListener("click", function () { activeQ = ""; qInput.value = ""; qClear.hidden = true; loadBookings(); });

  refreshBtn.addEventListener("click", loadBookings);
  filterStatus.addEventListener("change", loadBookings);
  if (sortBy) sortBy.addEventListener("change", loadBookings);
  filterFrom.addEventListener("change", loadBookings);
  filterTo.addEventListener("change", loadBookings);

  // 進站先偷偷打一次 API，cookie 還有效的話直接進後台，不用每次都重新登入
  fetch("/api/admin-bookings")
    .then(function (res) {
      if (res.status === 401) {
        showLogin();
        return;
      }
      return res.json().then(function (data) {
        showDashboard();
        setRole(data.role);
        renderBookings(data.bookings || []);
        loadMessages();
      });
    })
    .catch(function () {
      showLogin();
    });
});
