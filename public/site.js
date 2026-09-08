const documentLanguage = document.documentElement.lang === "en" ? "en" : "vi";

initStoryBrowser();
initLiveDesk();
initAuthTabs();
initImageFallbacks();
initPullToRefresh();
initLanguageSwitcher();
initApprovedEditorialMotion();
initLuxuryMotion();
initCosmosTheme();
initHomepageNewsTicker();
initHomepageSkyClouds();

function initHomepageNewsTicker() {
  const track = document.querySelector(".marquee-container .marquee-track");

  if (!track) return;

  let offset = 0;
  let lastTime = performance.now();
  const speed = 42;

  const move = (now) => {
    const halfWidth = track.scrollWidth / 2;
    const elapsed = Math.min((now - lastTime) / 1000, .05);
    lastTime = now;
    offset = halfWidth > 0 ? (offset + speed * elapsed) % halfWidth : 0;
    track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    requestAnimationFrame(move);
  };

  track.style.animation = "none";
  track.classList.add("is-marquee-ready");
  requestAnimationFrame(move);
}

function initHomepageSkyClouds() {
  const sky = document.querySelector(".sky-clouds");
  if (!sky) return;

  let offset = 50;
  let direction = 1;
  let lastTime = performance.now();

  const move = (now) => {
    const elapsed = Math.min((now - lastTime) / 16.67, 3);
    lastTime = now;
    const dark = document.body.classList.contains("theme-dark");
    offset += direction * .0025 * elapsed;
    if (offset >= 54 || offset <= 46) direction *= -1;
    sky.style.backgroundPosition = `${offset}% center`;
    sky.style.visibility = dark ? "hidden" : "visible";
    requestAnimationFrame(move);
  };

  requestAnimationFrame(move);
}

