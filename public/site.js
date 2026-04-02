const documentLanguage = document.documentElement.lang === "en" ? "en" : "vi";

initStoryBrowser();
initLiveDesk();
initAuthTabs();
initImageFallbacks();
initPullToRefresh();

function initStoryBrowser() {
  const browserRoot = document.querySelector("[data-story-browser]");

  if (!browserRoot) {
    return;
  }

  const input = browserRoot.querySelector("[data-story-search]");
  const chips = [...browserRoot.querySelectorAll("[data-story-filter]")];
  const cards = [...browserRoot.querySelectorAll("[data-story-card]")];
  const counter = browserRoot.querySelector("[data-story-count]");
  const countLabel = documentLanguage === "vi" ? "bài" : "stories";
  let activeStatus = "all";
  const localizedCountLabel = documentLanguage === "vi" ? "bài" : "stories";

  const applyFilters = () => {
    const query = (input?.value || "").trim().toLowerCase();
    let visible = 0;

    for (const card of cards) {
      const status = card.dataset.status || "";
      const haystack = card.dataset.search || "";
      const matchesStatus = activeStatus === "all" || status === activeStatus;
      const matchesQuery = !query || haystack.includes(query);
      const isVisible = matchesStatus && matchesQuery;

      card.classList.toggle("is-hidden", !isVisible);
      if (isVisible) {
        visible += 1;
      }
    }

    if (counter) {
      counter.textContent = `${visible}/${cards.length} ${localizedCountLabel}`;
    }
  };

  for (const chip of chips) {
    chip.addEventListener("click", () => {
      activeStatus = chip.dataset.storyFilter || "all";
      for (const entry of chips) {
        entry.classList.toggle("is-active", entry === chip);
      }
      applyFilters();
    });
  }

  input?.addEventListener("input", applyFilters);
  applyFilters();
}

function initLiveDesk() {
  const liveRoot = document.querySelector("[data-live-desk]");

  if (!liveRoot) {
    return;
  }

  const language = liveRoot.dataset.lang === "en" ? "en" : "vi";
  const refreshedNode = liveRoot.querySelector("[data-live-refreshed]");
  const nextNode = liveRoot.querySelector("[data-live-next]");
  const tickerNode = liveRoot.querySelector("[data-live-ticker]");
  let refreshTimer = null;

  const formatTime = (value) =>
    new Date(value).toLocaleTimeString(language === "vi" ? "vi-VN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit"
    });

  const renderTicker = (items) =>
    items
      .map(
        (item) => `
          <a class="live-item" href="${item.href}">
            <span>${escapeHtml(item.topic)}</span>
            <strong>${escapeHtml(item.title)}</strong>
            <em>${escapeHtml(item.updated_text)}</em>
          </a>
        `
      )
      .join("");

  const applyLiveData = (payload) => {
    if (refreshedNode) {
      refreshedNode.textContent = formatTime(payload.refreshedAt);
    }

    if (nextNode) {
      nextNode.textContent = formatTime(payload.nextRefreshAt);
    }

    for (const card of payload.cards || []) {
      const target = liveRoot.querySelector(`[data-live-card="${card.id}"]`);
      if (target) {
        target.textContent = card.value;
      }
    }

    if (tickerNode) {
      tickerNode.innerHTML = renderTicker(payload.ticker || []);
    }

    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = window.setTimeout(fetchLiveDesk, payload.refreshIntervalMs || 45000);
  };

  const fetchLiveDesk = async () => {
    try {
      const response = await fetch(`/api/newsroom/live?lang=${language}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Live desk request failed with ${response.status}`);
      }
      const payload = await response.json();
      applyLiveData(payload);
    } catch (error) {
      console.error(error);
      refreshTimer = window.setTimeout(fetchLiveDesk, 45000);
    }
  };

  fetchLiveDesk();
}

function initAuthTabs() {
  const authRoot = document.querySelector("[data-auth-shell]");

  if (!authRoot) {
    return;
  }

  const tabs = [...authRoot.querySelectorAll("[data-auth-tab]")];
  const panels = [...authRoot.querySelectorAll("[data-auth-panel]")];
  let activeTab = authRoot.dataset.defaultTab || "login";

  const sync = () => {
    for (const tab of tabs) {
      const isActive = tab.dataset.authTab === activeTab;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    }

    for (const panel of panels) {
      panel.classList.toggle("is-active", panel.dataset.authPanel === activeTab);
    }
  };

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      activeTab = tab.dataset.authTab || "login";
      sync();
    });
  }

  sync();
}

