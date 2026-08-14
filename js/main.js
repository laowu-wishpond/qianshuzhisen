document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.style.display = nav.style.display === "block" ? "none" : "block";
    });
  }

  function applyLang(lang) {
    var isEn = lang === "en";
    document.documentElement.lang = isEn ? "en" : "zh-Hant";
    document.querySelectorAll(".lang-zh").forEach(function (el) {
      el.hidden = isEn;
    });
    document.querySelectorAll(".lang-en").forEach(function (el) {
      el.hidden = !isEn;
    });
    document.querySelectorAll(".lang-toggle").forEach(function (btn) {
      btn.textContent = isEn ? "中文" : "EN";
    });
    try {
      localStorage.setItem("siteLang", lang);
    } catch (e) {}
  }

  var savedLang = "zh";
  try {
    savedLang = localStorage.getItem("siteLang") || "zh";
  } catch (e) {}
  applyLang(savedLang);

  document.querySelectorAll(".lang-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var current = document.documentElement.lang === "en" ? "en" : "zh";
      applyLang(current === "en" ? "zh" : "en");
    });
  });

  // 背景音樂：預設關閉，訪客自己按開，記住偏好，循環播放
  var music = document.getElementById("bgMusic");
  var musicBtn = document.querySelector(".music-toggle");
  if (music && musicBtn) {
    function setMusicBtnState(playing) {
      musicBtn.classList.toggle("playing", playing);
      musicBtn.setAttribute("aria-label", playing ? "關閉背景音樂 / Pause music" : "播放背景音樂 / Play music");
      musicBtn.textContent = playing ? "♪" : "♪";
    }

    var wantsMusic = false;
    try {
      wantsMusic = localStorage.getItem("siteMusic") === "on";
    } catch (e) {}

    if (wantsMusic) {
      var playPromise = music.play();
      if (playPromise && playPromise.catch) {
        playPromise.then(function () {
          setMusicBtnState(true);
        }).catch(function () {
          // 瀏覽器擋自動播放，維持關閉狀態，等使用者手動點擊
          setMusicBtnState(false);
        });
      }
    }

    musicBtn.addEventListener("click", function () {
      if (music.paused) {
        music.play().then(function () {
          setMusicBtnState(true);
          try { localStorage.setItem("siteMusic", "on"); } catch (e) {}
        }).catch(function () {});
      } else {
        music.pause();
        setMusicBtnState(false);
        try { localStorage.setItem("siteMusic", "off"); } catch (e) {}
      }
    });
  }

  // 留言表單：contact.html 專用，其他頁面沒有 #contactForm 就直接跳過
  var contactForm = document.getElementById("contactForm");
  if (contactForm) {
    var contactResult = document.getElementById("contactResult");
    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var isEn = document.documentElement.lang === "en";
      var submitBtn = contactForm.querySelector('button[type="submit"]');
      var originalHTML = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.textContent = isEn ? "Sending…" : "送出中…";
      contactResult.style.color = "";
      contactResult.textContent = "";

      fetch("/api/create-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: document.getElementById("cname").value,
          phone: document.getElementById("cphone").value,
          message: document.getElementById("cmsg").value,
        }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || (isEn ? "Failed to send" : "送出失敗"));
            return data;
          });
        })
        .then(function () {
          contactResult.style.color = "#8fd68f";
          contactResult.textContent = isEn
            ? "Message sent! We'll get back to you soon."
            : "留言已送出，我們會盡快與您聯繫。";
          contactForm.reset();
        })
        .catch(function (err) {
          contactResult.style.color = "#f29a9a";
          contactResult.textContent = isEn
            ? "Failed to send: " + err.message + " (you can also reach us by phone)"
            : "送出失敗：" + err.message + "（也可以直接電話聯絡我們）";
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalHTML;
        });
    });
  }
});
