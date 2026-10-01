/**
 * VIDEO PLAYER CONTROLLER FOR OTT TV
 * Powered by Hls.js with native fallback, auto-reconnect, and TV OSD
 */

class TVPlayer {
  constructor() {
    this.video = document.getElementById("main-video");
    this.container = document.getElementById("video-player-container");
    this.loader = document.getElementById("player-loader");
    this.errorBanner = document.getElementById("player-error");
    this.errorText = document.getElementById("player-error-text");
    this.retryBtn = document.getElementById("player-retry-btn");
    this.proxyBtn = document.getElementById("player-proxy-btn");
    
    // OSD elements
    this.osdTop = document.getElementById("osd-top");
    this.osdBottom = document.getElementById("osd-bottom");
    this.playPauseBtn = document.getElementById("osd-play-pause");
    this.progressBar = document.getElementById("osd-progress");
    this.progressFill = document.getElementById("osd-progress-fill");
    this.timeCurrent = document.getElementById("osd-time-current");
    this.timeTotal = document.getElementById("osd-time-total");
    this.volumeBtn = document.getElementById("osd-volume-btn");
    this.volumeSlider = document.getElementById("osd-volume-slider");
    this.fullscreenBtn = document.getElementById("osd-fullscreen-btn");
    this.pipBtn = document.getElementById("osd-pip-btn");
    this.aspectBtn = document.getElementById("osd-aspect-btn");
    this.qualityBtn = document.getElementById("osd-quality-btn");
    this.quickChannels = document.getElementById("player-quick-channels");

    // Subtitles OSD elements
    this.subtitlesBtn = document.getElementById("osd-subtitles-btn");
    this.subtitlesMenu = document.getElementById("osd-subtitles-menu");
    this.subtitlesList = document.getElementById("subtitles-tracks-list");
    this.btnLoadCustomSub = document.getElementById("btn-load-custom-sub");
    this.customSubInput = document.getElementById("custom-sub-file-input");
    this.subtitleOverlay = document.getElementById("player-subtitle-overlay");
    this.activeSubtitle = "off";
    this.activeCues = [];
    this.liveSubtitleInterval = null;
    this.hlsSubtitleTracks = [];

    this.hls = null;
    this.shakaPlayer = null;
    this.currentSource = null;
    this.currentChannel = null;
    this.isLive = true;
    this.osdTimeout = null;
    this.aspectModes = ["contain", "cover", "fill"];
    this.currentAspectIndex = 0;
    this.useProxy = true;

    if (window.shaka) {
      shaka.polyfill.installAll();
    }

    // Start muted for instant autoplay compliance, unmute on first user click/remote press
    this.video.muted = true;
    const unmuteOnFirstClick = () => {
      this.video.muted = false;
      this.updateVolumeIcon();
    };
    window.addEventListener("click", unmuteOnFirstClick, { once: true });
    window.addEventListener("keydown", unmuteOnFirstClick, { once: true });

    this.initEventListeners();
  }

