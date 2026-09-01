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
    // 每位訪客第一次來訪時，隨機指定一首歌當作起始曲目，之後就記住這個選擇
    // （之後回訪、切換頁面都會延續同一首，除非訪客自己在選單裡換歌或按暫停）
    var currentTrackId = (function () {
      try {
        var saved = localStorage.getItem("siteMusicTrack");
        if (saved) return saved;
      } catch (e) {}
      var randomTrack = MUSIC_TRACKS[Math.floor(Math.random() * MUSIC_TRACKS.length)];
      try { localStorage.setItem("siteMusicTrack", randomTrack.id); } catch (e) {}
      return randomTrack.id;
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

    // 預設是「開啟」音樂：訪客一打開網站就嘗試自動播放隨機/上次選的那首，
    // 除非訪客自己按過暫停（siteMusic 存成 off），才會尊重他們的選擇不要自動播放。
    music.src = findTrack(currentTrackId).file;

    var musicPref = null;
    try { musicPref = localStorage.getItem("siteMusic"); } catch (e) {}
    var wantsMusic = musicPref !== "off";

    function attemptAutoplay() {
      music.play().then(function () {
        setMusicBtnState(true);
        try { localStorage.setItem("siteMusic", "on"); } catch (e) {}
        refreshTrackUI();
      }).catch(function () {
        // 瀏覽器政策擋下了自動播放（沒有使用者互動前不能自動出聲，很常見），
        // 改成訪客第一次點擊/觸控/按鍵時再嘗試播放一次。
        setMusicBtnState(false);
        refreshTrackUI();
        var resumeOnInteraction = function () {
          document.removeEventListener("click", resumeOnInteraction);
          document.removeEventListener("touchstart", resumeOnInteraction);
          document.removeEventListener("keydown", resumeOnInteraction);
          if (wantsMusic) attemptAutoplay();
        };
        document.addEventListener("click", resumeOnInteraction, { once: true });
        document.addEventListener("touchstart", resumeOnInteraction, { once: true });
        document.addEventListener("keydown", resumeOnInteraction, { once: true });
      });
    }

    if (wantsMusic) {
      attemptAutoplay();
    } else {
      refreshTrackUI();
    }
  }

  // 林霧晴首頁 MV：index.html 專用，其他頁面沒有相關元素就直接跳過
  // 影片本身靜音播放（純視覺背景），真正的聲音來自上面的背景音樂播放器
  var linwuqingVideo = document.getElementById("linwuqingVideo");
  if (linwuqingVideo) {
    var playLinwuqingVideo = function () {
      linwuqingVideo.play().catch(function () {});
    };
    playLinwuqingVideo();
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) playLinwuqingVideo();
    });
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

  // 首頁開場動畫：森林插畫從畫面中央向外緩緩展開（約20秒），
  // 花鳥植物最後固定成畫面四周的邊框，不會自動消失，
  // 直到訪客按下「進入森林」才淡出，讓出完整網站。
  var curtain = document.getElementById("pageCurtain");
  var curtainFrame = document.getElementById("curtainFrame");
  var curtainFireflies = document.getElementById("curtainFireflies");
  var curtainEnterBtn = document.getElementById("curtainEnterBtn");
  if (curtain && curtainFrame) {
    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem("curtainShown") === "1";
    } catch (e) {}

    function dismissCurtain() {
      curtain.classList.add("curtain-dismissed");
      setTimeout(function () {
        curtain.classList.add("curtain-removed");
      }, 1000);
    }

    if (reducedMotion || alreadyShown) {
      curtain.classList.add("curtain-removed");
    } else {
      try {
        sessionStorage.setItem("curtainShown", "1");
      } catch (e) {}

      // 灑一群會閃爍飄動的螢火蟲光點，散布在畫面各處
      if (curtainFireflies) {
        var FIREFLY_COUNT = 34;
        for (var i = 0; i < FIREFLY_COUNT; i++) {
          var dot = document.createElement("span");
          dot.className = "firefly";
          var size = 4 + Math.random() * 5;
          dot.style.width = size + "px";
          dot.style.height = size + "px";
          dot.style.left = Math.random() * 100 + "%";
          dot.style.top = Math.random() * 100 + "%";
          var angle = Math.random() * Math.PI * 2;
          var dist = 22 + Math.random() * 30;
          dot.style.setProperty("--dx", (Math.cos(angle) * dist).toFixed(1) + "px");
          dot.style.setProperty("--dy", (Math.sin(angle) * dist).toFixed(1) + "px");
          dot.style.animationDuration =
            (1.4 + Math.random() * 2).toFixed(2) + "s, " + (5 + Math.random() * 6).toFixed(2) + "s";
          dot.style.animationDelay =
            (Math.random() * 3).toFixed(2) + "s, " + (Math.random() * 5).toFixed(2) + "s";
          curtainFireflies.appendChild(dot);
        }
      }

      var DURATION = 20000; // 展開總時長（毫秒）
      var HOLD = 500; // 展開前先停留一下
      var TARGET_HOLE = 62; // 最終「洞」的大小（畫面對角線的百分比），洞外留下森林邊框
      var FEATHER = 3; // 邊緣羽化寬度（百分比）

      function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
      }

      function setHole(percent) {
        var stop1 = percent.toFixed(2) + "%";
        var stop2 = (percent + FEATHER).toFixed(2) + "%";
        var gradient =
          "radial-gradient(circle at center, transparent " + stop1 + ", #000 " + stop2 + ")";
        curtainFrame.style.maskImage = gradient;
        curtainFrame.style.webkitMaskImage = gradient;
      }

      setHole(1);

      setTimeout(function () {
        var start = null;
        function step(ts) {
          if (!start) start = ts;
          var t = Math.min(1, (ts - start) / DURATION);
          setHole(1 + easeOutCubic(t) * (TARGET_HOLE - 1));
          if (t < 1) {
            requestAnimationFrame(step);
          } else {
            curtain.classList.add("curtain-show-btn");
          }
        }
        requestAnimationFrame(step);
      }, HOLD);
    }

    if (curtainEnterBtn) {
      curtainEnterBtn.addEventListener("click", dismissCurtain);
    }
  }
});
