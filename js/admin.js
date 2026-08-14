document.addEventListener("DOMContentLoaded", function () {
  var loginSection = document.getElementById("loginSection");
  var dashboardSection = document.getElementById("dashboardSection");
  var loginForm = document.getElementById("loginForm");
  var loginError = document.getElementById("loginError");
  var logoutBtn = document.getElementById("logoutBtn");
  var refreshBtn = document.getElementById("refreshBtn");
  var bookingsBody = document.getElementById("bookingsBody");
  var dashError = document.getElementById("dashError");
  var filterFrom = document.getElementById("filterFrom");
  var filterTo = document.getElementById("filterTo");
  var filterStatus = document.getElementById("filterStatus");

  var statusLabels = {
    pending: "待確認",
    paid: "已付款",
    failed: "刷卡失敗",
    cancelled: "已取消",
  };

  function showDashboard() {
    loginSection.hidden = true;
    dashboardSection.hidden = false;
    logoutBtn.hidden = false;
  }

  function showLogin() {
    loginSection.hidden = false;
    dashboardSection.hidden = true;
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
        return loadBookings();
      })
      .catch(function () {
        alert("更新失敗，請重新整理再試一次");
      });
  }

  function renderBookings(bookings) {
    bookingsBody.innerHTML = "";
    if (!bookings.length) {
      bookingsBody.innerHTML = '<tr><td colspan="9">目前沒有符合條件的訂單</td></tr>';
      return;
    }
    bookings.forEach(function (b) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(b.booking_date) + "</td>" +
        "<td>" + escapeHtml(b.customer_name) + "</td>" +
        "<td>" + escapeHtml(b.customer_phone) + "</td>" +
        "<td>" + escapeHtml(b.tents_count) + "</td>" +
        "<td>" + escapeHtml(b.people_per_tent) + "</td>" +
        "<td>NT$" + Number(b.total_amount || 0).toLocaleString() + "</td>" +
        "<td>" + (b.payment_method === "ecpay" ? "線上刷卡" : "銀行匯款") + "</td>" +
        '<td><span class="status-badge status-' + b.payment_status + '">' +
        (statusLabels[b.payment_status] || b.payment_status) +
        "</span></td>";

      var actionsTd = document.createElement("td");
      actionsTd.className = "admin-actions";

      if (b.payment_status !== "paid") {
        actionsTd.appendChild(
          makeActionBtn("標記已付款", function () {
            updateStatus(b.id, "paid");
          })
        );
      }
      if (b.payment_status !== "cancelled") {
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
    bookingsBody.innerHTML = '<tr><td colspan="9">載入中…</td></tr>';

    var params = new URLSearchParams();
    if (filterFrom.value) params.set("from", filterFrom.value);
    if (filterTo.value) params.set("to", filterTo.value);
    if (filterStatus.value) params.set("status", filterStatus.value);

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
        renderBookings(data.bookings || []);
      })
      .catch(function (err) {
        if (err.message === "__unauthorized__") return;
        dashError.textContent = err.message;
        bookingsBody.innerHTML = "";
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
      .then(function () {
        loginForm.reset();
        showDashboard();
        loadBookings();
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

  refreshBtn.addEventListener("click", loadBookings);
  filterStatus.addEventListener("change", loadBookings);
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
        renderBookings(data.bookings || []);
      });
    })
    .catch(function () {
      showLogin();
    });
});