function initCosmosTheme() {
  const canvas = document.querySelector("[data-cosmos-canvas]");
  const toggle = document.querySelector("[data-theme-toggle]");
  const leftDoor = document.querySelector(".cyber-door-left");
  const rightDoor = document.querySelector(".cyber-door-right");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isHomepage = document.body.classList.contains("homepage");

  if (!isHomepage) return;

  const storedTheme = window.localStorage.getItem("ptm-theme");
  if (storedTheme === "dark") document.body.classList.add("theme-dark");
  toggle?.setAttribute("aria-pressed", document.body.classList.contains("theme-dark") ? "true" : "false");
  toggle?.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("theme-dark");
    window.localStorage.setItem("ptm-theme", isDark ? "dark" : "light");
    toggle.setAttribute("aria-pressed", isDark ? "true" : "false");
  });

  if (canvas) {
    const context = canvas.getContext("2d");
    const particles = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.65 + .25, v: Math.random() * .00012 + .00002, phase: Math.random() * Math.PI * 2, brightness: Math.random() * .6 + .35, warm: Math.random() > .86 }));
    const clouds = Array.from({ length: 7 }, (_, index) => ({ x: (index / 7) * 1.2 - .1, y: .08 + Math.random() * .3, width: 120 + Math.random() * 180, height: 28 + Math.random() * 34, speed: .000015 + Math.random() * .000018 }));
    const meteors = [];
    let frame = 0;
    const resize = () => { canvas.width = window.innerWidth * devicePixelRatio; canvas.height = window.innerHeight * devicePixelRatio; context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); };
    const drawCloud = (cloud, width, height) => {
      const x = cloud.x * width;
      const y = cloud.y * height;
      context.fillStyle = "rgba(255, 255, 255, .48)";
      context.shadowColor = "rgba(97, 147, 184, .12)";
      context.shadowBlur = 18;
      context.beginPath();
      context.ellipse(x, y, cloud.width, cloud.height, 0, 0, Math.PI * 2);
      context.ellipse(x + cloud.width * .42, y - cloud.height * .35, cloud.width * .62, cloud.height * .85, 0, 0, Math.PI * 2);
      context.ellipse(x - cloud.width * .38, y - cloud.height * .16, cloud.width * .48, cloud.height * .7, 0, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
    };
    const draw = () => {
      const width = window.innerWidth; const height = window.innerHeight;
      context.clearRect(0, 0, width, height);
      const dark = document.body.classList.contains("theme-dark");
      if (!dark) {
        for (const cloud of clouds) { cloud.x += cloud.speed; if (cloud.x > 1.2) cloud.x = -.2; drawCloud(cloud, width, height); }
      }
      context.fillStyle = dark ? "rgba(218, 238, 255, .88)" : "rgba(240, 174, 43, .22)";
      for (const particle of particles) {
        if (!reducedMotion) particle.y -= particle.v;
        if (particle.y < 0) particle.y = 1;
        if (dark) {
          const pulse = reducedMotion ? particle.brightness : particle.brightness + Math.sin(frame * .035 + particle.phase) * .3;
          context.globalAlpha = pulse;
          context.beginPath(); context.arc(particle.x * width, particle.y * height, particle.r, 0, Math.PI * 2); context.fill();
        }
      }
      context.globalAlpha = 1;
      if (dark && !reducedMotion && (frame === 12 || frame % 42 === 0)) {
        const meteorCount = frame === 12 ? 3 : 1;
        for (let meteorIndex = 0; meteorIndex < meteorCount; meteorIndex += 1) meteors.push({ x: Math.random() * width * .82, y: Math.random() * height * .42, life: 0, speed: 11 + Math.random() * 8, length: 130 + Math.random() * 170 });
      }
      for (let index = meteors.length - 1; index >= 0; index -= 1) {
        const meteor = meteors[index];
        meteor.x += meteor.speed; meteor.y += meteor.speed * .55; meteor.life += 1;
        const gradient = context.createLinearGradient(meteor.x, meteor.y, meteor.x - meteor.length, meteor.y - meteor.length * .55);
        gradient.addColorStop(0, "rgba(255,255,255,1)"); gradient.addColorStop(.12, "rgba(177,229,255,.95)"); gradient.addColorStop(1, "rgba(122,205,255,0)");
        context.strokeStyle = gradient; context.lineWidth = 3; context.beginPath(); context.moveTo(meteor.x, meteor.y); context.lineTo(meteor.x - meteor.length, meteor.y - meteor.length * .55); context.stroke(); context.fillStyle = "rgba(255,255,255,.98)"; context.shadowColor = "rgba(132,218,255,.95)"; context.shadowBlur = 14; context.beginPath(); context.arc(meteor.x, meteor.y, 3.2, 0, Math.PI * 2); context.fill(); context.shadowBlur = 0;
        if (meteor.life > 34) meteors.splice(index, 1);
      }
      frame += 1;
      window.requestAnimationFrame(draw);
    };
    resize(); window.addEventListener("resize", resize, { passive: true }); draw();
  }

  if (!leftDoor || !rightDoor) return;
  let isClosing = false;
  const openDoors = () => {
    isClosing = false;
    leftDoor.classList.remove("is-closing"); rightDoor.classList.remove("is-closing");
    leftDoor.style.transition = rightDoor.style.transition = "transform .58s cubic-bezier(.76,0,.24,1)";
    leftDoor.style.transform = "translate3d(-100%, 0, 0)"; rightDoor.style.transform = "translate3d(100%, 0, 0)";
  };
  document.querySelectorAll("a[href]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.defaultPrevented || isClosing || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.hash || url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      isClosing = true;
      leftDoor.classList.add("is-closing"); rightDoor.classList.add("is-closing");
      leftDoor.style.transition = rightDoor.style.transition = "transform .42s cubic-bezier(.76,0,.24,1)";
      leftDoor.style.transform = "translate3d(0, 0, 0)"; rightDoor.style.transform = "translate3d(0, 0, 0)";
      window.setTimeout(() => { window.location.assign(url.href); }, 430);
    });
  });
  window.addEventListener("pageshow", openDoors, { passive: true });
  requestAnimationFrame(() => requestAnimationFrame(openDoors));
}

function initApprovedEditorialMotion() {
  if (!window.gsap || !window.ScrollTrigger) {
    document.querySelectorAll(".hero-big-title .line span").forEach((node) => {
      node.style.transform = "none";
      node.style.opacity = "1";
    });
    const readFill = document.querySelector("#readFill");
    if (readFill) readFill.style.width = "0%";
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.to(".hero h1 .line span", { y: "0%", duration: 0.9, stagger: 0.09 })
      .from(".hero-eyebrow", { opacity: 0, y: 10, duration: 0.5 }, 0)
      .from(".hero-dek, .hero-meta", { opacity: 0, y: 12, duration: 0.6, stagger: 0.08 }, "-=0.5")
      .from(".hero-media", { opacity: 0, scale: 0.97, duration: 0.8 }, 0.1);

    const progressTween = gsap.to("#readFill", {
      width: "100%",
      ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true }
    });

    return () => {
      tl.kill();
      progressTween.kill();
    };
  });
}