  initEventListeners() {
    // Play / Pause
    if (this.playPauseBtn) {
      this.playPauseBtn.addEventListener("click", () => this.togglePlay());
    }

    // Video events
    this.video.addEventListener("play", () => this.updatePlayIcon(true));
    this.video.addEventListener("pause", () => this.updatePlayIcon(false));
    this.video.addEventListener("waiting", () => this.showLoader(true));
    this.video.addEventListener("playing", () => {
      this.showLoader(false);
      this.hideError();
    });
    this.video.addEventListener("timeupdate", () => this.onTimeUpdate());
    this.video.addEventListener("error", (e) => this.handleVideoError(e));

    // Progress bar seeking
    if (this.progressBar) {
      this.progressBar.addEventListener("click", (e) => {
        if (this.isLive) return;
        const rect = this.progressBar.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        if (!isNaN(this.video.duration)) {
          this.video.currentTime = pos * this.video.duration;
        }
      });
    }

    // Volume
    if (this.volumeSlider) {
      this.volumeSlider.addEventListener("input", (e) => {
        this.video.volume = parseFloat(e.target.value);
        this.video.muted = false;
        this.updateVolumeIcon();
      });
    }

    if (this.volumeBtn) {
      this.volumeBtn.addEventListener("click", () => {
        this.video.muted = !this.video.muted;
        this.updateVolumeIcon();
      });
    }

    // Fullscreen
    if (this.fullscreenBtn) {
      this.fullscreenBtn.addEventListener("click", () => this.toggleFullscreen());
    }

    // PiP
    if (this.pipBtn) {
      this.pipBtn.addEventListener("click", () => this.togglePiP());
    }

    // Aspect Ratio
    if (this.aspectBtn) {
      this.aspectBtn.addEventListener("click", () => this.cycleAspectRatio());
    }

    // Subtitles Menu
    if (this.subtitlesBtn) {
      this.subtitlesBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleSubtitlesMenu();
      });
    }

    if (this.btnLoadCustomSub && this.customSubInput) {
      this.btnLoadCustomSub.addEventListener("click", () => this.customSubInput.click());
      this.customSubInput.addEventListener("change", (e) => this.handleCustomSubtitle(e));
    }

    const btnSearchSub = document.getElementById("btn-search-sub");
    if (btnSearchSub) {
      btnSearchSub.addEventListener("click", () => {
        const title = this.currentChannel ? (this.currentChannel.currentProgram || this.currentChannel.name) : "Movie";
        window.open(`https://subdl.com/search/${encodeURIComponent(title)}`, '_blank');
      });
    }

    // Close menu on click outside
    document.addEventListener("click", (e) => {
      if (this.subtitlesMenu && !this.subtitlesMenu.contains(e.target) && e.target !== this.subtitlesBtn) {
        this.subtitlesMenu.classList.remove("active");
      }
    });

    // Listen for embedded broadcaster caption tracks (e.g. CEA-608 on HBO, Movies, Cable)
    if (this.video && this.video.textTracks) {
      this.video.textTracks.addEventListener("addtrack", (e) => {
        const track = e.track;
        track.mode = "hidden";
        track.addEventListener("cuechange", () => {
          if (this.activeSubtitle.startsWith("stream-") && track.activeCues && track.activeCues.length > 0) {
            const text = Array.from(track.activeCues).map(c => c.text).join('<br>');
            if (this.subtitleOverlay) {
              this.subtitleOverlay.innerHTML = text;
              this.subtitleOverlay.classList.add("active");
            }
          }
        });
      });
    }

    // OSD interaction
    this.container.addEventListener("mousemove", () => this.showOsd());
    this.container.addEventListener("click", (e) => {
      if (e.target === this.video) {
        this.togglePlay();
      }
      this.showOsd();
    });

    // Error retry buttons
    if (this.retryBtn) {
      this.retryBtn.addEventListener("click", () => {
        if (this.currentChannel) {
          this.loadChannel(this.currentChannel, false);
        } else if (this.currentSource) {
          this.loadStream(this.currentSource);
        }
      });
    }

    if (this.proxyBtn) {
      this.proxyBtn.addEventListener("click", () => {
        this.useProxy = !this.useProxy;
        if (this.currentChannel) {
          this.loadChannel(this.currentChannel, this.useProxy);
        }
      });
    }
  }

  resetEngines() {
    if (this.hls) {
      try { this.hls.destroy(); } catch (e) {}
      this.hls = null;
    }
    if (this.shakaPlayer) {
      try { this.shakaPlayer.destroy(); } catch (e) {}
      this.shakaPlayer = null;
    }
    try {
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();
    } catch (e) {}
  }

  base64urlToHex(b64url) {
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    try {
      const bin = atob(b64);
      let hex = '';
      for (let i = 0; i < bin.length; i++) {
        hex += bin.charCodeAt(i).toString(16).padStart(2, '0');
      }
      return hex.toLowerCase();
    } catch (e) {
      console.warn("Error decoding base64url:", e);
      return '';
    }
  }

  parseClearKeys(raw) {
    if (!raw) return null;
    const str = String(raw).trim();
    const result = {};

    // 1. Try JSON JWK format: { "keys": [ { "k": "...", "kid": "..." } ] }
    if (str.includes('"keys"') || str.includes("'keys'")) {
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed.keys)) {
          for (const item of parsed.keys) {
            if (item.kid && item.k) {
              const kidHex = this.base64urlToHex(item.kid);
              const keyHex = this.base64urlToHex(item.k);
              if (kidHex && keyHex) {
                result[kidHex] = keyHex;
              }
            }
          }
          if (Object.keys(result).length > 0) return result;
        }
      } catch (e) {}
    }

    // 2. Matches kid:key where kid and key are hex strings with optional dashes and quotes
    const hexPairRegex = /["']?([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}|[0-9a-f]{32})["']?\s*[:=]\s*["']?([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}|[0-9a-f]{32})["']?/gi;
    let match;
    while ((match = hexPairRegex.exec(str)) !== null) {
      const kid = match[1].replace(/-/g, '').toLowerCase();
      const key = match[2].replace(/-/g, '').toLowerCase();
      result[kid] = key;
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  loadChannel(channel, forceProxy = false) {
    this.currentChannel = channel;
    this.isLive = true;
    this.hideError();
    this.showLoader(true);

    // Update OSD info
    document.getElementById("osd-channel-name").textContent = channel.name;
    const progText = channel.currentProgram || "Live Stream Broadcast";
    const timeText = (channel.programStart && channel.programEnd) ? ` (${channel.programStart} - ${channel.programEnd})` : "";
    document.getElementById("osd-channel-program").textContent = progText + timeText;

    const osdNext = document.getElementById("osd-channel-next");
    if (osdNext) {
      if (channel.nextProgram) {
        osdNext.textContent = `Next: ${channel.nextProgram}`;
        osdNext.style.display = "block";
      } else {
        osdNext.style.display = "none";
      }
    }

    const statusBadge = document.getElementById("osd-status-badge");
    if (statusBadge) statusBadge.textContent = `${channel.resolution || "1080P"} • LIVE`;

    const osdLogo = document.getElementById("osd-channel-logo");
    if (osdLogo) osdLogo.src = channel.logo;

    const isDash = channel.streamUrl.includes(".mpd");
    let targetUrl = channel.streamUrl;

    // For HLS streams, route initial manifest through proxy.php. For DASH, Shaka's request filter routes manifests & segments.
    if (!isDash && (forceProxy || channel.forceProxy || this.useProxy) && window.location.protocol.startsWith('http')) {
      targetUrl = `proxy.php?url=${encodeURIComponent(channel.streamUrl)}`;
      if (channel.referer) {
        targetUrl += `&referer=${encodeURIComponent(channel.referer)}`;
      }
      if (channel.userAgent) {
        targetUrl += `&ua=${encodeURIComponent(channel.userAgent)}`;
      }
    }

    this.playStreamUrl(targetUrl, channel.fallbackUrl, channel);
  }

  loadVod(item) {
    this.currentChannel = null;
    this.isLive = false;
    this.hideError();
    this.showLoader(true);

    document.getElementById("osd-channel-name").textContent = item.title;
    document.getElementById("osd-channel-program").textContent = `${item.year || "HD"} • ${item.genre || "Cinema"}`;
    const statusBadge = document.getElementById("osd-status-badge");
    if (statusBadge) statusBadge.textContent = `${item.quality || "HD"} • VOD`;

    const osdLogo = document.getElementById("osd-channel-logo");
    if (osdLogo) osdLogo.src = item.poster;

    const streamUrl = item.hlsUrl || item.streamUrl;
    this.playStreamUrl(streamUrl, null, null);
  }

  playStreamUrl(url, fallbackUrl = null, channel = null) {
    this.currentSource = url;
    this.fallbackUrl = fallbackUrl;
    const curChan = channel || this.currentChannel;

    this.resetEngines();

    const isDash = url.includes(".mpd") || (curChan && curChan.streamUrl && curChan.streamUrl.includes(".mpd"));

    if (isDash) {
      this.playDashWithShaka(url, fallbackUrl, curChan);
    } else {
      this.playHls(url, fallbackUrl, curChan);
    }

    this.showOsd();
  }

  async playDashWithShaka(url, fallbackUrl = null, channel = null) {
    if (!window.shaka) {
      console.warn("Shaka player not available, falling back to native or HLS");
      this.playHls(url, fallbackUrl, channel);
      return;
    }

    if (typeof shaka.polyfill !== 'undefined') {
      shaka.polyfill.installAll();
    }

    try {
      this.shakaPlayer = new shaka.Player(this.video);
      if (typeof this.shakaPlayer.setVideoContainer === 'function') {
        this.shakaPlayer.setVideoContainer(this.container);
      }

      // Register network filter to proxy external segments & license calls (no double proxying)
      const curChan = channel || this.currentChannel;
      this.shakaPlayer.getNetworkingEngine().registerRequestFilter((type, request) => {
        const uri = request.uris[0];
        if (uri && !uri.includes("proxy.php") && (uri.startsWith("http://") || uri.startsWith("https://"))) {
          let proxied = `proxy.php?url=${encodeURIComponent(uri)}`;
          if (curChan && curChan.referer) {
            proxied += `&referer=${encodeURIComponent(curChan.referer)}`;
          }
          if (curChan && curChan.userAgent) {
            proxied += `&ua=${encodeURIComponent(curChan.userAgent)}`;
          }
          request.uris[0] = proxied;
        }
      });

      // ClearKey DRM configuration
      const clearKeys = this.parseClearKeys(curChan ? curChan.licenseKey : null);
      const playerConfig = {
        abr: {
          enabled: true,
          defaultBandwidthEstimate: 10000000, // 10 Mbps estimate forces instant HD track selection
          switchInterval: 1
        },
        streaming: {
          alwaysStreamText: true,
          bufferingGoal: 6,
          rebufferingGoal: 1.5,
          bufferBehind: 15,
          stallEnabled: true,
          stallThreshold: 4,
          retryParameters: {
            maxAttempts: 3,
            baseDelay: 1000,
            backoffFactor: 2,
            fuzzFactor: 0.5,
            timeout: 15000
          }
        },
        manifest: {
          dash: {
            ignoreMinBufferTime: true,
            autoCorrectDrift: true
          },
          retryParameters: {
            maxAttempts: 3,
            baseDelay: 1000,
            backoffFactor: 2,
            fuzzFactor: 0.5,
            timeout: 15000
          }
        }
      };

      if (clearKeys && Object.keys(clearKeys).length > 0) {
        playerConfig.drm = {
          clearKeys: clearKeys,
          preferredKeySystems: ['org.w3.clearkey']
        };
        console.log("Configured Shaka ClearKey DRM for channel:", curChan ? curChan.name : "", clearKeys);
      }

      this.shakaPlayer.configure(playerConfig);

      this.shakaPlayer.addEventListener('error', (event) => {
        const err = event.detail;
        console.error("Shaka error event:", err);
        if (this.fallbackUrl && this.fallbackUrl !== url) {
          console.log("Switching to fallback URL:", this.fallbackUrl);
          const alt = this.fallbackUrl;
          this.fallbackUrl = null;
          this.playStreamUrl(alt, null, curChan);
        } else {
          this.showError(`Stream error (${err.code || 'Network/DRM'}): Broadcast temporarily offline.`);
        }
      });

      await this.shakaPlayer.load(url);
      console.log("Shaka loaded DASH stream successfully:", url);

      // Force highest available resolution track (HD guarantee)
      try {
        const variantTracks = this.shakaPlayer.getVariantTracks();
        if (variantTracks && variantTracks.length > 0) {
          const highestTrack = variantTracks.reduce((prev, curr) =>
            ((curr.height || 0) > (prev.height || 0) || (curr.bandwidth > prev.bandwidth)) ? curr : prev, variantTracks[0]);
          if (highestTrack && highestTrack.id !== undefined) {
            console.log("Auto-selected highest HD track:", highestTrack.height + "p", highestTrack.bandwidth, "bps");
            this.shakaPlayer.selectVariantTrack(highestTrack, /* clearBuffer= */ false);
          }
        }
      } catch (trackErr) {
        console.warn("Could not auto-select highest track:", trackErr);
      }

      this.showLoader(false);
      this.hideError();

      // Auto-detect & enable embedded broadcast subtitles (Malay / English / Chinese)
      try {
        const textTracks = this.shakaPlayer.getTextTracks();
        console.log("Shaka text tracks detected:", textTracks);
        if (textTracks && textTracks.length > 0) {
          this.shakaPlayer.setTextTrackVisibility(true);
          const prefSub = textTracks.find(t => ['may', 'ms'].includes((t.language || '').toLowerCase())) ||
                          textTracks.find(t => ['eng', 'en'].includes((t.language || '').toLowerCase())) ||
                          textTracks[0];
          if (prefSub) {
            const idx = textTracks.indexOf(prefSub);
            this.shakaPlayer.selectTextTrack(prefSub);
            this.activeSubtitle = `shaka-${idx}`;
            if (this.subtitlesBtn) this.subtitlesBtn.classList.add("active");
            console.log("Auto-enabled broadcast subtitle track:", prefSub.language, prefSub.label, idx);
          }
        }
      } catch (subErr) {
        console.warn("Could not auto-enable subtitle:", subErr);
      }

      try {
        await this.video.play();
      } catch (e) {
        console.warn("Autoplay blocked, user interaction required:", e);
        this.updatePlayIcon(false);
      }

    } catch (error) {
      console.error("Failed to load DASH stream with Shaka:", error);
      if (this.fallbackUrl && this.fallbackUrl !== url) {
        console.log("Switching to fallback URL:", this.fallbackUrl);
        const alt = this.fallbackUrl;
        this.fallbackUrl = null;
        this.playStreamUrl(alt, null, channel);
      } else {
        this.showError("Unable to reach stream server. It may be geo-restricted or offline.");
      }
    }
  }

  playHls(url, fallbackUrl = null, channel = null) {
    const isHls = url.includes(".m3u8") || url.includes("manifest") || url.includes("proxy.php");

    if (isHls && window.Hls && Hls.isSupported()) {
      this.hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        enableCEA708Captions: true,
        renderTextTracksNatively: false,
        backBufferLength: 60,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        manifestLoadingTimeOut: 12000,
        levelLoadingTimeOut: 12000
      });

      this.hls.loadSource(url);
      this.hls.attachMedia(this.video);

      this.hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        this.populateQualityLevels(data.levels);
        this.video.play().catch(() => {
          this.showLoader(false);
          this.updatePlayIcon(false);
        });
      });

      this.hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn("HLS fatal network error, attempting recovery...", data);
              if (this.fallbackUrl && this.fallbackUrl !== url) {
                console.log("Switching to fallback URL:", this.fallbackUrl);
                const alt = this.fallbackUrl;
                this.fallbackUrl = null;
                this.playStreamUrl(alt, null, channel);
              } else if (!this.useProxy && (channel || this.currentChannel)) {
                console.log("Retrying stream via Laragon PHP Proxy...");
                this.useProxy = true;
                this.loadChannel(channel || this.currentChannel, true);
              } else {
                this.showError("Unable to reach stream server. It may be geo-restricted or offline.");
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn("HLS fatal media error, recovering...", data);
              this.hls.recoverMediaError();
              break;
            default:
              this.showError("Playback error occurred.");
              if (this.hls) this.hls.destroy();
              break;
          }
        }
      });
    } else if (this.video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native Safari / iOS / Smart TV HLS
      this.video.src = url;
      this.video.play().catch(e => console.log("Autoplay muted:", e));
    } else {
      // Regular MP4 / WebM
      this.video.src = url;
      this.video.play().catch(e => console.log("Autoplay muted:", e));
    }
  }

  populateQualityLevels(levels) {
    if (!this.qualityBtn) return;
    if (!levels || levels.length <= 1) {
      this.qualityBtn.style.display = "none";
      return;
    }
    this.qualityBtn.style.display = "flex";
  }

  togglePlay() {
    if (this.video.paused) {
      this.video.play();
    } else {
      this.video.pause();
    }
    this.showOsd();
  }

  updatePlayIcon(isPlaying) {
    if (!this.playPauseBtn) return;
    this.playPauseBtn.innerHTML = isPlaying 
      ? '<i class="fa-solid fa-pause"></i>' 
      : '<i class="fa-solid fa-play"></i>';
  }

  showLoader(show) {
    if (this.loader) {
      this.loader.classList.toggle("active", show);
    }
  }

  showError(message) {
    this.showLoader(false);
    if (this.errorBanner) {
      this.errorBanner.classList.add("active");
      if (this.errorText) {
        this.errorText.textContent = message;
      }
    }
  }

  hideError() {
    if (this.errorBanner) {
      this.errorBanner.classList.remove("active");
    }
  }

  handleVideoError(e) {
    console.error("HTML5 video error:", e);
    if (this.fallbackUrl) {
      const alt = this.fallbackUrl;
      this.fallbackUrl = null;
      this.playStreamUrl(alt);
    } else {
      this.showError("Failed to load video stream.");
    }
  }

  onTimeUpdate() {
    this.updateSubtitleOverlay();

    if (this.isLive) {
      if (this.timeCurrent) this.timeCurrent.textContent = "LIVE";
      if (this.timeTotal) this.timeTotal.textContent = "BROADCAST";
      if (this.progressFill) this.progressFill.style.width = "100%";
      return;
    }

    const cur = this.video.currentTime || 0;
    const dur = this.video.duration || 0;

    if (this.timeCurrent) this.timeCurrent.textContent = this.formatTime(cur);
    if (this.timeTotal) this.timeTotal.textContent = this.formatTime(dur);

    if (this.progressFill && dur > 0) {
      this.progressFill.style.width = `${(cur / dur) * 100}%`;
    }
  }

  formatTime(seconds) {
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor(seconds / 3600);
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  updateVolumeIcon() {
    if (!this.volumeBtn) return;
    if (this.video.muted || this.video.volume === 0) {
      this.volumeBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
    } else if (this.video.volume < 0.5) {
      this.volumeBtn.innerHTML = '<i class="fa-solid fa-volume-low"></i>';
    } else {
      this.volumeBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.container.requestFullscreen().catch(err => {
        console.warn("Fullscreen request error:", err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  togglePiP() {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled) {
      this.video.requestPictureInPicture();
    }
  }

  cycleAspectRatio() {
    this.currentAspectIndex = (this.currentAspectIndex + 1) % this.aspectModes.length;
    const mode = this.aspectModes[this.currentAspectIndex];
    this.video.style.objectFit = mode;
    if (this.aspectBtn) {
      this.aspectBtn.setAttribute("title", `Aspect: ${mode.toUpperCase()}`);
    }
  }

  showOsd() {
    if (this.osdTop) this.osdTop.classList.add("visible");
    if (this.osdBottom) this.osdBottom.classList.add("visible");

    clearTimeout(this.osdTimeout);
    this.osdTimeout = setTimeout(() => {
      if (!this.video.paused) {
        if (this.osdTop) this.osdTop.classList.remove("visible");
        if (this.osdBottom) this.osdBottom.classList.remove("visible");
      }
    }, 4000);
  }

  toggleQuickChannels() {
    if (this.quickChannels) {
      this.quickChannels.classList.toggle("open");
    }
  }

  // ========================================================================
  // SUBTITLES & AUDIO SUBSYSTEM (On-Screen High Contrast Display)
  // ========================================================================
  toggleSubtitlesMenu() {
    if (!this.subtitlesMenu) return;
    const isOpen = this.subtitlesMenu.classList.toggle("active");
    if (isOpen) {
      this.renderSubtitlesMenu();
    }
  }

  renderSubtitlesMenu() {
    if (!this.subtitlesList) return;
    this.subtitlesList.innerHTML = "";

    const tracks = [
      { id: "off", label: "Off (Disable Subtitles)", icon: "fa-ban" }
    ];

    let realStreamTracksFound = 0;

    // Detect Shaka DASH text tracks (Astro embeds Malay, Chinese, and English in DASH!)
    if (this.shakaPlayer) {
      try {
        const shakaTracks = this.shakaPlayer.getTextTracks();
        if (shakaTracks && shakaTracks.length > 0) {
          const langNames = {
            'may': 'Malay (Bahasa Melayu)',
            'ms': 'Malay (Bahasa Melayu)',
            'eng': 'English',
            'en': 'English',
            'chi': 'Chinese (中文)',
            'zho': 'Chinese (中文)',
            'zh': 'Chinese (中文)',
            'tam': 'Tamil (தமிழ்)'
          };
          shakaTracks.forEach((t, idx) => {
            realStreamTracksFound++;
            const langCode = (t.language || '').toLowerCase();
            const label = langNames[langCode] || t.label || `Subtitle Track (${(t.language || 'DASH').toUpperCase()})`;
            tracks.push({
              id: `shaka-${idx}`,
              label: label,
              icon: "fa-closed-captioning"
            });
          });
        }
      } catch (e) {}
    }

    // Detect actual broadcaster-embedded closed-caption tracks (e.g. CEA-608 on cable/satellite feeds)
    if (this.video && this.video.textTracks && this.video.textTracks.length > 0) {
      for (let i = 0; i < this.video.textTracks.length; i++) {
        const tr = this.video.textTracks[i];
        realStreamTracksFound++;
        tracks.push({
          id: `stream-${i}`,
          label: tr.label || `Broadcaster CC: ${(tr.language || 'Embedded').toUpperCase()}`,
          icon: "fa-satellite-dish"
        });
      }
    }

    // Detect HLS manifest WebVTT tracks
    if (this.hlsSubtitleTracks && this.hlsSubtitleTracks.length > 0) {
      this.hlsSubtitleTracks.forEach((t, idx) => {
        realStreamTracksFound++;
        tracks.push({
          id: `hls-${idx}`,
          label: t.name || `HLS Subtitle Track ${idx + 1}`,
          icon: "fa-closed-captioning"
        });
      });
    }

    // If custom subtitle loaded
    if (this.activeSubtitle === "custom" && this.customSubtitleName) {
      tracks.push({
        id: "custom",
        label: `File: ${this.customSubtitleName}`,
        icon: "fa-file-lines"
      });
    }

    tracks.forEach(track => {
      const item = document.createElement("button");
      const isActive = this.activeSubtitle === track.id;
      item.className = `osd-menu-item focusable ${isActive ? "active" : ""}`;
      item.tabIndex = 0;
      item.innerHTML = `
        <span><i class="fa-solid ${track.icon}"></i> ${track.label}</span>
        ${isActive ? '<i class="fa-solid fa-check" style="color:var(--primary);"></i>' : ''}
      `;

      item.addEventListener("click", () => {
        this.selectSubtitle(track.id);
        this.subtitlesMenu.classList.remove("active");
      });

      this.subtitlesList.appendChild(item);
    });

    // If no stream tracks exist, inform the user honestly
    if (realStreamTracksFound === 0 && this.activeSubtitle !== "custom") {
      const infoBox = document.createElement("div");
      infoBox.style.cssText = "padding: 8px 10px; font-size: 11px; color: var(--text-muted); line-height: 1.4; border-top: 1px solid var(--border-subtle); margin-top: 4px;";
      infoBox.innerHTML = `
        <i class="fa-solid fa-circle-info" style="color: var(--primary);"></i> 
        This stream does not carry embedded subtitles. Broadcaster didn't send CC packets. Load an <strong>.SRT</strong> file below.
      `;
      this.subtitlesList.appendChild(infoBox);
    }
  }

  selectSubtitle(trackId) {
    this.activeSubtitle = trackId;
    clearInterval(this.liveSubtitleInterval);

    if (trackId === "off") {
      if (this.hls) this.hls.subtitleTrack = -1;
      if (this.shakaPlayer) this.shakaPlayer.setTextTrackVisibility(false);
      if (this.subtitlesBtn) this.subtitlesBtn.classList.remove("active");
      if (this.subtitleOverlay) {
        this.subtitleOverlay.classList.remove("active");
        this.subtitleOverlay.textContent = "";
      }
      return;
    }

    if (this.subtitlesBtn) this.subtitlesBtn.classList.add("active");

    if (trackId.startsWith("shaka-")) {
      const idx = parseInt(trackId.replace("shaka-", ""), 10);
      if (this.shakaPlayer) {
        const textTracks = this.shakaPlayer.getTextTracks();
        if (textTracks && textTracks[idx]) {
          this.shakaPlayer.selectTextTrack(textTracks[idx]);
          this.shakaPlayer.setTextTrackVisibility(true);
          console.log("Selected Shaka subtitle track at index", idx, textTracks[idx]);
        }
      }
    } else if (trackId.startsWith("stream-")) {
      const trIdx = parseInt(trackId.replace("stream-", ""), 10);
      if (this.video && this.video.textTracks && this.video.textTracks[trIdx]) {
        for (let i = 0; i < this.video.textTracks.length; i++) {
          this.video.textTracks[i].mode = (i === trIdx) ? "showing" : "disabled";
        }
      }
    } else if (trackId.startsWith("hls-")) {
      const hlsIdx = parseInt(trackId.replace("hls-", ""), 10);
      if (this.hls) this.hls.subtitleTrack = hlsIdx;
    } else if (trackId === "custom") {
      this.updateSubtitleOverlay();
    }
  }

  updateSubtitleOverlay() {
    if (!this.subtitleOverlay) return;
    if (this.activeSubtitle === "off" || this.activeCues.length === 0) {
      this.subtitleOverlay.classList.remove("active");
      return;
    }

    const cur = this.video.currentTime || 0;
    const active = this.activeCues.find(c => cur >= c.start && cur <= c.end);
    if (active) {
      this.subtitleOverlay.textContent = active.text;
      this.subtitleOverlay.classList.add("active");
    } else {
      this.subtitleOverlay.classList.remove("active");
    }
  }

  handleCustomSubtitle(event) {
    const file = event.target.files[0];
    if (!file) return;

    this.customSubtitleName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      this.parseSubtitleFile(content);
      this.activeSubtitle = "custom";
      if (this.subtitlesBtn) this.subtitlesBtn.classList.add("active");
      if (this.subtitlesMenu) this.subtitlesMenu.classList.remove("active");
    };
    reader.readAsText(file);
  }

  parseSubtitleFile(content) {
    this.activeCues = [];
    clearInterval(this.liveSubtitleInterval);

    const parseTime = (tStr) => {
      const clean = tStr.replace(',', '.').trim();
      const parts = clean.split(':');
      if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
      } else if (parts.length === 2) {
        return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
      }
      return 0;
    };

    // If stream is live and video.currentTime is large (e.g. broadcast timestamp), align cues to start from current position
    const baseOffset = (this.isLive && this.video.currentTime > 60) ? this.video.currentTime : 0;

    // Regex for SRT blocks
    const srtRegex = /(\d+)\r?\n(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n*$)/g;
    let match;

    while ((match = srtRegex.exec(content)) !== null) {
      this.activeCues.push({
        start: parseTime(match[2]) + baseOffset,
        end: parseTime(match[3]) + baseOffset,
        text: match[4].replace(/\r?\n/g, ' ').trim()
      });
    }

    // Fallback parser for WebVTT or alternate formats
    if (this.activeCues.length === 0) {
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) {
          const times = lines[i].split('-->');
          let text = '';
          for (let j = i + 1; j < lines.length && lines[j].trim() !== ''; j++) {
            text += (text ? ' ' : '') + lines[j].trim();
          }
          if (text) {
            this.activeCues.push({
              start: parseTime(times[0]) + baseOffset,
              end: parseTime(times[1]) + baseOffset,
              text: text
            });
          }
        }
      }
    }

    this.updateSubtitleOverlay();
  }
}


