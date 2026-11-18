(() => {
  const buttons = Array.from(document.querySelectorAll("[data-filter]"));
  const cards = Array.from(document.querySelectorAll("[data-categories]"));
  const grid = document.getElementById("samples-grid");
  const statusEl = document.getElementById("filter-status");
  const focusCallout = document.getElementById("focus-callout");
  const copyEmailBtn = document.getElementById("copy-email-btn");
  const printBtn = document.getElementById("print-summary-btn");
  const actionStatus = document.getElementById("action-status");

  if (copyEmailBtn) {
    copyEmailBtn.addEventListener("click", async () => {
      const email = copyEmailBtn.getAttribute("data-copy-email") || "";
      try {
        await navigator.clipboard.writeText(email);
        if (actionStatus) actionStatus.textContent = `Copied ${email} to clipboard.`;
      } catch (_err) {
        if (actionStatus) actionStatus.textContent = `Email address: ${email}`;
      }
    });
  }

  if (printBtn) {
    printBtn.addEventListener("click", () => {
      window.print();
    });
  }

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
  };

  const FOCUS_NOTES = {
    lnd: "Learning & Enablement Focus: Highlights my remote onboarding curriculum sample (Analyze-Design-Develop-Implement-Evaluate), live virtual facilitation guide, 1-page Scribe-style job aid, decision tree, and AI draft review rubric.",
    ops: "Operations & Escalations Focus: Highlights source-of-truth record checks, warm-handoff accountability across up to 80 remote specialists and 900+ clinical sites, and preventive SOP tooling.",
    cs: "Customer Success & SaaS Onboarding Focus: Highlights live SaaS user documentation (Snippet Manager Pro & Engraphis), self-service API/webhook troubleshooting, Stripe billing workflows, and client follow-through.",
    data: "AI Workflows & QA Focus: Highlights factual claim gating, Python verification checks, anomaly isolation across Stripe/CRM records, and human-in-the-loop quality review.",
  };

  function applyFilter(key, updateQuery = true) {
    const cleanKey = (key || "all").toLowerCase();
    const normalized = FOCUS_MAP[cleanKey] || "all";
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

    if (grid) {
      // Switch to 2 columns when 2 or 4 cards are shown so grids stay balanced without orphan single-card rows.
      grid.classList.toggle("card-grid-2", visibleCount === 2 || visibleCount === 4);
    }

    if (statusEl) {
      const activeLabel = buttons
        .find((b) => b.getAttribute("data-filter") === normalized)
        ?.textContent?.replace(/\s*\(\d+\)\s*$/, "")
        .trim();
      statusEl.textContent =
        normalized === "all"
          ? `Showing all ${visibleCount} work samples.`
          : `Showing ${visibleCount} matching sample${visibleCount === 1 ? "" : "s"} for ${activeLabel}.`;
    }

    if (focusCallout) {
      const note = FOCUS_NOTES[normalized];
      focusCallout.hidden = !note;
      focusCallout.textContent = note || "";
    }

    if (
      updateQuery &&
      window.location.protocol !== "file:" &&
      typeof window.history?.replaceState === "function"
    ) {
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
  applyFilter(params.get("focus") || "all", false);
})();
