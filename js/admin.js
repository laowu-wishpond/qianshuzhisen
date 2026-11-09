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
    } else if (b.payment_status === "paid" && b.transfer_last5) {
      note = "末五碼 " + b.transfer_last5 + (b.confirmation_email_sent_at ? "　已寄確認信" : "");
    }
    return note ? '<div style="font-size:12px;opacity:.85;margin-top:4px;">' + escapeHtml(note) + "</div>" : "";
  }

  function sortBookings(list) {
    var mode = sortBy ? sortBy.value : "created_asc";
    var arr = list.slice();
    arr.sort(function (a, b) {
      if (mode === "checkin_asc") {
        var da = a.check_in || a.booking_date || "", db = b.check_in || b.booking_date || "";
        return da < db ? -1 : da > db ? 1 : (a.created_at < b.created_at ? -1 : 1);
      }
      var ta = new Date(a.created_at).getTime(), tb = new Date(b.created_at).getTime();
      return mode === "created_desc" ? tb - ta : ta - tb;
    });
    return arr;
  }

  function renderBookings(bookings) {
    bookings = sortBookings(bookings);
    bookingsBody.innerHTML = "";
    var paidTotal = 0, paidCount = 0, unverified = 0;
    bookings.forEach(function (b) {
      if (b.payment_status === "paid" && b.payment_verified === false) {
        unverified += 1;
      } else if (b.payment_status === "paid") {
        paidTotal += Number(b.total_amount || 0);
        paidCount += 1;
      }
    });
    paidSummary.textContent =
      "目前列表中已對帳 " + paidCount + " 筆，合計 NT$" + paidTotal.toLocaleString() +
      (unverified ? "；待對帳 " + unverified + " 筆（客人已回報末碼，尚未確認入帳）" : "");
    if (!bookings.length) {
      bookingsBody.innerHTML = '<tr><td colspan="10">目前沒有符合條件的訂單</td></tr>';
      return;
    }
    bookings.forEach(function (b) {
      var tr = document.createElement("tr");
      // 新訂單：入住～退房＋營位；舊訂單（改成依營位計價之前建立的）只有單一日期，沒有營位
      var dateText = b.check_in
        ? b.check_in + " ～ " + b.check_out + "（" + (b.nights_count || "") + "晚）"
        : b.booking_date;
      tr.innerHTML =
        "<td>" + escapeHtml(dateText) +
        '<div style="font-size:12px;opacity:.75;margin-top:4px;">下單：' +
        escapeHtml(new Date(b.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })) +
        "</div></td>" +
        "<td>" + escapeHtml(b.site_id || "—") + "</td>" +
        "<td>" + (b.early_arrival ? "有（前一晚）" : "—") + "</td>" +
        "<td>" + escapeHtml(b.customer_name) + "</td>" +
        "<td>" + escapeHtml(b.customer_phone) + "</td>" +
        "<td>" + escapeHtml(b.people_per_tent) + "</td>" +
        "<td>NT$" + Number(b.total_amount || 0).toLocaleString() + "</td>" +
        "<td>" + (b.payment_method === "ecpay" ? "線上刷卡" : b.payment_method === "linepay" ? "LINE Pay" : "銀行匯款") + "</td>" +
        '<td><span class="status-badge status-' + b.payment_status + '">' +
        (b.payment_status === "paid" && b.payment_verified === false ? "已付款（待對帳）" : (statusLabels[b.payment_status] || b.payment_status)) +
        "</span>" + holdNote(b) + "</td>";

      var actionsTd = document.createElement("td");
      actionsTd.className = "admin-actions";

      if (currentRole !== "admin") {
        actionsTd.textContent = "—";
      }

      if (currentRole === "admin" && b.payment_status !== "paid") {
        actionsTd.appendChild(
          makeActionBtn("對帳完成（標記已付款並寄確認信）", function () {
            updateStatus(b.id, "paid");
          })
        );
      }
      if (currentRole === "admin" && b.payment_status === "paid" && b.payment_verified === false) {
        actionsTd.appendChild(
          makeActionBtn("對帳完成，寄確認信", function () {
            if (confirm("確認這筆款項已入帳？按下去會寄「預約成功」email 給客人。")) {
              updateStatus(b.id, "paid");
            }
          })
        );
      }
      if (currentRole === "admin" && b.payment_status !== "cancelled") {
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
    if (activeLast4) params.set("last4", activeLast4);

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
        if (activeLast4) {
          var n = (data.bookings || []).length;
          last4Msg.textContent = n
            ? "匯款末碼 " + activeLast4 + " 共找到 " + n + " 筆（不受上方日期／狀態篩選影響）。請核對金額與姓名後，再標記已付款。"
            : "找不到末碼 " + activeLast4 + " 的訂單。可能客人還沒回報匯款末五碼，或輸入有誤。";
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
      var time = m.created_at ? new Date(m.created_at).toLocaleString("zh-TW") : "";
      tr.innerHTML =
        "<td>" + escapeHtml(time) + "</td>" +
        "<td>" + escapeHtml(m.name) + "</td>" +
        "<td>" + escapeHtml(m.phone) + "</td>" +
        "<td>" + escapeHtml(m.message || "") +
        (m.reply ? '<div style="margin-top:6px;font-size:12px;opacity:.85;">營主回覆：' + escapeHtml(m.reply) + "</div>" : "") +
        (m.is_public === false ? '<div style="margin-top:6px;font-size:12px;color:#f2c766;">（已從公開留言板隱藏）</div>' : "") +
        "</td>" +
        '<td><span class="status-badge status-' + (m.status === "read" ? "paid" : "pending") + '">' +
        (m.status === "read" ? "已讀" : "新留言") +
        "</span></td>";

      var actionsTd = document.createElement("td");
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
          });
      }
      if (currentRole === "admin") {
        actionsTd.appendChild(
          makeActionBtn(m.reply ? "修改回覆" : "回覆", function () {
            var text = window.prompt("請輸入要公開顯示在留言板上的回覆（留空＝刪除回覆）：", m.reply || "");
            if (text === null) return;
            patchMsg({ reply: text });
          })
        );
        actionsTd.appendChild(
          makeActionBtn(m.is_public === false ? "公開顯示" : "隱藏留言", function () {
            patchMsg({ is_public: m.is_public === false });
          })
        );
      }
      if (currentRole === "admin" && m.status !== "read") {
        actionsTd.appendChild(
          makeActionBtn("標記已讀", function () {
            fetch("/api/admin-messages", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: m.id, status: "read" }),
            })
              .then(function (res) {
                if (!res.ok) throw new Error("更新失敗");
                return loadMessages();
              })
              .catch(function () {
                alert("更新失敗，請重新整理再試一次");
              });
          })
        );
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
