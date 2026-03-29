const browserRoot = document.querySelector("[data-story-browser]");

if (browserRoot) {
  const input = browserRoot.querySelector("[data-story-search]");
  const chips = [...browserRoot.querySelectorAll("[data-story-filter]")];
  const cards = [...browserRoot.querySelectorAll("[data-story-card]")];
  const counter = browserRoot.querySelector("[data-story-count]");
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
      counter.textContent = `${visible}/${cards.length} stories`;
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
