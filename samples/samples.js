(() => {
  // 1. Generic accessible tablist controller
  document.querySelectorAll("[data-tablist]").forEach((list) => {
    const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
    const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls") || ""));

    function selectTab(targetTab) {
      tabs.forEach((tab, idx) => {
        const active = tab === targetTab;
        tab.setAttribute("aria-selected", active ? "true" : "false");
        if (panels[idx]) {
          panels[idx].hidden = !active;
        }
      });
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => selectTab(tab));
    });
  });

  // 2. Interactive scenario quizzes
  document.querySelectorAll("[data-quiz-question]").forEach((block) => {
    const feedback = block.querySelector("[data-quiz-feedback]");
    const options = Array.from(block.querySelectorAll("button.quiz-option"));
    options.forEach((btn) => {
      btn.addEventListener("click", () => {
        options.forEach((o) => o.classList.remove("is-correct", "is-wrong"));
        const isCorrect = btn.getAttribute("data-correct") === "true";
        btn.classList.add(isCorrect ? "is-correct" : "is-wrong");
        if (feedback) {
          feedback.textContent = btn.getAttribute("data-rationale") || "";
          feedback.className = isCorrect ? "callout callout-teal" : "callout callout-amber";
        }
      });
    });
  });

  // 3. Decision tree walker (escalation-decision-tree.html)
  const treeHost = document.getElementById("decision-tree-app");
  if (treeHost) {
    const NODES = {
      start: {
        step: "Step 1 of 4: Classify Incoming Escalation",
        prompt: "A frontline team member or partner submits an urgent issue that stalled on initial intake. What best describes the primary failure mode?",
        choices: [
          {
            label: "Conflicting Client or Billing Record (data mismatch across CRM / portal)",
            next: "record_mismatch",
            tag: "Track A: Record Audit",
          },
          {
            label: "Time-Sensitive Handoff Delay (unconfirmed receiving owner)",
            next: "stalled_handoff",
            tag: "Track B: Warm Handoff",
          },
          {
            label: "Repeated Workflow Confusion Across Multiple Specialists",
            next: "workflow_gap",
            tag: "Track C: Training & SOP Fix",
          },
        ],
      },
      record_mismatch: {
        step: "Step 2 of 4: Audit Source-of-Truth Fields",
        prompt: "Before escalating outward, check primary billing/CRM state, effective dates, and exact error payload. What do you observe?",
        choices: [
          {
            label: "Source record shows missing authorization date or outdated stakeholder contact",
            next: "warm_handoff_confirm",
            summaryAdd: "Root Cause: Incomplete intake record verified against primary system before external outreach.",
          },
          {
            label: "Both systems disagree due to webhook / integration sync failure",
            next: "tech_repro",
            summaryAdd: "Root Cause: Integration discrepancy isolated with timestamps and exact request/payload IDs.",
          },
        ],
      },
      stalled_handoff: {
        step: "Step 2 of 4: Verify Next Owner Availability",
        prompt: "Never leave an escalated ticket waiting silently in a shared queue. How do you secure accountability?",
        choices: [
          {
            label: "Confirm live contact directly, summarize verified facts, and get explicit acceptance",
            next: "warm_handoff_confirm",
            summaryAdd: "Containment: Direct owner contact completed; verified summary accepted live.",
          },
          {
            label: "Primary owner unavailable within SLA window - escalate to backup on-duty lead",
            next: "warm_handoff_confirm",
            summaryAdd: "Containment: Triggered secondary escalation matrix and notified affected partner of exact ETA.",
          },
        ],
      },
      workflow_gap: {
        step: "Step 2 of 4: Identify Training vs. Process Defect",
        prompt: "Three specialists made the same documentation mistake this week. What is the permanent fix?",
        choices: [
          {
            label: "Publish a 1-page visual Scribe job aid + 3-minute Loom walkthrough and update SOP",
            next: "sop_close",
            summaryAdd: "Prevention: Authored 1-page Scribe visual aid + Loom micro-video and updated onboarding deck.",
          },
          {
            label: "Flag confusing form validation directly to Product / Ops with concrete examples",
            next: "sop_close",
            summaryAdd: "Prevention: Logged actionable UX/validation spec to Product with three reproduced ticket links.",
          },
        ],
      },
      tech_repro: {
        step: "Step 3 of 4: Package Engineering-Ready Reproduction",
        prompt: "You isolated the exact integration condition. Package what Engineering/Product needs so they never have to bounce the ticket back.",
        choices: [
          {
            label: "Attach timestamp, expected vs. actual state, sanitized payload, and customer impact",
            next: "sop_close",
            summaryAdd: "Handoff Package: Timestamped reproduction steps + expected vs. actual JSON/UI diff attached.",
          },
        ],
      },
      warm_handoff_confirm: {
        step: "Step 3 of 4: Close Communication Loop",
        prompt: "Receiving owner has confirmed responsibility. What closes the risk for the client or family waiting on resolution?",
        choices: [
          {
            label: "Log owner name + timestamp in CRM/Jira and send written status update to stakeholder",
            next: "sop_close",
            summaryAdd: "Closure Standard: Logged named owner, timestamp, and proactive stakeholder status confirmation.",
          },
        ],
      },
      sop_close: {
        step: "Step 4 of 4: Completed Escalation Handoff Summary",
        prompt: "Audit-ready summary generated. Use this exact structure in CRM/Jira so leadership, peers, and compliance QA can verify every step.",
        terminal: true,
      },
    };

    const history = [];
    const stepEl = document.getElementById("tree-step");
    const promptEl = document.getElementById("tree-prompt");
    const choicesEl = document.getElementById("tree-choices");
    const summaryEl = document.getElementById("tree-summary");
    const resetBtn = document.getElementById("tree-reset");

    function render(nodeKey) {
      const node = NODES[nodeKey];
      if (!node) return;
      if (stepEl) stepEl.textContent = node.step;
      if (promptEl) promptEl.textContent = node.prompt;
      if (choicesEl) {
        choicesEl.innerHTML = "";
        (node.choices || []).forEach((ch) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "quiz-option";
          btn.textContent = ch.label;
          btn.addEventListener("click", () => {
            history.push(ch.summaryAdd || `Selection: ${ch.label}`);
            render(ch.next);
          });
          choicesEl.appendChild(btn);
        });
      }
      if (summaryEl) {
        const lines = history.length
          ? history.map((item, i) => `${i + 1}. ${item}`)
          : ["Select a triage path above to construct a verified handoff summary."];
        summaryEl.textContent = lines.join("\n");
      }
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        history.length = 0;
        render("start");
      });
    }
    render("start");
  }

  // 4. AI Output Verification Rubric & Diff Inspector (ai-verification-rubric.html)
  const rubricBoxes = Array.from(document.querySelectorAll("[data-rubric-check]"));
  const rubricScoreEl = document.getElementById("rubric-score");
  const rubricNoteEl = document.getElementById("rubric-note");
  if (rubricBoxes.length && rubricScoreEl) {
    function updateRubric() {
      const checked = rubricBoxes.filter((b) => b.checked).length;
      const total = rubricBoxes.length;
      rubricScoreEl.textContent = `${checked} / ${total} Verification Gates Passed`;
      if (rubricNoteEl) {
        rubricNoteEl.textContent =
          checked === total
            ? "APPROVED FOR LEARNER / PARTNER RELEASE: Every factual, tone, and evidence check passed."
            : "HOLD FOR REVISION: Complete remaining verification checks before publishing or customer delivery.";
        rubricNoteEl.className = checked === total ? "callout callout-teal" : "callout callout-amber";
      }
    }
    rubricBoxes.forEach((box) => box.addEventListener("change", updateRubric));
    updateRubric();
  }

  // 5. Webhook / API Triage Simulator (webhook-troubleshooting-job-aid.html)
  const webhookBtns = Array.from(document.querySelectorAll("[data-webhook-case]"));
  if (webhookBtns.length) {
    const CASES = {
      auth_401: {
        title: "HTTP 401 Unauthorized - Scoped Token or Header Mismatch",
        payload: 'POST /v1/webhooks/dispatch\nAuthorization: Bearer pk_live_***\n\nResponse: 401 {"error":"invalid_scope_or_header","expected":"Authorization: Bearer sk_..."}',
        diagnosis: "1. Confirm environment match (test vs. live credentials).\n2. Verify required header syntax and active permission scopes.\n3. Rotate key only after testing read-only endpoint first.",
        comms: "Customer Update Template: We isolated a credential scope mismatch on this webhook endpoint. No event data was lost. Updating the authorization token to an active secret key resolves the 401 response.",
      },
      schema_400: {
        title: "HTTP 400 Bad Request - Date Format or Required JSON Field Missing",
        payload: 'POST /v1/events/sync\n{"account_id":"acct_492","effective_date":"11/16/2026"}\n\nResponse: 400 {"error":"invalid_date_iso8601","field":"effective_date"}',
        diagnosis: "1. Check required keys in schema documentation against captured payload.\n2. Normalize timestamps and dates to ISO-8601 (YYYY-MM-DD).\n3. Replay validated payload once schema validates cleanly.",
        comms: "Customer Update Template: The sync rejected because effective_date arrived as MM/DD/YYYY instead of ISO-8601 (YYYY-MM-DD). Updating the upstream date mapping clears the 400 validation error.",
      },
      sig_mismatch: {
        title: "Webhook Signature Verification Failed (Raw vs. Parsed Body)",
        payload: 'X-Webhook-Signature: t=1794826292,v1=9f4a...\nMiddleware parsed JSON before HMAC computation.\n\nResponse: 400 {"error":"signature_verification_failed"}',
        diagnosis: "1. Verify handler passes raw request bytes into signature check before JSON parsing.\n2. Confirm server clock skew is under tolerance window.\n3. Re-test with a fresh signed event rather than re-posting edited JSON.",
        comms: "Customer Update Template: The payload arrived intact, but signature verification ran after body parsing reformatted whitespace. Verifying against the raw request body restores clean webhook acceptance.",
      },
    };
    const titleEl = document.getElementById("wh-title");
    const payloadEl = document.getElementById("wh-payload");
    const diagEl = document.getElementById("wh-diagnosis");
    const commsEl = document.getElementById("wh-comms");

    function showCase(key, activeBtn) {
      const data = CASES[key];
      if (!data) return;
      webhookBtns.forEach((b) => b.setAttribute("aria-selected", b === activeBtn ? "true" : "false"));
      if (titleEl) titleEl.textContent = data.title;
      if (payloadEl) payloadEl.textContent = data.payload;
      if (diagEl) diagEl.textContent = data.diagnosis;
      if (commsEl) commsEl.textContent = data.comms;
    }
    webhookBtns.forEach((btn) => {
      btn.addEventListener("click", () => showCase(btn.getAttribute("data-webhook-case"), btn));
    });
    showCase("auth_401", webhookBtns[0]);
  }
})();
