const documentLanguage = document.documentElement.lang === "en" ? "en" : "vi";

initStoryBrowser();
initLiveDesk();
initAuthTabs();
initImageFallbacks();

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
      counter.textContent = `${visible}/${cards.length} ${countLabel}`;
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
