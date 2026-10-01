/**
 * MASTER APPLICATION CONTROLLER
 * Full 10-Foot TV Experience, Remote Control Key Navigation, VOD & Live Engine
 */

document.addEventListener("DOMContentLoaded", () => {
  // Initialize state
  const playlistMgr = new PlaylistManager();
  let channels = [...DEFAULT_CHANNELS];

  // Merge saved custom channels if available (or refresh if lacking ClearKey DRM or length mismatch)
  let savedChannels = playlistMgr.getSavedCustomChannels();
  const hasStaleChannels = savedChannels && (
    savedChannels.length !== DEFAULT_CHANNELS.length ||
    savedChannels.some(ch => (ch.streamUrl && ch.streamUrl.includes('.mpd') && !ch.licenseKey) || (ch.streamUrl && ch.streamUrl.includes('ptv2026')))
  );
  if (hasStaleChannels) {
    console.log("Refreshing older channel cache with fresh SQ2 channels...");
    playlistMgr.clearCustomChannels();
    savedChannels = null;
  }

  if (savedChannels && savedChannels.length > 0) {
    channels = [...savedChannels];
  }

  // Load saved favorites
  let favorites = JSON.parse(localStorage.getItem("ott_favorites") || "[]");

  // Instances
  const player = new TVPlayer();
  const epgEngine = new EPGEngine(channels, (ch) => selectChannel(ch));

  let currentCategory = "All Channels";
  let activeChannel = channels[0];
  let channelNumberBuffer = "";
  let channelBufferTimeout = null;

  // DOM Elements
  const sidebar = document.getElementById("app-sidebar");
  const navItems = document.querySelectorAll(".nav-item");
  const viewSections = document.querySelectorAll(".view-section");
  const categoriesList = document.getElementById("tv-categories-list");
  const channelsList = document.getElementById("tv-channels-list");
  const searchInput = document.getElementById("app-search-input");
  const clockTimeEl = document.getElementById("clock-time");
  const clockDateEl = document.getElementById("clock-date");
  const remoteToggleBtn = document.getElementById("virtual-remote-toggle");
  const remotePopup = document.getElementById("virtual-remote-popup");
  const vodMoviesGrid = document.getElementById("vod-movies-grid");
  const vodSeriesGrid = document.getElementById("vod-series-grid");
  const quickChannelsList = document.getElementById("quick-channels-list");

  // Modal Elements
  const movieModal = document.getElementById("movie-detail-modal");
  const seriesModal = document.getElementById("series-detail-modal");

  // 1. Clock Updater (Malaysia Time UTC+8)
  function updateClock() {
    const now = new Date();
    if (clockTimeEl) {
      clockTimeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    if (clockDateEl) {
      clockDateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    }
  }
  updateClock();
  setInterval(updateClock, 1000);

  // 2. Navigation & View Switching
  function switchView(viewName) {
    navItems.forEach(item => {
      item.classList.toggle("active", item.getAttribute("data-view") === viewName);
    });

    viewSections.forEach(section => {
      const isTarget = section.id === `view-${viewName}`;
      section.classList.toggle("active", isTarget);
    });

    if (viewName === "epg-guide") {
      epgEngine.render();
    }
  }

  navItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const view = item.getAttribute("data-view");
      switchView(view);
    });
  });

  // 3. Render Channel Categories
  function renderCategories() {
    if (!categoriesList) return;
    categoriesList.innerHTML = "";

    const categories = getChannelCategories(channels);

    categories.forEach(cat => {
      let count = 0;
      if (cat === "All Channels") {
        count = channels.length;
      } else if (cat === "Favorites") {
        count = favorites.length;
      } else {
        count = channels.filter(c => c.group === cat).length;
      }

      const btn = document.createElement("button");
      btn.className = `category-pill focusable ${cat === currentCategory ? "active" : ""}`;
      btn.tabIndex = 0;
      
      let icon = "fa-tv";
      if (cat === "Favorites") icon = "fa-heart";
      else if (cat.includes("MALAY")) icon = "fa-tv";
      else if (cat.includes("MOVIE")) icon = "fa-film";
      else if (cat.includes("NEWS")) icon = "fa-newspaper";
      else if (cat.includes("KID")) icon = "fa-child";
      else if (cat.includes("SPORT")) icon = "fa-futbol";

      btn.innerHTML = `
        <span class="cat-left">
          <i class="fa-solid ${icon}"></i>
          <span>${cat}</span>
        </span>
        <span class="cat-count">${count}</span>
      `;

      btn.addEventListener("click", () => {
        currentCategory = cat;
        renderCategories();
        renderChannels();
      });

      categoriesList.appendChild(btn);
    });
  }

  // 4. Render Channels
  let channelQualityFilter = "all"; // "all", "1080p", "fav"

  function renderChannels(filterText = "") {
    if (!channelsList) return;
    channelsList.innerHTML = "";

    let filtered = channels;

    // Category filter
    if (currentCategory === "Favorites") {
      filtered = filtered.filter(ch => favorites.includes(ch.id));
    } else if (currentCategory !== "All Channels") {
      filtered = filtered.filter(ch => ch.group === currentCategory);
    }

    // Quick Quality / Fav filter
    if (channelQualityFilter === "1080p") {
      filtered = filtered.filter(ch => (ch.resolution || "").toLowerCase().includes("1080"));
    } else if (channelQualityFilter === "fav") {
      filtered = filtered.filter(ch => favorites.includes(ch.id));
    }

    if (filterText) {
      const q = filterText.toLowerCase();
      filtered = filtered.filter(ch => 
        ch.name.toLowerCase().includes(q) || 
        ch.number.includes(q) ||
        (ch.group && ch.group.toLowerCase().includes(q))
      );
    }

    if (filtered.length === 0) {
      channelsList.innerHTML = `
        <div style="padding: 30px; text-align: center; color: var(--text-muted);">
          <i class="fa-solid fa-satellite-dish" style="font-size: 32px; margin-bottom: 10px;"></i>
          <p>No channels found</p>
        </div>
      `;
      return;
    }

    filtered.forEach((ch, index) => {
      const item = document.createElement("div");
      const isActive = activeChannel && activeChannel.id === ch.id;
      const isFav = favorites.includes(ch.id);

      item.className = `channel-item focusable ${isActive ? "active" : ""}`;
      item.tabIndex = 0;
      item.setAttribute("data-channel-id", ch.id);

      const timeSpan = (ch.programStart && ch.programEnd) ? `<span class="channel-prog-time">${ch.programStart}</span>` : '';
      const nextSpan = ch.nextProgram ? `<div class="channel-prog-next"><span style="opacity:0.6;">Next:</span> ${ch.nextProgram}</div>` : '';
      const progWidth = (ch.progress !== undefined && ch.progress !== null) ? ch.progress : 50;

      item.innerHTML = `
        <div class="channel-num">${ch.number}</div>
        <div class="channel-logo-wrap">
          <img src="${ch.logo}" alt="${ch.name}" onerror="this.src='https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?w=80&auto=format&fit=crop&q=80'">
        </div>
        <div class="channel-info">
          <div class="channel-name">${ch.name}</div>
          <div class="channel-now-program" title="${ch.currentProgram || 'Live TV'}">
            ${timeSpan}
            <span class="show-title-text">${ch.currentProgram || "Live TV"}</span>
          </div>
          <div class="channel-progress-mini" title="${progWidth}% elapsed">
            <div class="bar" style="width: ${progWidth}%;"></div>
          </div>
          ${nextSpan}
        </div>
        <div class="channel-badges">
          <span class="badge-res">${ch.resolution || "HD"}</span>
          <button class="btn-fav ${isFav ? "active" : ""}" title="Favorite">
            <i class="fa-${isFav ? 'solid' : 'regular'} fa-heart"></i>
          </button>
        </div>
      `;

      // Select channel on click
      item.addEventListener("click", (e) => {
        if (e.target.closest(".btn-fav")) {
          toggleFavorite(ch.id);
          return;
        }
        selectChannel(ch);
      });

      channelsList.appendChild(item);
    });

    renderQuickChannels(filtered);
  }

  // 5. Select & Play Channel
  function selectChannel(ch) {
    activeChannel = ch;
    player.loadChannel(ch);

    // Update active highlight in UI
    document.querySelectorAll(".channel-item").forEach(el => {
      el.classList.toggle("active", el.getAttribute("data-channel-id") === ch.id);
    });

    // Make sure live TV view is visible
    switchView("live-tv");
  }

  // 6. Favorites Toggle
  function toggleFavorite(channelId) {
    if (favorites.includes(channelId)) {
      favorites = favorites.filter(id => id !== channelId);
    } else {
      favorites.push(channelId);
    }
    localStorage.setItem("ott_favorites", JSON.stringify(favorites));
    renderCategories();
    renderChannels();
  }

  // 7. Quick Channel Drawer (during full-screen playback)
  function renderQuickChannels(list) {
    if (!quickChannelsList) return;
    quickChannelsList.innerHTML = "";

    list.slice(0, 15).forEach(ch => {
      const qItem = document.createElement("div");
      qItem.className = "channel-item focusable";
      qItem.tabIndex = 0;
      qItem.innerHTML = `
        <div class="channel-num">${ch.number}</div>
        <div class="channel-logo-wrap" style="width:36px; height:36px;">
          <img src="${ch.logo}" alt="${ch.name}">
        </div>
        <div class="channel-info">
          <div class="channel-name" style="font-size:13px;">${ch.name}</div>
          <div class="channel-now-program" style="font-size:11px;" title="${ch.currentProgram || 'Live TV'}">
            ${ch.programStart ? `<span style="color:var(--primary); font-size:10px; margin-right:4px;">${ch.programStart}</span>` : ''}
            <span>${ch.currentProgram || "Live TV"}</span>
          </div>
        </div>
      `;
      qItem.addEventListener("click", () => {
        selectChannel(ch);
        player.toggleQuickChannels();
      });
      quickChannelsList.appendChild(qItem);
    });
  }

  // 8. Render VOD Movies
  let selectedMovieGenre = "all";

  function renderVodMovies(genreFilter = "all") {
    if (!vodMoviesGrid) return;
    vodMoviesGrid.innerHTML = "";
    selectedMovieGenre = genreFilter;

    let list = VOD_MOVIES;
    if (genreFilter !== "all") {
      list = list.filter(m => m.genre.toLowerCase().includes(genreFilter.toLowerCase()));
    }

    if (list.length === 0) {
      vodMoviesGrid.innerHTML = `<div style="padding:40px; color:var(--text-muted); grid-column:1/-1;">No movies found for ${genreFilter}</div>`;
      return;
    }

    list.forEach(movie => {
      const card = document.createElement("div");
      card.className = "vod-card focusable";
      card.tabIndex = 0;

      card.innerHTML = `
        <div class="vod-card-badge"><i class="fa-solid fa-star"></i> ${movie.rating}</div>
        <img class="vod-card-poster" src="${movie.poster}" alt="${movie.title}" loading="lazy">
        <div class="vod-card-overlay">
          <div class="vod-card-title">${movie.title}</div>
          <div class="vod-card-meta">
            <span>${movie.year} • ${movie.genre.split('/')[0]}</span>
            <span class="badge-res">${movie.quality}</span>
          </div>
        </div>
      `;

      card.addEventListener("click", () => openMovieDetail(movie));
      vodMoviesGrid.appendChild(card);
    });
  }

  // Genre Filter Chips event listeners
  const genreChips = document.querySelectorAll("#vod-genre-chips .filter-chip");
  genreChips.forEach(chip => {
    chip.addEventListener("click", () => {
      genreChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      const g = chip.getAttribute("data-genre");
      renderVodMovies(g);
    });
  });

  // Channel Header Quick Filter Buttons
  const btnFilterAll = document.getElementById("filter-all-btn");
  const btnFilterHd = document.getElementById("filter-hd-btn");
  const btnFilterFav = document.getElementById("filter-fav-btn");

  [btnFilterAll, btnFilterHd, btnFilterFav].forEach(btn => {
    if (!btn) return;
    btn.addEventListener("click", () => {
      [btnFilterAll, btnFilterHd, btnFilterFav].forEach(b => b?.classList.remove("active"));
      btn.classList.add("active");
      if (btn === btnFilterAll) channelQualityFilter = "all";
      if (btn === btnFilterHd) channelQualityFilter = "1080p";
      if (btn === btnFilterFav) channelQualityFilter = "fav";
      renderChannels();
    });
  });

  function openMovieDetail(movie) {
    if (!movieModal) return;
    document.getElementById("modal-movie-title").textContent = movie.title;
    document.getElementById("modal-movie-meta").textContent = `${movie.year} • ${movie.duration} • ${movie.genre}`;
    document.getElementById("modal-movie-rating").innerHTML = `<i class="fa-solid fa-star"></i> ${movie.rating}/10`;
    document.getElementById("modal-movie-desc").textContent = movie.overview;
    document.getElementById("modal-movie-cast").textContent = `Cast: ${movie.cast} | Director: ${movie.director}`;
    document.getElementById("modal-movie-poster").src = movie.poster;

    const playBtn = document.getElementById("modal-movie-play-btn");
    playBtn.onclick = () => {
      movieModal.classList.remove("active");
      switchView("live-tv");
      player.loadVod(movie);
    };

    movieModal.classList.add("active");
  }

  // 9. Render VOD Series
  function renderVodSeries() {
    if (!vodSeriesGrid) return;
    vodSeriesGrid.innerHTML = "";

    VOD_SERIES.forEach(series => {
      const card = document.createElement("div");
      card.className = "vod-card focusable";
      card.tabIndex = 0;

      card.innerHTML = `
        <div class="vod-card-badge"><i class="fa-solid fa-star"></i> ${series.rating}</div>
        <img class="vod-card-poster" src="${series.poster}" alt="${series.title}" loading="lazy">
        <div class="vod-card-overlay">
          <div class="vod-card-title">${series.title}</div>
          <div class="vod-card-meta">
            <span>${series.episodesCount} Episodes • ${series.genre.split('/')[0]}</span>
            <span class="badge-res">${series.quality}</span>
          </div>
        </div>
      `;

      card.addEventListener("click", () => openSeriesDetail(series));
      vodSeriesGrid.appendChild(card);
    });
  }

  function openSeriesDetail(series) {
    if (!seriesModal) return;
    document.getElementById("modal-series-title").textContent = series.title;
    document.getElementById("modal-series-meta").textContent = `${series.episodesCount} Episodes • ${series.genre}`;
    document.getElementById("modal-series-desc").textContent = series.overview;
    document.getElementById("modal-series-poster").src = series.poster;

    const epList = document.getElementById("modal-series-episodes-list");
    epList.innerHTML = "";

    series.episodes.forEach(ep => {
      const epRow = document.createElement("div");
      epRow.className = "channel-item focusable";
      epRow.style.cursor = "pointer";
      epRow.tabIndex = 0;

      epRow.innerHTML = `
        <div style="width: 80px; height: 50px; border-radius: 6px; overflow: hidden; flex-shrink: 0; background: #000;">
          <img src="${ep.thumb}" style="width: 100%; height: 100%; object-fit: cover;">
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 700; color: #fff; font-size: 14px;">${ep.title}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${ep.duration} • ${ep.desc}</div>
        </div>
        <button class="osd-btn" style="width: 38px; height: 38px; background: var(--accent-gradient);">
          <i class="fa-solid fa-play" style="font-size: 13px;"></i>
        </button>
      `;

      epRow.addEventListener("click", () => {
        seriesModal.classList.remove("active");
        switchView("live-tv");
        player.loadVod({
          title: `${series.title} - ${ep.title}`,
          year: "Series",
          genre: series.genre,
          poster: ep.thumb,
          streamUrl: ep.streamUrl
        });
      });

      epList.appendChild(epRow);
    });

    seriesModal.classList.add("active");
  }

  // Close modals
  document.querySelectorAll(".modal-close-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".modal-backdrop").forEach(m => m.classList.remove("active"));
    });
  });

  // 10. Search Input Handler
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value;
      renderChannels(q);
    });
  }

  // 11. TV Remote D-Pad & Keyboard Controller
  document.addEventListener("keydown", (e) => {
    // If user is typing in an input field, do not hijack arrows
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      if (e.key === "Escape") {
        document.activeElement.blur();
      }
      return;
    }

    // Direct Channel Number Jumping (0-9)
    if (/^[0-9]$/.test(e.key)) {
      channelNumberBuffer += e.key;
      clearTimeout(channelBufferTimeout);
      
      const osdProgram = document.getElementById("osd-channel-program");
      if (osdProgram) osdProgram.textContent = `Jumping to Channel ${channelNumberBuffer}...`;
      player.showOsd();

      channelBufferTimeout = setTimeout(() => {
        const found = channels.find(c => c.number === channelNumberBuffer);
        if (found) {
          selectChannel(found);
          const card = document.querySelector(`.channel-item[data-channel-id="${found.id}"]`);
          if (card) {
            card.focus();
            card.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
        channelNumberBuffer = "";
      }, 1200);
      return;
    }

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        navigateFocus("up");
        break;
      case "ArrowDown":
        e.preventDefault();
        navigateFocus("down");
        break;
      case "ArrowLeft":
        e.preventDefault();
        navigateFocus("left");
        break;
      case "ArrowRight":
        e.preventDefault();
        navigateFocus("right");
        break;
      case "Enter":
      case "Select":
      case " ":
        if (document.activeElement && document.activeElement.classList.contains("focusable")) {
          document.activeElement.click();
        } else {
          player.togglePlay();
        }
        break;
      case "Escape":
      case "Backspace":
      case "GoBack":
        e.preventDefault();
        window.handleTvRemoteBack();
        break;
      case "ChannelUp":
      case "PageUp":
        e.preventDefault();
        window.handleTvChannelStep(-1);
        break;
      case "ChannelDown":
      case "PageDown":
        e.preventDefault();
        window.handleTvChannelStep(1);
        break;
      case "MediaPlayPause":
        e.preventDefault();
        player.togglePlay();
        break;
      case "MediaPlay":
        e.preventDefault();
        if (player.video) player.video.play();
        break;
      case "MediaPause":
        e.preventDefault();
        if (player.video) player.video.pause();
        break;
      case "Guide":
      case "EPG":
      case "e":
      case "E":
      case "i":
      case "I":
        e.preventDefault();
        window.handleTvToggleGuide();
        break;
      case "ContextMenu":
      case "Menu":
      case "m":
      case "M":
        e.preventDefault();
        window.handleTvToggleMenu();
        break;
      case "f":
      case "F":
        player.toggleFullscreen();
        break;
      case "c":
      case "C":
      case "s":
      case "S":
        player.toggleSubtitlesMenu();
        break;
    }
  });

  // ── Global TV Remote Interface Exposed for Android Native Key Dispatcher ──
  window.tvPlayer = player;

  window.handleTvRemoteBack = function() {
    // 1. Close open video details modal if present
    const openModal = document.querySelector(".modal-backdrop.active");
    if (openModal) {
      openModal.classList.remove("active");
      return true;
    }

    // 2. Close quick channels drawer if open
    const quickDrawer = document.getElementById("player-quick-channels");
    if (quickDrawer && quickDrawer.classList.contains("open")) {
      quickDrawer.classList.remove("open");
      return true;
    }

    // 3. Close subtitles menu if open
    const subMenu = document.getElementById("osd-subtitles-menu");
    if (subMenu && subMenu.classList.contains("active")) {
      subMenu.classList.remove("active");
      return true;
    }

    // 4. If in another view (EPG, Movies, Series, Settings), return to Live TV
    const activeView = document.querySelector(".view-section.active");
    if (activeView && activeView.id !== "view-live-tv") {
      switchView("live-tv");
      const activeCard = document.querySelector(".channel-item.active") || document.querySelector(".channel-item");
      if (activeCard) activeCard.focus();
      return true;
    }

    // 5. In Live TV: step back through UI zones (Player -> Channels -> Categories -> Sidebar)
    const current = document.activeElement;
    if (current) {
      if (current.closest(".tv-player-stage")) {
        const activeCard = document.querySelector(".channel-item.active") || document.querySelector(".channel-item");
        if (activeCard) { activeCard.focus(); return true; }
      } else if (current.closest(".tv-channels-pane")) {
        const activeCat = document.querySelector(".category-pill.active") || document.querySelector(".category-pill");
        if (activeCat) { activeCat.focus(); return true; }
      } else if (current.closest(".tv-categories-pane")) {
        const activeNav = document.querySelector(".nav-item.active") || document.querySelector(".nav-item");
        if (activeNav) { activeNav.focus(); return true; }
      }
    }

    // In sidebar: allow system to exit / minimize app
    return false;
  };

  window.handleTvChannelStep = function(step) {
    if (!channels || channels.length === 0) return;
    let idx = 0;
    if (activeChannel) {
      const curIdx = channels.findIndex(c => c.id === activeChannel.id);
      if (curIdx >= 0) idx = curIdx;
    }
    const nextIdx = (idx + step + channels.length) % channels.length;
    selectChannel(channels[nextIdx]);

    const card = document.querySelector(`.channel-item[data-channel-id="${channels[nextIdx].id}"]`);
    if (card) {
      card.focus();
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  window.handleTvToggleGuide = function() {
    const isGuide = document.getElementById("view-epg-guide")?.classList.contains("active");
    if (isGuide) {
      switchView("live-tv");
      const activeCard = document.querySelector(".channel-item.active") || document.querySelector(".channel-item");
      if (activeCard) activeCard.focus();
    } else {
      switchView("epg-guide");
    }
  };

  window.handleTvToggleMenu = function() {
    const quickDrawer = document.getElementById("player-quick-channels");
    if (quickDrawer) {
      quickDrawer.classList.toggle("open");
      if (quickDrawer.classList.contains("open")) {
        const firstQuick = quickDrawer.querySelector(".focusable");
        if (firstQuick) firstQuick.focus();
      }
    }
  };

  // ── True 2D Geometric Spatial Navigation Engine for Leanback Android TV ──
  function navigateFocus(direction) {
    // Collect all currently visible, focusable elements
    const allFocusables = Array.from(document.querySelectorAll(".focusable"))
      .filter(el => {
        if (!el || el.offsetParent === null) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
        // If modal open, restrict to modal elements
        const openModal = document.querySelector(".modal-backdrop.active");
        if (openModal) return openModal.contains(el);
        return true;
      });

    if (allFocusables.length === 0) return;

    const current = document.activeElement;
    if (!current || !allFocusables.includes(current)) {
      // Recovery: focus active channel card or first element
      const defaultEl = document.querySelector(".channel-item.active") || allFocusables[0];
      if (defaultEl) {
        defaultEl.focus();
        defaultEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    const curRect = current.getBoundingClientRect();
    const curCenter = {
      x: curRect.left + curRect.width / 2,
      y: curRect.top + curRect.height / 2
    };

    // 1. Logical Column/Zone Transitions for Live TV Split Layout
    const isInSidebar = current.closest("#app-sidebar");
    const isInCategories = current.closest(".tv-categories-pane");
    const isInChannels = current.closest(".tv-channels-pane");
    const isInStage = current.closest(".tv-player-stage");

    if (isInSidebar && direction === "right") {
      const cat = document.querySelector(".tv-categories-pane .category-pill.active") ||
                  document.querySelector(".tv-categories-pane .category-pill");
      if (cat) { cat.focus(); return; }
    } else if (isInCategories && direction === "left") {
      const nav = document.querySelector(".sidebar-menu .nav-item.active") ||
                  document.querySelector(".sidebar-menu .nav-item");
      if (nav) { nav.focus(); return; }
    } else if (isInCategories && direction === "right") {
      const chan = document.querySelector(".tv-channels-pane .channel-item.active") ||
                   document.querySelector(".tv-channels-pane .channel-item");
      if (chan) { chan.focus(); chan.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    } else if (isInChannels && direction === "left") {
      const cat = document.querySelector(".tv-categories-pane .category-pill.active") ||
                  document.querySelector(".tv-categories-pane .category-pill");
      if (cat) { cat.focus(); return; }
    } else if (isInChannels && direction === "right") {
      const stageBtn = document.getElementById("osd-play-pause") ||
                       document.getElementById("osd-fullscreen-btn") ||
                       document.querySelector(".tv-player-stage .focusable");
      if (stageBtn) { stageBtn.focus(); player.showOsd(); return; }
    } else if (isInStage && direction === "left") {
      const chan = document.querySelector(".tv-channels-pane .channel-item.active") ||
                   document.querySelector(".tv-channels-pane .channel-item");
      if (chan) { chan.focus(); chan.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    }

    // 2. Geometric 2D Euclidean Distance Matching
    const isHorizontal = (direction === "left" || direction === "right");
    let bestCandidate = null;
    let minDistance = Infinity;

    for (const cand of allFocusables) {
      if (cand === current) continue;
      const r = cand.getBoundingClientRect();
      const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };

      // Directional check
      let isValidDir = false;
      if (direction === "right" && c.x > curCenter.x + 8) isValidDir = true;
      else if (direction === "left" && c.x < curCenter.x - 8) isValidDir = true;
      else if (direction === "down" && c.y > curCenter.y + 8) isValidDir = true;
      else if (direction === "up" && c.y < curCenter.y - 8) isValidDir = true;

      if (!isValidDir) continue;

      const dx = c.x - curCenter.x;
      const dy = c.y - curCenter.y;

      // Penalize orthogonal deviations heavily to maintain straight line movement
      const dist = isHorizontal
        ? (Math.abs(dx) + Math.abs(dy) * 3.5)
        : (Math.abs(dy) + Math.abs(dx) * 3.5);

      if (dist < minDistance) {
        minDistance = dist;
        bestCandidate = cand;
      }
    }

    if (bestCandidate) {
      bestCandidate.focus();
      bestCandidate.scrollIntoView({ behavior: "smooth", block: "nearest" });

      // If moving within categories on TV, auto-render corresponding channels
      if (bestCandidate.classList.contains("category-pill")) {
        bestCandidate.click();
      }
    }
  }

  // 12. Virtual Remote Control Toggle & Buttons
  if (remoteToggleBtn && remotePopup) {
    remoteToggleBtn.addEventListener("click", () => {
      remotePopup.classList.toggle("active");
    });

    document.getElementById("remote-btn-up")?.addEventListener("click", () => navigateFocus("up"));
    document.getElementById("remote-btn-down")?.addEventListener("click", () => navigateFocus("down"));
    document.getElementById("remote-btn-left")?.addEventListener("click", () => navigateFocus("left"));
    document.getElementById("remote-btn-right")?.addEventListener("click", () => navigateFocus("right"));
    document.getElementById("remote-btn-ok")?.addEventListener("click", () => {
      if (document.activeElement && document.activeElement.classList.contains("focusable")) {
        document.activeElement.click();
      } else {
        player.togglePlay();
      }
    });
    document.getElementById("remote-btn-back")?.addEventListener("click", () => {
      const openModal = document.querySelector(".modal-backdrop.active");
      if (openModal) openModal.classList.remove("active");
      else switchView("live-tv");
    });
    document.getElementById("remote-btn-guide")?.addEventListener("click", () => switchView("epg-guide"));
    document.getElementById("remote-btn-fullscreen")?.addEventListener("click", () => player.toggleFullscreen());
  }

  // 13. Settings & Playlist Form Handlers
  const m3uForm = document.getElementById("form-m3u-import");
  if (m3uForm) {
    m3uForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const urlInput = document.getElementById("m3u-url-input");
      const statusDiv = document.getElementById("import-status");
      let url = urlInput.value.trim();

      if (!url) return;
      if (!url.startsWith("http://") && !url.startsWith("https://") && !url.endsWith(".m3u")) {
        url = "http://" + url;
      }

      statusDiv.innerHTML = `<span style="color:var(--primary);"><i class="fa-solid fa-spinner fa-spin"></i> Downloading and parsing playlist...</span>`;

      try {
        const isRemote = url.startsWith("http://") || url.startsWith("https://");
        const fetchUrl = (isRemote && window.location.protocol.startsWith('http')) 
          ? `proxy.php?url=${encodeURIComponent(url)}` 
          : url;
        const res = await fetch(fetchUrl);
        const text = await res.text();
        const parsed = playlistMgr.parseM3U(text);

        if (parsed.length > 0) {
          channels = [...parsed, ...DEFAULT_CHANNELS];
          playlistMgr.saveCustomChannels(parsed);
          renderCategories();
          renderChannels();
          statusDiv.innerHTML = `<span style="color:var(--accent-green);"><i class="fa-solid fa-check"></i> Successfully imported ${parsed.length} channels!</span>`;
          setTimeout(() => switchView("live-tv"), 1500);
        } else {
          statusDiv.innerHTML = `<span style="color:var(--accent-red);"><i class="fa-solid fa-triangle-exclamation"></i> No valid channels found in playlist.</span>`;
        }
      } catch (err) {
        statusDiv.innerHTML = `<span style="color:var(--accent-red);"><i class="fa-solid fa-triangle-exclamation"></i> Failed to download playlist: ${err.message}</span>`;
      }
    });
  }

  // Xtream Codes Form Handler
  const xtreamForm = document.getElementById("form-xtream-import");
  if (xtreamForm) {
    xtreamForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const server = document.getElementById("xtream-server").value.trim();
      const user = document.getElementById("xtream-user").value.trim();
      const pass = document.getElementById("xtream-pass").value.trim();
      const statusDiv = document.getElementById("xtream-status");

      statusDiv.innerHTML = `<span style="color:var(--primary);"><i class="fa-solid fa-spinner fa-spin"></i> Authenticating with Xtream server...</span>`;

      const result = await playlistMgr.fetchXtream(server, user, pass);
      if (result.success && result.channels.length > 0) {
        channels = [...result.channels, ...DEFAULT_CHANNELS];
        playlistMgr.saveCustomChannels(result.channels);
        renderCategories();
        renderChannels();
        statusDiv.innerHTML = `<span style="color:var(--accent-green);"><i class="fa-solid fa-check"></i> Connected! ${result.channels.length} channels loaded.</span>`;
        setTimeout(() => switchView("live-tv"), 1500);
      } else {
        statusDiv.innerHTML = `<span style="color:var(--accent-red);"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${result.error || "Connection failed"}</span>`;
      }
    });
  }

  // 1-Click Preset Playlist Loader
  const presetBtns = document.querySelectorAll(".preset-load-btn");
  const presetStatus = document.getElementById("preset-load-status");
  presetBtns.forEach(btn => {
    btn.addEventListener("click", async () => {
      const url = btn.getAttribute("data-preset");
      if (!url) return;
      
      if (presetStatus) {
        presetStatus.innerHTML = `<span style="color:var(--primary);"><i class="fa-solid fa-spinner fa-spin"></i> Downloading and loading channels...</span>`;
      }

      try {
        const isRemote = url.startsWith("http://") || url.startsWith("https://");
        const fetchUrl = (isRemote && window.location.protocol.startsWith('http')) 
          ? `proxy.php?url=${encodeURIComponent(url)}` 
          : url;
        const res = await fetch(fetchUrl);
        const text = await res.text();
        const parsed = playlistMgr.parseM3U(text);

        if (parsed.length > 0) {
          channels = [...parsed, ...DEFAULT_CHANNELS];
          playlistMgr.saveCustomChannels(parsed);
          renderCategories();
          renderChannels();
          if (presetStatus) {
            presetStatus.innerHTML = `<span style="color:var(--accent-green);"><i class="fa-solid fa-check"></i> Loaded ${parsed.length} channels! Switching to Live TV...</span>`;
          }
          setTimeout(() => switchView("live-tv"), 1200);
        } else {
          if (presetStatus) {
            presetStatus.innerHTML = `<span style="color:var(--accent-red);"><i class="fa-solid fa-triangle-exclamation"></i> Could not parse channels from this pack.</span>`;
          }
        }
      } catch (err) {
        if (presetStatus) {
          presetStatus.innerHTML = `<span style="color:var(--accent-red);"><i class="fa-solid fa-triangle-exclamation"></i> Failed to download: ${err.message}</span>`;
        }
      }
    });
  });

  // Reset to Default Channels Button
  const resetBtn = document.getElementById("btn-reset-channels");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      playlistMgr.clearCustomChannels();
      channels = [...DEFAULT_CHANNELS];
      renderCategories();
      renderChannels();
      if (presetStatus) {
        presetStatus.innerHTML = `<span style="color:var(--accent-green);"><i class="fa-solid fa-check"></i> Reset to default Malaysia channels!</span>`;
      }
      setTimeout(() => switchView("live-tv"), 1000);
    });
  }

  // Sidebar hover expansion
  if (sidebar) {
    sidebar.addEventListener("mouseenter", () => sidebar.classList.add("expanded"));
    sidebar.addEventListener("mouseleave", () => sidebar.classList.remove("expanded"));
  }

  // Real-Time Dynamic EPG & Clock Sync Engine (Calculates what show is playing NOW)
  function refreshDynamicEpg(reRenderAll = false) {
    const nowSec = Math.floor(Date.now() / 1000);
    const now = new Date();

    channels.forEach(ch => {
      // 1. If channel has schedule with timestamps, find exact show for current timestamp
      if (ch.schedule && Array.isArray(ch.schedule) && ch.schedule.length > 0) {
        let activeShow = ch.schedule.find(p => p.startTs && p.stopTs && nowSec >= p.startTs && nowSec < p.stopTs);
        
        // If between shows or current show just ended, check if any future show is coming up
        if (!activeShow) {
          activeShow = ch.schedule.find(p => p.startTs && p.stopTs && p.startTs <= nowSec && nowSec < p.stopTs + 300) ||
                       ch.schedule.find(p => p.startTs && p.stopTs && p.startTs > nowSec);
        }

        if (activeShow) {
          const showIdx = ch.schedule.indexOf(activeShow);
          const nextShow = ch.schedule[showIdx + 1];

          ch.currentProgram = activeShow.title;
          ch.desc = activeShow.desc || ch.desc;
          ch.programStart = activeShow.start || (activeShow.startTs ? new Date(activeShow.startTs * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ch.programStart);
          ch.programEnd = activeShow.end || (activeShow.stopTs ? new Date(activeShow.stopTs * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ch.programEnd);

          if (activeShow.startTs && activeShow.stopTs) {
            const duration = Math.max(1, activeShow.stopTs - activeShow.startTs);
            const elapsed = Math.max(0, nowSec - activeShow.startTs);
            ch.progress = Math.min(100, Math.max(0, Math.round((elapsed / duration) * 100)));
          }

          if (nextShow) {
            ch.nextProgram = nextShow.title;
          }
        }
      } else {
        // Fallback: Generate real-time 30-minute block for the channel
        const currentMinutes = now.getMinutes();
        const startMin = currentMinutes < 30 ? 0 : 30;
        const startD = new Date(now);
        startD.setMinutes(startMin, 0, 0);
        const endD = new Date(startD.getTime() + 30 * 60 * 1000);

        const formatT = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        ch.programStart = formatT(startD);
        ch.programEnd = formatT(endD);
        const elapsedSec = (now.getTime() - startD.getTime()) / 1000;
        ch.progress = Math.min(100, Math.max(0, Math.round((elapsedSec / 1800) * 100)));
        if (!ch.currentProgram || ch.currentProgram === "Live TV") {
          ch.currentProgram = ch.name.includes("News") ? "Buletin Terkini" : "Siaran Langsung HD";
          ch.nextProgram = "Sorotan Khas";
        }
      }

      // Update DOM card in channels list in-place (without losing focus or scroll position!)
      const cardEl = document.querySelector(`.channel-item[data-channel-id="${ch.id}"]`);
      if (cardEl) {
        const titleEl = cardEl.querySelector(".show-title-text");
        if (titleEl && titleEl.textContent !== (ch.currentProgram || "Live TV")) {
          titleEl.textContent = ch.currentProgram || "Live TV";
        }
        const timeEl = cardEl.querySelector(".channel-prog-time");
        if (timeEl && ch.programStart) {
          timeEl.textContent = ch.programStart;
        }
        const barEl = cardEl.querySelector(".channel-progress-mini .bar");
        if (barEl) {
          barEl.style.width = `${ch.progress ?? 50}%`;
        }
        const nextEl = cardEl.querySelector(".channel-prog-next");
        if (nextEl && ch.nextProgram) {
          nextEl.innerHTML = `<span style="opacity:0.6;">Next:</span> ${ch.nextProgram}`;
        }
      }
    });

    // Update active channel OSD
    if (activeChannel) {
      const liveChan = channels.find(c => c.id === activeChannel.id);
      if (liveChan) {
        activeChannel = liveChan;
        const osdProgram = document.getElementById("osd-channel-program");
        if (osdProgram) {
          const timeInfo = (activeChannel.programStart && activeChannel.programEnd) ? ` (${activeChannel.programStart} - ${activeChannel.programEnd})` : "";
          osdProgram.textContent = (activeChannel.currentProgram || "Live Broadcast") + timeInfo;
        }
        const osdNext = document.getElementById("osd-channel-next");
        if (osdNext) {
          if (activeChannel.nextProgram) {
            osdNext.textContent = `Next: ${activeChannel.nextProgram}`;
            osdNext.style.display = "block";
          } else {
            osdNext.style.display = "none";
          }
        }
        const osdProgBar = document.getElementById("osd-progress-fill");
        if (osdProgBar && activeChannel.progress !== undefined) {
          osdProgBar.style.width = `${activeChannel.progress}%`;
        }
      }
    }

    if (reRenderAll) {
      renderChannels();
    }
  }

  // Live EPG Synchronization Engine
  function loadLiveEpg() {
    fetch("epg.json?v=" + Date.now())
      .then(res => res.json())
      .then(data => {
        if (data && data.channels) {
          window.LIVE_EPG = data.channels;
          channels.forEach(ch => {
            const epgItem = data.channels[ch.number];
            if (epgItem) {
              if (epgItem.schedule && Array.isArray(epgItem.schedule) && epgItem.schedule.length > 0) {
                ch.schedule = epgItem.schedule;
              }
              if (epgItem.desc) ch.desc = epgItem.desc;
            }
          });
          refreshDynamicEpg(true);
        }
      })
      .catch(e => {
        console.warn("Live EPG synchronization notice:", e);
        refreshDynamicEpg(false);
      });
  }

  // Initial Boot
  refreshDynamicEpg(false);
  renderCategories();
  renderChannels();
  renderVodMovies();
  renderVodSeries();
  loadLiveEpg();

  // Initial focus for Android TV Leanback Remote
  setTimeout(() => {
    const initialFocus = document.querySelector(".channel-item.active") || document.querySelector(".channel-item");
    if (initialFocus) {
      initialFocus.focus();
      initialFocus.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 400);

  // Periodic real-time updates:
  // 1. Every 5 seconds: refresh real-time current program titles & progress bar
  setInterval(() => refreshDynamicEpg(false), 5000);
  // 2. Every 60 seconds: sync fresh EPG schedule
  setInterval(loadLiveEpg, 60000);

  // Always load latest SQ2 Box playlist_tv2u.m3u to ensure all updated streams and DRM keys are active
  fetch("playlist_tv2u.m3u?v=" + Date.now())
    .then(res => res.text())
    .then(text => {
      const parsed = playlistMgr.parseM3U(text);
      if (parsed.length > 0) {
        channels = parsed;
        playlistMgr.saveCustomChannels(parsed);
        loadLiveEpg();
        renderCategories();
        renderChannels();
        if (!activeChannel || !activeChannel.streamUrl) {
          selectChannel(channels[0]);
        }
        console.log(`Auto-loaded ${parsed.length} SQ2 Box channels with ClearKey DRM!`);
      } else if (channels.length > 0 && !activeChannel) {
        selectChannel(channels[0]);
      }
    })
    .catch(err => {
      console.warn("Could not auto-load playlist_tv2u.m3u:", err);
      if (channels.length > 0 && !activeChannel) selectChannel(channels[0]);
    });
});
