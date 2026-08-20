document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("nav-open");
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("nav-open");
      });
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

  // 背景音樂歌單：訪客自己點選喜歡的一首森林音樂，記住偏好，循環播放該曲
  var MUSIC_TRACKS = [
    { id: "01", file: "audio/playlist/01-good-morning-thousand-trees.mp3", zh: "早安，千樹之森", en: "Good Morning, Thousand Trees" },
    { id: "02", file: "audio/playlist/02-starlight-always-here.mp3", zh: "星光一直都在", en: "Starlight Always Here" },
    { id: "03", file: "audio/playlist/03-goodbye-to-before.mp3", zh: "再見了以前", en: "Goodbye to Before" },
    { id: "04", file: "audio/playlist/04-let-the-fire-burn-slowly.mp3", zh: "讓火慢慢燒", en: "Let the Fire Burn Slowly" },
    { id: "05", file: "audio/playlist/05-thousand-trees-forest.mp3", zh: "千樹之森", en: "Thousand Trees Forest" },
    { id: "06", file: "audio/playlist/06-when-the-rain-falls.mp3", zh: "雨落下來的時候", en: "When the Rain Falls" },
    { id: "07", file: "audio/playlist/07-welcome-home.mp3", zh: "歡迎回家", en: "Welcome Home" },
    { id: "08", file: "audio/playlist/08-goodnight-starlight.mp3", zh: "晚安，星光", en: "Goodnight, Starlight" },
    { id: "09", file: "audio/playlist/09-tomorrows-road.mp3", zh: "明天的路", en: "Tomorrow's Road" },
    { id: "10", file: "audio/playlist/10-come-back-when-tired.mp3", zh: "累了就回來吧", en: "Come Back When You're Tired" }
  ];

  var music = document.getElementById("bgMusic");
  var musicWidget = document.querySelector(".music-widget");
  var musicBtn = document.querySelector(".music-toggle");
  var musicPanel = document.getElementById("musicPlaylist");
  var musicList = document.getElementById("musicTrackList");
  var musicStopBtn = document.getElementById("musicStopBtn");
  var musicNowPlaying = document.getElementById("musicNowPlaying");
  var musicNowPlayingText = document.getElementById("musicNowPlayingText");

  if (music && musicWidget && musicBtn && musicPanel && musicList) {
    var currentTrackId = (function () {
      try { return localStorage.getItem("siteMusicTrack") || MUSIC_TRACKS[0].id; } catch (e) { return MUSIC_TRACKS[0].id; }
    })();

    function findTrack(id) {
      for (var i = 0; i < MUSIC_TRACKS.length; i++) {
        if (MUSIC_TRACKS[i].id === id) return MUSIC_TRACKS[i];
      }
      return MUSIC_TRACKS[0];
    }

    function setMusicBtnState(playing) {
      musicBtn.classList.toggle("playing", playing);
      var isEn = document.documentElement.lang === "en";
      musicBtn.setAttribute("aria-label", playing ? (isEn ? "Pause music" : "關閉背景音樂") : (isEn ? "Choose background music" : "選擇背景音樂"));
    }

    // 更新每首歌左邊的小圖示（未選取 ♪／播放中 ⏸／已選但暫停 ▶），並更新按鈕旁的「現在播放」提示
    function refreshTrackUI() {
      var playing = !music.paused;
      musicList.querySelectorAll(".music-track").forEach(function (b) {
        var isCurrent = b.dataset.trackId === currentTrackId;
        b.classList.toggle("active", isCurrent);
        var icon = b.querySelector(".music-track-icon");
        var hint = b.querySelector(".music-track-hint");
        if (!isCurrent) {
          icon.textContent = "♪";
          if (hint) hint.remove();
        } else {
          icon.textContent = playing ? "⏸" : "▶";
          if (!hint) {
            hint = document.createElement("span");
            hint.className = "music-track-hint";
            b.appendChild(hint);
          }
          var isEn = document.documentElement.lang === "en";
          hint.textContent = playing ? (isEn ? "Playing" : "播放中") : (isEn ? "Paused" : "已暫停");
        }
      });

      if (musicNowPlaying && musicNowPlayingText) {
        if (playing) {
          var track = findTrack(currentTrackId);
          var isEn2 = document.documentElement.lang === "en";
          musicNowPlayingText.textContent = isEn2 ? track.en : track.zh;
          musicNowPlaying.hidden = false;
        } else {
          musicNowPlaying.hidden = true;
        }
      }
    }

    function playTrack(id) {
      var track = findTrack(id);
      currentTrackId = track.id;
      if (music.getAttribute("src") !== track.file) {
        music.src = track.file;
      }
      music.play().then(function () {
        setMusicBtnState(true);
        try {
          localStorage.setItem("siteMusic", "on");
          localStorage.setItem("siteMusicTrack", track.id);
        } catch (e) {}
        refreshTrackUI();
      }).catch(function () {
        setMusicBtnState(false);
        refreshTrackUI();
      });
    }

    function stopMusic() {
      music.pause();
      setMusicBtnState(false);
      try { localStorage.setItem("siteMusic", "off"); } catch (e) {}
      refreshTrackUI();
    }

    function openPanel() {
      musicPanel.hidden = false;
      musicBtn.setAttribute("aria-expanded", "true");
      refreshTrackUI();
    }
    function closePanel() {
      musicPanel.hidden = true;
      musicBtn.setAttribute("aria-expanded", "false");
    }

    // 建立歌單清單：點目前播放中的那首會暫停，點其他首會切換播放
    MUSIC_TRACKS.forEach(function (track) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "music-track";
      btn.dataset.trackId = track.id;
      btn.innerHTML =
        '<span class="music-track-icon">♪</span>' +
        '<span class="lang-zh">' + track.zh + '</span>' +
        '<span class="lang-en" hidden>' + track.en + '</span>';
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (track.id === currentTrackId && !music.paused) {
          stopMusic();
        } else {
          playTrack(track.id);
          closePanel();
        }
      });
      li.appendChild(btn);
      musicList.appendChild(li);
    });

    musicBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (musicPanel.hidden) {
        openPanel();
      } else {
        closePanel();
      }
    });

    if (musicStopBtn) {
      musicStopBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        stopMusic();
        closePanel();
      });
    }

    musicPanel.addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("click", function () { closePanel(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closePanel();
    });

    // 記住上次選的歌；若上次是播放狀態就嘗試接續播放（受瀏覽器自動播放政策限制）
    music.src = findTrack(currentTrackId).file;

    var wantsMusic = false;
    try { wantsMusic = localStorage.getItem("siteMusic") === "on"; } catch (e) {}

    if (wantsMusic) {
      music.play().then(function () {
        setMusicBtnState(true);
        refreshTrackUI();
      }).catch(function () {
        setMusicBtnState(false);
        refreshTrackUI();
      });
    } else {
      refreshTrackUI();
    }
  }

  // 林霧晴首頁跑馬燈：index.html 專用，其他頁面沒有相關元素就直接跳過
  var linwuqingSlideshow = document.getElementById("linwuqingSlideshow");
  var linwuqingDots = document.getElementById("linwuqingDots");
  if (linwuqingSlideshow && linwuqingDots) {
    var linwuqingImgs = linwuqingSlideshow.querySelectorAll("img");
    linwuqingImgs.forEach(function (img, i) {
      var dot = document.createElement("span");
      if (i === 0) dot.className = "active";
      linwuqingDots.appendChild(dot);
    });
    var linwuqingDotEls = linwuqingDots.querySelectorAll("span");
    var linwuqingIndex = 0;
    setInterval(function () {
      linwuqingImgs[linwuqingIndex].classList.remove("active");
      linwuqingDotEls[linwuqingIndex].classList.remove("active");
      linwuqingIndex = (linwuqingIndex + 1) % linwuqingImgs.length;
      linwuqingImgs[linwuqingIndex].classList.add("active");
      linwuqingDotEls[linwuqingIndex].classList.add("active");
    }, 5000);
  }

  // 森林公約設計圖 lightbox：forest-covenant.html 專用，其他頁面沒有相關元素就直接跳過
  var covenantLightbox = document.getElementById("covenantLightbox");
  var covenantLightboxImg = document.getElementById("covenantLightboxImg");
  var covenantLightboxClose = document.getElementById("covenantLightboxClose");
  if (covenantLightbox && covenantLightboxImg) {
    function openCovenantLightbox(src, alt) {
      covenantLightboxImg.src = src;
      covenantLightboxImg.alt = alt || "";
      covenantLightbox.hidden = false;
    }
    function closeCovenantLightbox() {
      covenantLightbox.hidden = true;
      covenantLightboxImg.src = "";
    }
    document.querySelectorAll(".covenant-page").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var img = btn.querySelector("img");
        openCovenantLightbox(btn.dataset.full, img ? img.alt : "");
      });
    });
    if (covenantLightboxClose) {
      covenantLightboxClose.addEventListener("click", closeCovenantLightbox);
    }
    covenantLightbox.addEventListener("click", function (e) {
      if (e.target === covenantLightbox) closeCovenantLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !covenantLightbox.hidden) closeCovenantLightbox();
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
