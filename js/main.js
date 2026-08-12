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
});