function initLuxuryMotion() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  if (reducedMotion || typeof gsap === "undefined") return;

  const cursorDot = document.querySelector(".custom-cursor-dot");
  const cursorRing = document.querySelector(".custom-cursor-ring");
  if (finePointer && cursorDot && cursorRing) {
    const dotX = gsap.quickTo(cursorDot, "x", { duration: 0.1, ease: "power3" });
    const dotY = gsap.quickTo(cursorDot, "y", { duration: 0.1, ease: "power3" });
    const ringX = gsap.quickTo(cursorRing, "x", { duration: 0.25, ease: "power2.out" });
    const ringY = gsap.quickTo(cursorRing, "y", { duration: 0.25, ease: "power2.out" });
    window.addEventListener("pointermove", (event) => {
      dotX(event.clientX); dotY(event.clientY); ringX(event.clientX); ringY(event.clientY);
    }, { passive: true });
    document.querySelectorAll(".article-spotlight-card").forEach((card) => {
      card.addEventListener("pointerenter", () => cursorRing.classList.add("active-card"), { passive: true });
      card.addEventListener("pointerleave", () => cursorRing.classList.remove("active-card"), { passive: true });
    });
  }

  document.querySelectorAll(".article-spotlight-card").forEach((card) => {
    const rotateX = gsap.quickTo(card, "rotationX", { duration: 0.4, ease: "power2.out" });
    const rotateY = gsap.quickTo(card, "rotationY", { duration: 0.4, ease: "power2.out" });
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      card.style.setProperty("--mouse-x", `${x}px`);
      card.style.setProperty("--mouse-y", `${y}px`);
      rotateX(((rect.height / 2 - y) / Math.max(rect.height / 2, 1)) * 2.5);
      rotateY(((x - rect.width / 2) / Math.max(rect.width / 2, 1)) * 2.5);
    }, { passive: true });
    card.addEventListener("pointerleave", () => { rotateX(0); rotateY(0); }, { passive: true });
  });

  const pillIndicator = document.querySelector(".sliding-pill-indicator");
  const categoryNav = document.querySelector(".category-nav-container");
  categoryNav?.querySelectorAll(".category-pill-btn").forEach((pill) => pill.addEventListener("pointerenter", () => {
    if (!pillIndicator) return;
    pillIndicator.style.opacity = "1";
    gsap.to(pillIndicator, { x: pill.offsetLeft, width: pill.offsetWidth, duration: 0.3, ease: "power3.out" });
  }, { passive: true }));
  categoryNav?.addEventListener("pointerleave", () => { if (pillIndicator) pillIndicator.style.opacity = "0"; }, { passive: true });

  document.querySelectorAll(".btn-magnetic, .read-link, .mini-link").forEach((button) => {
    const xTo = gsap.quickTo(button, "x", { duration: 0.3, ease: "power2.out" });
    const yTo = gsap.quickTo(button, "y", { duration: 0.3, ease: "power2.out" });
    button.addEventListener("pointermove", (event) => {
      const rect = button.getBoundingClientRect();
      xTo((event.clientX - rect.left - rect.width / 2) * 0.12);
      yTo((event.clientY - rect.top - rect.height / 2) * 0.12);
    }, { passive: true });
    button.addEventListener("pointerleave", () => { xTo(0); yTo(0); }, { passive: true });
  });

  document.querySelectorAll(".glow-orb").forEach((orb, index) => gsap.to(orb, {
    x: index ? "-=40" : "+=40", y: index ? "-=28" : "+=35", duration: index ? 10 : 8,
    repeat: -1, yoyo: true, ease: "sine.inOut"
  }));
  const marqueeTrack = document.querySelector(".marquee-track");
  if (marqueeTrack) {
    const distance = marqueeTrack.scrollWidth / 2;
    const ticker = gsap.to(marqueeTrack, { x: -distance, duration: 32, ease: "none", repeat: -1 });
    marqueeTrack.addEventListener("pointerenter", () => ticker.timeScale(0.25), { passive: true });
    marqueeTrack.addEventListener("pointerleave", () => ticker.timeScale(1), { passive: true });
  }
  if (window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    gsap.from(".article-spotlight-card", {
      scrollTrigger: { trigger: ".page-body", start: "top 88%", once: true },
      opacity: 0, y: 24, duration: 0.65, stagger: 0.06, ease: "power3.out"
    });
  }
}

function initLanguageSwitcher() {
  for (const link of document.querySelectorAll("[data-language-switch]")) {
    link.addEventListener("click", (event) => {
      const targetLanguage = link.dataset.targetLanguage === "vi" ? "vi" : "en";
      const href = link.getAttribute("href");
      if (!href) return;

      event.preventDefault();
      document.cookie = `preferred_lang=${targetLanguage}; Path=/; Max-Age=31536000; SameSite=Lax`;
      window.location.assign(href);
    });
  }
}

