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

  // Inline 30-Second Proof Workbench on homepage
  const homeTablist = document.querySelector("[data-home-tablist]");
  if (homeTablist) {
    const tabs = Array.from(homeTablist.querySelectorAll('[role="tab"]'));
    function selectHomeTab(targetTab, focusTab = false) {
      tabs.forEach((tab) => {
        const active = tab === targetTab;
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.setAttribute("tabindex", active ? "0" : "-1");
        const panel = document.getElementById(tab.getAttribute("aria-controls") || "");
        if (panel) panel.hidden = !active;
      });
      if (focusTab) targetTab.focus();
    }
    tabs.forEach((tab, idx) => {
      tab.addEventListener("click", () => selectHomeTab(tab, false));
      tab.addEventListener("keydown", (event) => {
        let next = null;
        if (event.key === "ArrowRight") next = (idx + 1) % tabs.length;
        else if (event.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        if (next !== null) {
          event.preventDefault();
          selectHomeTab(tabs[next], true);
        }
      });
    });
  }

  const wbHcOut = document.getElementById("wb-hc-output");
  const WB_HC_NOTES = {
    elig:
      "[SYNTHETIC CASE - ELIGIBILITY QA] Primary payer portal verified active effective 2026-11-01 (CRM cache showed stale 2026-10-31 term). Confirmed coverage window for clinic coordinator, logged verification timestamp in CRM, and flagged sync lag for Ops review.",
    afterhours:
      "[SYNTHETIC CASE - AFTER-HOURS WARM HANDOFF] Verified active on-call roster for Clinic Site #204. Primary on-call clinician confirmed callback live at 21:14 ET; logged named receiving owner, timestamp, and written facility confirmation.",
  };
  const wbHcButtons = Array.from(document.querySelectorAll("[data-wb-hc]"));
  wbHcButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-wb-hc");
      wbHcButtons.forEach((b) => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
      if (wbHcOut && Object.hasOwn(WB_HC_NOTES, key)) wbHcOut.textContent = WB_HC_NOTES[key];
    });
  });

  const wbRunCheck = document.getElementById("wb-run-check");
  const wbTechOut = document.getElementById("wb-tech-output");
  if (wbRunCheck && wbTechOut) {
    wbRunCheck.addEventListener("click", () => {
      wbTechOut.textContent =
        "BLOCKED (2 integration defects caught prior to production sync):\n" +
        "1. [HTTP 400 Schema] effective_date='11/16/2026' rejected; normalize to ISO-8601 (2026-11-16) in Zapier/Python formatter.\n" +
        "2. [Stripe Webhook 400] Middleware ran JSON.parse() before HMAC-SHA256 verification; pass raw request bytes to constructEvent().";
    });
  }

  if (!buttons.length || !cards.length) return;

  const FOCUS_MAP = {
    all: "all",
    healthcare: "healthcare",
    payer: "healthcare",
    lnd: "lnd",
    learning: "lnd",
    enablement: "lnd",
    ops: "ops",
    operations: "ops",
    qa: "ops",
    cs: "cs",
    success: "cs",
    support: "cs",
    data: "data",
    ai: "data",
    web: "data",
  };

  const FOCUS_NOTES = {
    healthcare: "Healthcare Operations Lens: Highlights remote supervision of up to 80 specialists across 900+ clinical sites and 200+ CenterWell locations, Medicaid/payer eligibility QA, after-hours clinical routing, and Epic/Jira/CRM SOPs.",
    lnd: "Enablement & L&D Lens: Highlights the Healthcare QA calibration matrix, ADDIE onboarding curriculum, 45-minute vILT run-of-show, 1-page job aid, decision tree, and AI content review gate.",
    ops: "Escalations & QA Lens: Highlights primary-source record verification, confirmed warm handoffs, live pre-release QA gates, and unit-tested CSV access-rule validation.",
    cs: "Tech Support & SaaS Lens: Highlights self-service onboarding, REST API/webhook and Stripe billing troubleshooting, 11,800+ member user enablement, and clear customer update templates.",
    data: "Automation & AI QA Lens: Highlights live browser QA gating, Python verification patterns, Zapier/REST webhook diagnostics, and client-side CSV schema validation.",
  };

  function applyFilter(key, updateQuery = true) {
    const cleanKey = (key || "all").toLowerCase();
    const normalized = Object.hasOwn(FOCUS_MAP, cleanKey) ? FOCUS_MAP[cleanKey] : "all";
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
      const note = Object.hasOwn(FOCUS_NOTES, normalized) ? FOCUS_NOTES[normalized] : "";
      focusCallout.hidden = !note;
      focusCallout.textContent = note;
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
