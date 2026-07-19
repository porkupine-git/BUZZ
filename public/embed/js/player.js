/* ═══════════════════════════════════════════════════════════════
   Aniko Embed Player — Full-Featured HLS Player
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  // For local testing, set HF_URL in your browser's localStorage to avoid leaking it in GitHub.
  // Production relies on Cloudflare _redirects proxying.
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_BASE = isLocal ? (window.localStorage.getItem('HF_URL') || '') : '';

  // ─── Anti-Direct-Access ─────────────────────────────────────
  // Prevent users from opening the embed link directly in a browser tab.
  if (window.self === window.top && !isLocal) {
    document.body.innerHTML = `
      <div style="background:#0f0f14;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px;">
        <h2 style="margin-bottom:10px;">🚫 Direct Access Not Allowed</h2>
        <p style="color:#a0a0b0;margin-bottom:20px;">This video player can only be embedded on other websites.</p>
        <a href="/" style="background:#5a5eb9;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;font-weight:600;">Go to Aniko Embed Docs</a>
      </div>
    `;
    return;
  }

  // ─── Parse URL & Config ─────────────────────────────────────
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  let mode, config;
  const pathParts = window.location.pathname.split('/').filter(Boolean);

  if (pathParts[0] === 'embed' && pathParts[1] === 'ani') {
    mode = "anime";
    config = {
      anilistId: pathParts[2],
      epNum: pathParts[3],
      audio: pathParts[4] || 'sub'
    };
  } else if (pathParts[0] === 'embed' && pathParts[1] === 'url') {
    mode = "direct";
    config = {
      url: params.get("url"),
      referer: params.get("referer") || "",
    };
  } else if (params.get("anilistId")) {
    mode = "anime";
    config = {
      anilistId: params.get("anilistId"),
      epNum: params.get("epNum") || "1",
      audio: params.get("audio") || "sub"
    };
  } else {
    // Fallback or old token
    mode = "anime";
    config = { token: params.get("token") };
  }

  // Apply custom accent color from query param
  const accent = params.get("color");
  if (accent) {
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty(
      "--accent-glow",
      accent + "66"
    );
  }

  // ─── DOM References ─────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const video = $("video");
  const wrapper = $("player-wrapper");
  const clickArea = $("click-area");
  const overlayLoading = $("overlay-loading");
  const overlayError = $("overlay-error");
  const errorMessage = $("error-message");
  const retryBtn = $("retry-btn");
  const centerIndicator = $("center-indicator");
  const ciPlay = $("ci-play");
  const ciPause = $("ci-pause");
  const topBar = $("top-bar");
  const videoTitle = $("video-title");
  const skipIntroBtn = $("skip-intro-btn");
  const skipOutroBtn = $("skip-outro-btn");
  const dtLeft = $("dt-left");
  const dtRight = $("dt-right");
  const controls = $("controls");
  const seekContainer = $("seek-container");
  const seekBuffered = $("seek-buffered");
  const seekPlayed = $("seek-played");
  const seekThumb = $("seek-thumb");
  const seekTooltip = $("seek-tooltip");
  const seekHlIntro = $("seek-hl-intro");
  const seekHlOutro = $("seek-hl-outro");
  const timeDisplay = $("time-display");
  const btnRewind = $("btn-rewind");
  const btnPlay = $("btn-play");
  const btnForward = $("btn-forward");
  const iconPlay = $("icon-play");
  const iconPause = $("icon-pause");
  const btnMute = $("btn-mute");
  const iconVolHigh = $("icon-vol-high");
  const iconVolLow = $("icon-vol-low");
  const iconVolMute = $("icon-vol-mute");
  const volumeArea = $("volume-area");
  const btnServers = $("btn-servers");
  const menuServers = $("menu-servers");
  const serverOptions = $("server-options");
  const btnSpeed = $("btn-speed");
  const speedLabel = $("speed-label");
  const menuSpeed = $("menu-speed");
  const speedOptions = $("speed-options");
  const btnSettings = $("btn-settings");
  const menuSettings = $("menu-settings");
  const panelMain = $("panel-main");
  const panelQuality = $("panel-quality");
  const panelAutoSkip = $("panel-autoskip");
  const btnOpenQuality = $("btn-open-quality");
  const btnOpenAutoSkip = $("btn-open-autoskip");
  const btnBackQuality = $("btn-back-quality");
  const btnBackAutoSkip = $("btn-back-autoskip");
  const valQuality = $("val-quality");
  const valAutoSkip = $("val-autoskip");
  const qualityOptions = $("quality-options");
  const qualityBadge = $("quality-badge");
  const subOptions = $("sub-options");
  const panelSubs = $("panel-subs");
  const btnOpenSubs = $("btn-open-subs");
  const btnBackSubs = $("btn-back-subs");
  const valSubs = $("val-subs");
  const btnAutoSkipOn = $("btn-autoskip-on");
  const btnAutoSkipOff = $("btn-autoskip-off");
  const btnSubs = $("btn-subs");
  const btnFullscreen = $("btn-fullscreen");
  const iconExpand = $("icon-expand");
  const iconCompress = $("icon-compress");

  // ─── State ──────────────────────────────────────────────────
  let hls = null;
  let allStreams = [];
  let hlsStreams = [];
  let currentStreamIndex = 0;
  let subtitleData = [];
  let introTime = null;
  let outroTime = null;
  let controlsTimer = null;
  let isSeeking = false;
  let savedVolume = 1;
  let activeMenu = null;
  let currentSpeed = 1;
  let currentQualityLevel = -1; // auto
  let activeSubTrack = -1;
  let isAutoSkip = localStorage.getItem("aniko_autoskip") === "true"; // Default false

  // ─── Utilities ──────────────────────────────────────────────
  function formatTime(s) {
    if (!isFinite(s) || s < 0) return "0:00";
    s = Math.floor(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0)
      return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function showLoading() {
    if (isSeeking) return;
    overlayLoading.classList.remove("hidden");
    overlayError.classList.add("hidden");
  }

  function hideLoading() {
    overlayLoading.classList.add("hidden");
  }

  function showError(msg) {
    overlayLoading.classList.add("hidden");
    overlayError.classList.remove("hidden");
    errorMessage.textContent = msg || "Stream unavailable";
  }

  function postMsg(type, data = {}) {
    try {
      window.parent.postMessage({ type: `aniko:${type}`, ...data }, "*");
    } catch (e) {
      /* ignore */
    }
  }

  // ─── Controls Visibility ────────────────────────────────────
  function showControls() {
    wrapper.classList.add("controls-visible");
    wrapper.classList.remove("controls-hidden");
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(hideControls, 3000);
  }

  function hideControls() {
    if (activeMenu) return; // don't hide if menu open
    wrapper.classList.remove("controls-visible");
    wrapper.classList.add("controls-hidden");
  }

  wrapper.addEventListener("mousemove", showControls);
  wrapper.addEventListener("mouseleave", () => {
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(hideControls, 1000);
  });

  // Touch support
  let lastTap = 0;
  let isTouchDevice = false;

  clickArea.addEventListener("touchstart", (e) => {
    isTouchDevice = true; // Mark as touch device to prevent click interference
    const now = Date.now();
    if (now - lastTap < 300) {
      // double tap → seek
      const rect = clickArea.getBoundingClientRect();
      const x = e.touches[0].clientX;
      if (x < rect.width / 2) {
        video.currentTime = Math.max(0, video.currentTime - 10);
        dtLeft.classList.remove("animate");
        void dtLeft.offsetWidth;
        dtLeft.classList.add("animate");
      } else {
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
        dtRight.classList.remove("animate");
        void dtRight.offsetWidth;
        dtRight.classList.add("animate");
      }
      e.preventDefault();
    } else {
      if (wrapper.classList.contains("controls-visible")) {
        hideControls();
      } else {
        showControls();
      }
    }
    lastTap = now;
  });

  // ─── Click Area → Play/Pause ────────────────────────────────
  clickArea.addEventListener("click", (e) => {
    // Ignore if touch (handled by touchstart)
    if (isTouchDevice) return;
    
    // Toggle play/pause for desktop users
    togglePlay();
  });

  function togglePlay() {
    if (video.paused) {
      video.play().catch(() => { });
    } else {
      video.pause();
    }
  }

  function flashIndicator(isPlaying) {
    ciPlay.classList.toggle("hidden", isPlaying);
    ciPause.classList.toggle("hidden", !isPlaying);
    centerIndicator.classList.remove("flash");
    void centerIndicator.offsetWidth; // reflow
    centerIndicator.classList.add("flash");
  }

  // ─── Play / Pause Button ────────────────────────────────────
  btnPlay.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePlay();
  });

  // ─── Skip 10s Buttons ───────────────────────────────────────
  if (btnRewind) {
    btnRewind.addEventListener("click", (e) => {
      e.stopPropagation();
      video.currentTime = Math.max(0, video.currentTime - 10);
      showControls();
    });
  }

  if (btnForward) {
    btnForward.addEventListener("click", (e) => {
      e.stopPropagation();
      video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
      showControls();
    });
  }

  video.addEventListener("play", () => {
    iconPlay.classList.add("hidden");
    iconPause.classList.remove("hidden");
    flashIndicator(true);
    showControls();
    postMsg("play");
  });

  video.addEventListener("pause", () => {
    iconPlay.classList.remove("hidden");
    iconPause.classList.add("hidden");
    flashIndicator(false);
    showControls();
    clearTimeout(controlsTimer);
    postMsg("pause");
  });

  video.addEventListener("ended", () => {
    postMsg("ended");
  });

  // ─── Seek Bar ───────────────────────────────────────────────
  function updateSeek() {
    if (isSeeking || !video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    seekPlayed.style.width = pct + "%";
    seekThumb.style.left = pct + "%";
    timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  }

  function updateBuffer() {
    if (!video.duration || !video.buffered.length) return;
    const end = video.buffered.end(video.buffered.length - 1);
    seekBuffered.style.width = (end / video.duration) * 100 + "%";
  }

  video.addEventListener("timeupdate", () => {
    updateSeek();
    checkSkipButtons();
    postMsg("timeupdate", {
      currentTime: video.currentTime,
      duration: video.duration,
    });
  });
  video.addEventListener("progress", updateBuffer);

  function updateHighlights() {
    if (!video.duration) return;

    if (introTime && introTime.end > 0 && seekHlIntro) {
      const startPct = (introTime.start / video.duration) * 100;
      const endPct = (introTime.end / video.duration) * 100;
      seekHlIntro.style.left = startPct + "%";
      seekHlIntro.style.width = (endPct - startPct) + "%";
      seekHlIntro.classList.remove("hidden");
    }

    if (outroTime && outroTime.end > 0 && seekHlOutro) {
      const startPct = (outroTime.start / video.duration) * 100;
      const endPct = (outroTime.end / video.duration) * 100;
      seekHlOutro.style.left = startPct + "%";
      seekHlOutro.style.width = (endPct - startPct) + "%";
      seekHlOutro.classList.remove("hidden");
    }
  }

  video.addEventListener("durationchange", updateHighlights);
  video.addEventListener("loadedmetadata", updateHighlights);

  // Seek interaction
  seekContainer.addEventListener("mousedown", startSeek);
  seekContainer.addEventListener("touchstart", startSeek, { passive: false });

  function startSeek(e) {
    e.preventDefault();
    isSeeking = true;
    doSeek(e);
    const moveHandler = (ev) => doSeek(ev);
    const upHandler = () => {
      isSeeking = false;
      if (video.readyState < 3) showLoading();
      document.removeEventListener("mousemove", moveHandler);
      document.removeEventListener("mouseup", upHandler);
      document.removeEventListener("touchmove", moveHandler);
      document.removeEventListener("touchend", upHandler);
    };
    document.addEventListener("mousemove", moveHandler);
    document.addEventListener("mouseup", upHandler);
    document.addEventListener("touchmove", moveHandler, { passive: false });
    document.addEventListener("touchend", upHandler);
  }

  function doSeek(e) {
    const rect = seekContainer.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seekPlayed.style.width = pct * 100 + "%";
    seekThumb.style.left = pct * 100 + "%";
    video.currentTime = pct * (video.duration || 0);
    timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  }

  // Seek tooltip on hover
  seekContainer.addEventListener("mousemove", (e) => {
    const rect = seekContainer.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * (video.duration || 0);
    seekTooltip.textContent = formatTime(time);
    seekTooltip.style.left = pct * 100 + "%";
  });

  // ─── Volume ─────────────────────────────────────────────────
  function updateVolumeIcon() {
    const v = video.volume;
    const m = video.muted;
    iconVolHigh.classList.add("hidden");
    iconVolLow.classList.add("hidden");
    iconVolMute.classList.add("hidden");
    if (m || v === 0) iconVolMute.classList.remove("hidden");
    else if (v < 0.5) iconVolLow.classList.remove("hidden");
    else iconVolHigh.classList.remove("hidden");
  }

  btnMute.addEventListener("click", (e) => {
    e.stopPropagation();
    if (video.muted) {
      video.muted = false;
      video.volume = savedVolume || 1; // Default to full volume
    } else {
      savedVolume = video.volume;
      video.muted = true;
    }
    updateVolumeIcon();
  });

  // ─── Fullscreen ─────────────────────────────────────────────
  btnFullscreen.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFullscreen();
  });

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapper.requestFullscreen().then(() => {
        // Attempt to lock screen orientation to landscape on mobile
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock("landscape").catch(() => {});
        }
      }).catch(() => { });
    }
  }

  document.addEventListener("fullscreenchange", () => {
    const fs = !!document.fullscreenElement;
    iconExpand.classList.toggle("hidden", fs);
    iconCompress.classList.toggle("hidden", !fs);
    
    // Unlock orientation when exiting fullscreen
    if (!fs && screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
  });

  // ─── Dropdown Menus ─────────────────────────────────────────
  function toggleMenu(menu) {
    if (activeMenu && activeMenu !== menu) {
      activeMenu.classList.add("hidden");
    }
    const isHidden = menu.classList.contains("hidden");
    menu.classList.toggle("hidden");
    activeMenu = isHidden ? menu : null;
  }

  function closeAllMenus() {
    [menuServers, menuSpeed, menuSettings].forEach((m) =>
      m.classList.add("hidden")
    );
    if (panelMain) {
      panelMain.classList.remove("hidden");
      panelQuality.classList.add("hidden");
      panelAutoSkip.classList.add("hidden");
      if (panelSubs) panelSubs.classList.add("hidden");
    }
    activeMenu = null;
  }

  if (btnOpenQuality) {
    btnOpenQuality.addEventListener("click", (e) => {
      e.stopPropagation();
      panelMain.classList.add("hidden");
      panelQuality.classList.remove("hidden");
    });
    btnOpenAutoSkip.addEventListener("click", (e) => {
      e.stopPropagation();
      panelMain.classList.add("hidden");
      panelAutoSkip.classList.remove("hidden");
    });
    btnBackQuality.addEventListener("click", (e) => {
      e.stopPropagation();
      panelQuality.classList.add("hidden");
      panelMain.classList.remove("hidden");
    });
    btnBackAutoSkip.addEventListener("click", (e) => {
      e.stopPropagation();
      panelAutoSkip.classList.add("hidden");
      panelMain.classList.remove("hidden");
    });
    if (btnOpenSubs) {
      btnOpenSubs.addEventListener("click", (e) => {
        e.stopPropagation();
        panelMain.classList.add("hidden");
        panelSubs.classList.remove("hidden");
      });
      btnBackSubs.addEventListener("click", (e) => {
        e.stopPropagation();
        panelSubs.classList.add("hidden");
        panelMain.classList.remove("hidden");
      });
    }
  }

  btnServers.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(menuServers);
  });
  btnSpeed.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(menuSpeed);
  });
  btnSettings.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu(menuSettings);
  });

  // Close menus on outside click
  wrapper.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown-anchor")) {
      closeAllMenus();
    }
  });

  // ─── Build Server Selector ─────────────────────────────────
  function buildServerMenu(streams) {
    serverOptions.innerHTML = "";
    streams.forEach((s, i) => {
      const btn = document.createElement("button");
      btn.className = "menu-option" + (i === currentStreamIndex ? " active" : "");
      btn.textContent = s.server || `Server ${i + 1}`;
      btn.addEventListener("click", () => {
        loadStream(i);
        closeAllMenus();
      });
      serverOptions.appendChild(btn);
    });
  }

  // ─── Build Quality Menu ─────────────────────────────────────
  function buildQualityMenu(levels) {
    qualityOptions.innerHTML = "";

    const isAuto = hls ? hls.autoLevelEnabled : (currentQualityLevel === -1);
    let autoText = "Auto";

    if (isAuto && hls && hls.currentLevel >= 0 && levels[hls.currentLevel]) {
      const lvl = levels[hls.currentLevel];
      const label = lvl.height >= 1080 ? "1080p" : lvl.height >= 720 ? "720p" : lvl.height >= 480 ? "480p" : lvl.height >= 360 ? "360p" : `${lvl.height}p`;
      autoText = `Auto (${label})`;
    }

    // Auto option
    const autoBtn = document.createElement("button");
    autoBtn.className = "menu-option" + (isAuto ? " active" : "");
    autoBtn.textContent = autoText;
    autoBtn.addEventListener("click", () => {
      if (hls) {
        hls.currentLevel = -1;
        currentQualityLevel = -1;
      }
      updateQualityMenu();
      closeAllMenus();
    });
    qualityOptions.appendChild(autoBtn);

    // Sort levels by height descending
    const sorted = levels
      .map((l, i) => ({ ...l, index: i }))
      .sort((a, b) => b.height - a.height);

    sorted.forEach((level) => {
      const btn = document.createElement("button");
      btn.className = "menu-option" + (!isAuto && currentQualityLevel === level.index ? " active" : "");
      const label = level.height >= 1080 ? "1080p" : level.height >= 720 ? "720p" : level.height >= 480 ? "480p" : level.height >= 360 ? "360p" : `${level.height}p`;
      btn.textContent = label;
      btn.addEventListener("click", () => {
        if (hls) {
          hls.currentLevel = level.index;
          currentQualityLevel = level.index;
        }
        updateQualityMenu();
        closeAllMenus();
      });
      qualityOptions.appendChild(btn);
    });

    // Show HD badge
    const maxHeight = Math.max(...levels.map((l) => l.height));
    if (maxHeight >= 720) {
      qualityBadge.textContent = maxHeight >= 1080 ? "FHD" : "HD";
      qualityBadge.classList.remove("hidden");
    }

    // Update Settings Panel Value
    if (valQuality) {
      if (isAuto) valQuality.textContent = autoText;
      else {
        const lvl = levels[currentQualityLevel];
        valQuality.textContent = lvl ? (lvl.height >= 1080 ? "1080p" : lvl.height >= 720 ? "720p" : lvl.height >= 480 ? "480p" : lvl.height >= 360 ? "360p" : `${lvl.height}p`) : "";
      }
    }
  }

  function updateQualityMenu() {
    if (hls) buildQualityMenu(hls.levels);
  }

  // ─── Build Speed Menu ──────────────────────────────────────
  const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  speeds.forEach((s) => {
    const btn = document.createElement("button");
    btn.className = "menu-option" + (s === 1 ? " active" : "");
    btn.textContent = s === 1 ? "Normal" : s + "x";
    btn.addEventListener("click", () => {
      video.playbackRate = s;
      currentSpeed = s;
      speedLabel.textContent = s === 1 ? "1x" : s + "x";
      speedOptions.querySelectorAll(".menu-option").forEach((b) =>
        b.classList.remove("active")
      );
      btn.classList.add("active");
      closeAllMenus();
    });
    speedOptions.appendChild(btn);
  });

  // ─── Build Captions Menu ────────────────────────────────────
  function buildSubMenu(subs) {
    subOptions.innerHTML = "";
    if (!subs || subs.length === 0) {
      valSubs.textContent = "Unavailable";
      btnOpenSubs.style.display = "none";
      return;
    }

    btnOpenSubs.style.display = "flex";

    // Off option
    const offBtn = document.createElement("button");
    offBtn.className = "menu-option" + (activeSubTrack === -1 ? " active" : "");
    offBtn.textContent = "Off";
    offBtn.addEventListener("click", () => {
      setSubTrack(-1);
      closeAllMenus();
    });
    subOptions.appendChild(offBtn);

    subs.forEach((sub, i) => {
      const btn = document.createElement("button");
      btn.className = "menu-option";
      btn.textContent = sub.label || `Track ${i + 1}`;
      btn.addEventListener("click", () => {
        setSubTrack(i);
        closeAllMenus();
      });
      subOptions.appendChild(btn);
    });
  }

  function setSubTrack(index) {
    activeSubTrack = index;
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = i === index ? "showing" : "hidden";
    }
    Array.from(subOptions.children).forEach((btn, i) => {
      btn.classList.toggle("active", i - 1 === index);
    });

    if (valSubs) {
      if (index === -1) {
        valSubs.textContent = "Off";
      } else if (subtitleData[index]) {
        valSubs.textContent = subtitleData[index].label || subtitleData[index].language || "On";
      }
    }
  }

  // ─── Skip Intro / Outro ────────────────────────────────────
  if (btnAutoSkipOn && btnAutoSkipOff) {
    if (valAutoSkip) valAutoSkip.textContent = isAutoSkip ? "On" : "Off";
    btnAutoSkipOn.classList.toggle("active", isAutoSkip);
    btnAutoSkipOff.classList.toggle("active", !isAutoSkip);

    btnAutoSkipOn.addEventListener("click", () => {
      isAutoSkip = true;
      localStorage.setItem("aniko_autoskip", "true");
      btnAutoSkipOn.classList.add("active");
      btnAutoSkipOff.classList.remove("active");
      if (valAutoSkip) valAutoSkip.textContent = "On";
      closeAllMenus();
    });
    btnAutoSkipOff.addEventListener("click", () => {
      isAutoSkip = false;
      localStorage.setItem("aniko_autoskip", "false");
      btnAutoSkipOff.classList.add("active");
      btnAutoSkipOn.classList.remove("active");
      if (valAutoSkip) valAutoSkip.textContent = "Off";
      closeAllMenus();
    });
  }

  function checkSkipButtons() {
    const t = video.currentTime;

    if (introTime && introTime.end > 0) {
      const inIntro = t >= introTime.start && t < introTime.end;
      if (inIntro && isAutoSkip) {
        video.currentTime = introTime.end;
        return;
      }
      if (!inIntro) skipIntroBtn.dataset.used = "false";
      const shouldShow = inIntro && skipIntroBtn.dataset.used !== "true";
      skipIntroBtn.classList.toggle("hidden", !shouldShow);
      skipIntroBtn.classList.toggle("visible", shouldShow);
    }

    if (outroTime && outroTime.end > 0) {
      const inOutro = t >= outroTime.start && t < outroTime.end;
      if (inOutro && isAutoSkip) {
        video.currentTime = outroTime.end;
        return;
      }
      if (!inOutro) skipOutroBtn.dataset.used = "false";
      const shouldShow = inOutro && skipOutroBtn.dataset.used !== "true";
      skipOutroBtn.classList.toggle("hidden", !shouldShow);
      skipOutroBtn.classList.toggle("visible", shouldShow);
    }
  }

  skipIntroBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    skipIntroBtn.dataset.used = "true";
    if (introTime) video.currentTime = introTime.end;
    skipIntroBtn.classList.add("hidden");
    skipIntroBtn.classList.remove("visible");
  });

  skipOutroBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    skipOutroBtn.dataset.used = "true";
    if (outroTime) video.currentTime = outroTime.end;
    skipOutroBtn.classList.add("hidden");
    skipOutroBtn.classList.remove("visible");
  });

  // ─── Stream Loading ─────────────────────────────────────────
  function loadStream(index) {
    currentStreamIndex = index;
    const stream = hlsStreams[index] || allStreams[index];

    if (!stream) {
      showError("No streams available");
      return;
    }

    showLoading();

    // Destroy existing HLS
    if (hls) {
      hls.destroy();
      hls = null;
    }

    // Update server menu active state
    serverOptions.querySelectorAll(".menu-option").forEach((btn, i) => {
      btn.classList.toggle("active", i === index);
    });

    let url;
    if (stream.type === "hls") {
      url = `${API_BASE}/api/proxy?url=${encodeURIComponent(stream.url)}&referer=${encodeURIComponent(stream.referer || "")}`;
    } else {
      url = stream.url;
    }

    if (stream.type === "embed") {
      // For embed-type streams, show in an iframe fallback
      hideLoading();
      video.style.display = "none";
      let iframe = wrapper.querySelector(".embed-fallback");
      if (!iframe) {
        iframe = document.createElement("iframe");
        iframe.className = "embed-fallback";
        iframe.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:none;z-index:4;";
        iframe.setAttribute("allowfullscreen", "");
        iframe.setAttribute("allow", "autoplay; picture-in-picture");
        wrapper.insertBefore(iframe, controls);
      }
      iframe.src = stream.url;
      return;
    }

    // Remove any embed fallback iframe
    const oldIframe = wrapper.querySelector(".embed-fallback");
    if (oldIframe) oldIframe.remove();
    video.style.display = "";

    if (Hls.isSupported()) {
      hls = new Hls({
        maxLoadingDelay: 4,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: true,
        fragLoadingTimeOut: 30000,
        manifestLoadingTimeOut: 30000,
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 6,
        startLevel: -1,
      });

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        hideLoading();
        buildQualityMenu(data.levels);
        addSubtitleTracks();
        if (!video.paused) {
          video.play().catch(() => {
            // Autoplay blocked by browser. Leave it paused with sound on.
            console.log("Autoplay with sound was blocked by the browser. Waiting for user interaction.");
          });
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.error("HLS fatal error:", data.type, data.details);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // Try next server
            if (currentStreamIndex < hlsStreams.length - 1) {
              console.log("Trying next server...");
              loadStream(currentStreamIndex + 1);
            } else {
              showError("Stream failed. Please try another server.");
            }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            showError("Playback error");
          }
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        if (hls.autoLevelEnabled) {
          updateQualityMenu();
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS (Safari)
      video.src = url;
      video.addEventListener(
        "loadedmetadata",
        () => {
          hideLoading();
          addSubtitleTracks();
          if (!video.paused) {
            video.play().catch(() => {
              console.log("Autoplay with sound was blocked by the browser. Waiting for user interaction.");
            });
          }
        },
        { once: true }
      );
      video.addEventListener(
        "error",
        () => {
          if (currentStreamIndex < hlsStreams.length - 1) {
            loadStream(currentStreamIndex + 1);
          } else {
            showError("Stream failed");
          }
        },
        { once: true }
      );
    } else {
      showError("HLS playback is not supported in this browser");
    }
  }

  // ─── Add Subtitle Tracks ───────────────────────────────────
  // Subtitle VTT files are on external CDNs (megastatics, etc.)
  // which don't send CORS headers. Since <video> has crossorigin,
  // the browser blocks them silently. We proxy through /api/proxy.
  function getSubReferer(sub) {
    // Map subtitle source to the correct referer domain
    const sourceMap = {
      megaplay: "https://megaplay.buzz/",
      vidwish: "https://vidwish.live/",
      vidtube: "https://vidtube.site/",
    };
    const key = (sub.source || "").toLowerCase();
    for (const [name, ref] of Object.entries(sourceMap)) {
      if (key.includes(name)) return ref;
    }
    // Fallback: use the current stream's referer or megaplay
    const stream = hlsStreams[currentStreamIndex] || allStreams[0];
    return stream?.referer || "https://megaplay.buzz/";
  }

  function addSubtitleTracks() {
    // Remove existing tracks
    video.querySelectorAll("track").forEach((t) => t.remove());

    let englishIndex = -1;
    let defaultIndex = -1;

    subtitleData.forEach((sub, i) => {
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = sub.label || `Track ${i + 1}`;
      track.srclang = sub.language || "en";

      const isEng = track.label.toLowerCase().includes("english") || track.label.toLowerCase().includes("eng") || track.srclang.toLowerCase() === "en";
      if (isEng && englishIndex === -1) englishIndex = i;
      if (sub.default) defaultIndex = i;

      // Proxy subtitle files to bypass CORS restrictions on external CDNs
      const referer = getSubReferer(sub);
      track.src = `${API_BASE}/api/proxy?url=${encodeURIComponent(sub.file)}&referer=${encodeURIComponent(referer)}`;
      video.appendChild(track);
    });

    if (activeSubTrack === -1) {
      if (englishIndex !== -1) {
        activeSubTrack = englishIndex;
      } else if (defaultIndex !== -1) {
        activeSubTrack = defaultIndex;
      }
    }

    // Set active subtitle after tracks are added
    setTimeout(() => {
      setSubTrack(activeSubTrack);
    }, 200);
  }

  // ─── Keyboard Shortcuts ─────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    // Don't handle if typing in an input
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    switch (e.key.toLowerCase()) {
      case " ":
      case "k":
        e.preventDefault();
        togglePlay();
        break;
      case "f":
        e.preventDefault();
        toggleFullscreen();
        break;
      case "m":
        e.preventDefault();
        btnMute.click();
        break;
      case "arrowleft":
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 10);
        showControls();
        break;
      case "arrowright":
        e.preventDefault();
        video.currentTime = Math.min(
          video.duration || 0,
          video.currentTime + 10
        );
        showControls();
        break;
      case "arrowup":
        e.preventDefault();
        video.volume = Math.min(1, video.volume + 0.1);
        volumeSlider.value = video.volume;
        video.muted = false;
        updateVolumeIcon();
        showControls();
        break;
      case "arrowdown":
        e.preventDefault();
        video.volume = Math.max(0, video.volume - 0.1);
        volumeSlider.value = video.volume;
        if (video.volume === 0) video.muted = true;
        updateVolumeIcon();
        showControls();
        break;
      case "c":
        e.preventDefault();
        // Toggle subtitles
        if (activeSubTrack >= 0) {
          setSubTrack(-1);
        } else if (subtitleData.length > 0) {
          setSubTrack(0);
        }
        break;
      case "p":
        e.preventDefault();
        btnPip.click();
        break;
      case "escape":
        closeAllMenus();
        break;
    }
  });

  // ─── PostMessage API (receive commands) ─────────────────────
  window.addEventListener("message", (e) => {
    if (!e.data || typeof e.data.type !== "string") return;
    const { type } = e.data;

    switch (type) {
      case "aniko:togglePlay":
        togglePlay();
        break;
      case "aniko:seek":
        if (typeof e.data.time === "number") {
          video.currentTime = e.data.time;
        }
        break;
      case "aniko:setVolume":
        if (typeof e.data.volume === "number") {
          video.volume = Math.max(0, Math.min(1, e.data.volume));
          volumeSlider.value = video.volume;
          video.muted = video.volume === 0;
          updateVolumeIcon();
        }
        break;
      case "aniko:setSpeed":
        if (typeof e.data.speed === "number") {
          video.playbackRate = e.data.speed;
          currentSpeed = e.data.speed;
          speedLabel.textContent = e.data.speed === 1 ? "1x" : e.data.speed + "x";
        }
        break;
      case "aniko:setQuality":
        if (hls && typeof e.data.level === "number") {
          hls.currentLevel = e.data.level;
          currentQualityLevel = e.data.level;
        }
        break;
    }
  });

  // ─── Video loading states ──────────────────────────────────
  video.addEventListener("waiting", showLoading);
  video.addEventListener("canplay", hideLoading);
  video.addEventListener("playing", hideLoading);

  // ─── Retry Button ──────────────────────────────────────────
  retryBtn.addEventListener("click", () => {
    overlayError.classList.add("hidden");
    init();
  });

  // ─── Initialization ─────────────────────────────────────────
  async function init() {
    showLoading();
    showControls();

    try {
      let data;

      if (mode === "direct") {
        if (!config.url) {
          showError("No URL provided");
          return;
        }
        data = {
          streams: [
            {
              url: config.url,
              type: "hls",
              server: "Direct",
              referer: config.referer,
              priority: 5,
            },
          ],
          subtitles: [],
          intro: { start: 0, end: 0 },
          outro: { start: 0, end: 0 },
        };
        videoTitle.textContent = "Direct Stream";
      } else {
        if (!config.anilistId) {
          throw new Error("Invalid Embed URL or Missing AniList ID");
        }

        const res = await fetch(
          `${API_BASE}/api/watch/${config.anilistId}/${config.audio}/${config.epNum}`
        );
        if (!res.ok) {
          const errRes = await res.json().catch(() => ({}));
          throw new Error(errRes.error || `API error: ${res.status}`);
        }

        const json = await res.json();
        if (json.error) throw new Error(json.error);

        const key = Object.keys(json)[0]; // 'ssub' or 'sdub'
        data = json[key];

        if (!data || !data.streams || data.streams.length === 0) {
          throw new Error("No streams found for this episode");
        }

        videoTitle.textContent = `Episode ${config.epNum} (${config.audio.toUpperCase()})`;
      }

      allStreams = data.streams || [];
      hlsStreams = allStreams.filter((s) => s.type === "hls");
      if (hlsStreams.length === 0) hlsStreams = allStreams; // fallback to all

      subtitleData = data.subtitles || [];
      introTime = data.intro && data.intro.end > 0 ? data.intro : null;
      outroTime = data.outro && data.outro.end > 0 ? data.outro : null;

      // Build UI
      buildServerMenu(hlsStreams);
      buildSubMenu(subtitleData);

      // Load first stream
      loadStream(0);

      // Signal ready to parent
      postMsg("ready", {
        streams: hlsStreams.length,
        subtitles: subtitleData.length,
        hasIntro: !!introTime,
        hasOutro: !!outroTime,
      });
    } catch (err) {
      console.error("Init error:", err);
      showError(err.message || "Failed to load stream");
    }
  }

  // ─── Start ──────────────────────────────────────────────────
  init();
})();
