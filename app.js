(() => {
  const buttons = Array.from(document.querySelectorAll("[data-filter]"));
  const cards = Array.from(document.querySelectorAll("[data-categories]"));
  const statusEl = document.getElementById("filter-status");
  if (!buttons.length || !cards.length) return;

  const FOCUS_MAP = {
    all: "all",
    lnd: "lnd",
    learning: "lnd",
    enablement: "lnd",
    ops: "ops",
    operations: "ops",
    cs: "cs",
    success: "cs",
    data: "data",
    ai: "data",
    fincrime: "data",
  };

  function applyFilter(key, updateQuery = true) {
    const normalized = FOCUS_MAP[key] || "all";
    let visibleCount = 0;

    buttons.forEach((btn) => {
      const active = btn.getAttribute("data-filter") === normalized;
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });

    cards.forEach((card) => {
      const cats = (card.getAttribute("data-categories") || "").split(/\s+/);
      const show = normalized === "all" || cats.includes(normalized);
      card.classList.toggle("is-hidden", !show);
      if (show) visibleCount += 1;
    });

    if (statusEl) {
      const label = buttons.find((b) => b.getAttribute("data-filter") === normalized)?.textContent || "All Work";
      statusEl.textContent = `Showing ${visibleCount} work sample${visibleCount === 1 ? "" : "s"} for: ${label.trim()}`;
    }

    if (updateQuery && typeof window.history?.replaceState === "function") {
      const url = new URL(window.location.href);
      if (normalized === "all") {
        url.searchParams.delete("focus");
      } else {
        url.searchParams.set("focus", normalized);
      }
      window.history.replaceState({}, "", url.toString());
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => applyFilter(btn.getAttribute("data-filter") || "all", true));
  });

  const params = new URLSearchParams(window.location.search);
  const initial = (params.get("focus") || "all").toLowerCase();
  applyFilter(initial, false);
})();