function initImageFallbacks() {
  const imageFrames = [...document.querySelectorAll("[data-story-image]")];

  for (const frame of imageFrames) {
    const img = frame.querySelector("img");

    if (!img) {
      continue;
    }

    const markBroken = () => frame.classList.add("is-broken");
    const clearBroken = () => frame.classList.remove("is-broken");

    img.addEventListener("error", markBroken, { once: true });
    img.addEventListener("load", () => {
      if (img.naturalWidth > 0) {
        clearBroken();
      }
    });

    if (img.complete && img.naturalWidth === 0) {
      markBroken();
    }
  }
}

function initPullToRefresh() {
  if (!("ontouchstart" in window) || !window.matchMedia("(pointer: coarse)").matches) {
    return;
  }

  const path = window.location.pathname || "/";
  const supportsRefresh =
    /^\/(vi|en)\/?$/.test(path) ||
    /^\/(vi|en)\/topics\//.test(path) ||
    /^\/(vi|en)\/(tin-tuc|news|huong-dan|guides|so-sanh|compare)\//.test(path);

  if (!supportsRefresh) {
    return;
  }

  const refreshRoot = document.querySelector("[data-pull-refresh]");

  if (!refreshRoot) {
    return;
  }

  const statusNode = refreshRoot.querySelector("[data-pull-refresh-status]");
  const hintNode = refreshRoot.querySelector("[data-pull-refresh-hint]");
  const threshold = 86;
  let startY = 0;
  let active = false;
  let armed = false;
  let refreshing = false;

  const copy =
    documentLanguage === "vi"
      ? {
          pull: "Kéo xuống để làm mới tin",
          ready: "Thả tay để làm mới",
          refreshing: "Đang làm mới bài viết..."
        }
      : {
          pull: "Pull down to refresh stories",
          ready: "Release to refresh",
          refreshing: "Refreshing stories..."
        };

  const updateIndicator = (distance) => {
    const cappedDistance = Math.max(0, Math.min(distance, 112));
    const progress = Math.min(cappedDistance / threshold, 1);
    armed = cappedDistance >= threshold;
    refreshRoot.classList.add("is-active");
    refreshRoot.classList.toggle("is-armed", armed);
    refreshRoot.style.setProperty("--pull-refresh-distance", `${cappedDistance}px`);
    refreshRoot.style.setProperty("--pull-refresh-progress", progress.toFixed(3));

    if (statusNode) {
      statusNode.textContent = armed ? copy.ready : copy.pull;
    }

    if (hintNode) {
      hintNode.textContent = armed ? "↻" : "↓";
    }
  };

  const resetIndicator = () => {
    active = false;
    armed = false;
    refreshRoot.classList.remove("is-active", "is-armed", "is-refreshing");
    refreshRoot.style.setProperty("--pull-refresh-distance", "0px");
    refreshRoot.style.setProperty("--pull-refresh-progress", "0");

    if (statusNode) {
      statusNode.textContent = copy.pull;
    }

    if (hintNode) {
      hintNode.textContent = "↓";
    }
  };

  window.addEventListener(
    "touchstart",
    (event) => {
      if (refreshing || window.scrollY > 0 || event.touches.length !== 1) {
        return;
      }

      const targetTag = event.target?.tagName || "";
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/i.test(targetTag)) {
        return;
      }

      startY = event.touches[0].clientY;
      active = true;
    },
    { passive: true }
  );

  window.addEventListener(
    "touchmove",
    (event) => {
      if (!active || refreshing || window.scrollY > 0 || event.touches.length !== 1) {
        return;
      }

      const delta = event.touches[0].clientY - startY;

      if (delta <= 0) {
        resetIndicator();
        return;
      }

      updateIndicator(delta * 0.56);
      event.preventDefault();
    },
    { passive: false }
  );

  window.addEventListener(
    "touchend",
    () => {
      if (!active) {
        return;
      }

      active = false;

      if (!armed || refreshing) {
        resetIndicator();
        return;
      }

      refreshing = true;
      refreshRoot.classList.add("is-refreshing");
      refreshRoot.style.setProperty("--pull-refresh-distance", "72px");

      if (statusNode) {
        statusNode.textContent = copy.refreshing;
      }

      if (hintNode) {
        hintNode.textContent = "↻";
      }

      window.setTimeout(() => {
        window.location.reload();
      }, 140);
    },
    { passive: true }
  );

  window.addEventListener("touchcancel", resetIndicator, { passive: true });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