function initBackdropMotion() {
  return;

  const backdrop = document.querySelector(".backdrop");

  if (!backdrop) {
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  let rafId = 0;
  let ambientTimer = 0;

  const updatePointer = (clientX, clientY, strength = 0.2) => {
    const width = Math.max(window.innerWidth || 1, 1);
    const height = Math.max(window.innerHeight || 1, 1);
    const x = ((clientX / width) * 100).toFixed(2);
    const y = ((clientY / height) * 100).toFixed(2);

    document.documentElement.style.setProperty("--pointer-x", `${x}%`);
    document.documentElement.style.setProperty("--pointer-y", `${y}%`);
    document.documentElement.style.setProperty("--pointer-strength", String(strength));
  };

  const queuePointerUpdate = (clientX, clientY, strength) => {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
    }

    rafId = window.requestAnimationFrame(() => {
      updatePointer(clientX, clientY, strength);
    });
  };

  const spawnRipple = (clientX, clientY) => {
    const ripple = document.createElement("span");
    ripple.className = "backdrop-ripple";
    ripple.style.left = `${clientX}px`;
    ripple.style.top = `${clientY}px`;
    backdrop.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 920);
  };

  updatePointer(window.innerWidth * 0.52, window.innerHeight * 0.18, 0.2);

  if (reducedMotion || coarsePointer) {
    return;
  }

  window.addEventListener(
    "pointermove",
    (event) => {
      queuePointerUpdate(event.clientX, event.clientY, event.pointerType === "mouse" ? 0.28 : 0.22);
    },
    { passive: true }
  );

  window.addEventListener(
    "pointerdown",
    (event) => {
      queuePointerUpdate(event.clientX, event.clientY, 0.34);
      spawnRipple(event.clientX, event.clientY);
      window.setTimeout(() => {
        document.documentElement.style.setProperty("--pointer-strength", "0.2");
      }, 260);
    },
    { passive: true }
  );

  const ambientRipple = () => {
    const x = Math.round(window.innerWidth * (0.18 + Math.random() * 0.64));
    const y = Math.round(window.innerHeight * (0.16 + Math.random() * 0.52));
    queuePointerUpdate(x, y, coarsePointer ? 0.2 : 0.24);
    spawnRipple(x, y);
    window.setTimeout(() => {
      document.documentElement.style.setProperty("--pointer-strength", "0.2");
    }, 220);
  };

  const startAmbient = () => {
    if (ambientTimer || document.hidden) {
      return;
    }

    const intervalMs = coarsePointer ? 8200 : 5600;
    ambientTimer = window.setInterval(ambientRipple, intervalMs);
  };

  const stopAmbient = () => {
    if (!ambientTimer) {
      return;
    }

    window.clearInterval(ambientTimer);
    ambientTimer = 0;
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopAmbient();
      return;
    }

    startAmbient();
  });

  window.addEventListener("pagehide", stopAmbient);
  startAmbient();
}

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


function initEditorialMotion() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const animatedCards = [...document.querySelectorAll("[data-signal-shell]")];

  if (!reducedMotion && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });

    for (const card of animatedCards) {
      observer.observe(card);
    }
  } else {
    for (const card of animatedCards) {
      card.classList.add("is-visible");
    }
  }

  if (finePointer && !reducedMotion) {
    for (const card of animatedCards) {
      let frame = 0;
      const updateTilt = (clientX, clientY) => {
        const rect = card.getBoundingClientRect();
        const relativeX = (clientX - rect.left) / Math.max(rect.width, 1);
        const relativeY = (clientY - rect.top) / Math.max(rect.height, 1);
        const rotateY = (relativeX - 0.5) * 1.8;
        const rotateX = (0.5 - relativeY) * 1.2;
        card.style.setProperty("--tilt-x", rotateX.toFixed(2) + "deg");
        card.style.setProperty("--tilt-y", rotateY.toFixed(2) + "deg");
        card.style.setProperty("--glow-x", (relativeX * 100).toFixed(2) + "%");
        card.style.setProperty("--glow-y", (relativeY * 100).toFixed(2) + "%");
      };

      card.addEventListener("pointermove", (event) => {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => updateTilt(event.clientX, event.clientY));
      }, { passive: true });

      card.addEventListener("pointerenter", () => card.classList.add("is-armed"), { passive: true });
      card.addEventListener("pointerleave", () => {
        card.classList.remove("is-armed");
        card.style.setProperty("--tilt-x", "0deg");
        card.style.setProperty("--tilt-y", "0deg");
        card.style.setProperty("--glow-x", "50%");
        card.style.setProperty("--glow-y", "24%");
      }, { passive: true });
    }
  }

  const marqueeRoot = document.querySelector("[data-ribbon-marquee]");
  const marqueeTrack = marqueeRoot ? marqueeRoot.querySelector("[data-ribbon-track]") : null;

  if (marqueeRoot && marqueeTrack && !reducedMotion) {
    const items = [...marqueeTrack.children];
    if (items.length > 0) {
      for (const item of items) {
        marqueeTrack.appendChild(item.cloneNode(true));
      }
      marqueeRoot.classList.add("is-marquee-ready");
      const duration = Math.max(34, items.length * 7);
      marqueeTrack.style.setProperty("--marquee-duration", duration + "s");
    }
  }
}
