(() => {
  // 0. Synthetic Healthcare & Payer Operations QA scenarios
  const HC_CASES = {
    eligibility_date: {
      title: "Medicaid / Managed-Care Eligibility Effective-Date Mismatch",
      mistake:
        "Specialist tells the clinic the member is inactive based solely on a stale CRM banner without checking the payer portal coverage effective window or secondary plan ID, causing an avoidable appointment cancellation.",
      standard:
        "Audit the primary payer portal effective and term dates against the intake timestamp, confirm active plan code and PCP assignment, document verified dates in CRM/Jira, and provide the clinic a clear status confirmation.",
      steps: [
        "Verify member coverage effective date, plan code, and eligibility status directly in the primary health-plan portal rather than relying on cached intake summaries.",
        "Cross-check service date against retro-eligibility or plan-transition windows (e.g., first-of-month Medicaid plan changes).",
        "If portal and CRM disagree after verification, update the CRM case note with timestamped portal state and route any sync discrepancy to Operations/IT.",
        "Deliver plain-language status confirmation to the clinic coordinator with next steps and ticket reference ID.",
      ],
      note:
        "[SYNTHETIC CASE - ELIGIBILITY QA]\n" +
        "Track: Payer Eligibility Effective-Date Audit\n" +
        "Primary Source Checked: Health-plan eligibility portal verified active effective 2026-11-01 (CRM cache showed prior plan term 2026-10-31).\n" +
        "Action Taken: Confirmed active plan code for scheduled clinic visit; logged portal verification timestamp in CRM; flagged sync lag for Ops review.\n" +
        "Stakeholder Loop: Clinic coordinator notified in writing with confirmed coverage window and case reference.",
    },
    afterhours_handoff: {
      title: "After-Hours Urgent Clinical Routing & Warm-Handoff Verification",
      mistake:
        "Specialist drops an urgent after-hours physician callback message into a shared queue without verifying the live on-call rotation or confirming receiving-clinician acknowledgment.",
      standard:
        "Validate the active after-hours on-call roster for the specific facility, confirm complete callback and symptom intake fields, secure live named acknowledgment (or trigger secondary backup within escalation window), and log timestamps.",
      steps: [
        "Confirm facility location code and active after-hours on-call clinician roster before initiating dispatch.",
        "Verify required intake fields (callback number, facility/clinic ID, urgency classification, concise clinical summary) with zero guesswork.",
        "Initiate warm handoff to primary on-call owner; if unacknowledged inside the protocol window, immediately escalate to backup on-duty lead.",
        "Record receiving owner name, acknowledgment timestamp, and closed communication loop in CRM and Epic/portal log.",
      ],
      note:
        "[SYNTHETIC CASE - AFTER-HOURS WARM HANDOFF]\n" +
        "Track: Urgent Clinical Routing & Ownership Confirmation\n" +
        "Facility Roster Verified: Confirmed active after-hours on-call coverage for Clinic Site #204.\n" +
        "Handoff Status: Primary on-call clinician acknowledged callback live at 21:14 ET (backup path stood down).\n" +
        "Audit Trail: Logged named receiving owner, acceptance timestamp, and written confirmation to requesting facility.",
    },
    auth_audit: {
      title: "Prior-Authorization & Service Documentation Completeness QA",
      mistake:
        "Case is routed to payer review missing ordering-provider NPI, date-range alignment, or required clinical progress summary, triggering an automatic payer pend and multi-day delay.",
      standard:
        "Run a 4-point pre-submission completeness check (active coverage dates, ordering provider credentials, matching service code/units, attached signed notes) before releasing to payer intake.",
      steps: [
        "Confirm authorization request dates fall strictly inside active eligibility and service-plan windows.",
        "Verify ordering provider details, service code, unit count, and supporting progress notes are complete and legible.",
        "Catch and resolve missing fields with the clinic coordinator prior to submission instead of letting the payer pend the request.",
        "If 3+ incomplete submissions share the same missing field across a week, ship a 1-page visual intake checklist to the team.",
      ],
      note:
        "[SYNTHETIC CASE - AUTHORIZATION COMPLETENESS QA]\n" +
        "Track: Pre-Submission Documentation Audit\n" +
        "Pre-Check Result: Caught missing service-date alignment and unsigned addendum prior to payer submission.\n" +
        "Action Taken: Coordinated corrected documentation with clinic office same day; verified all 4 completeness gates passed before submission.\n" +
        "Prevention: Logged recurring missing-field pattern for Friday shift QA coaching.",
    },
  };

  function updateHealthcarePanel(caseKey) {
    const data = HC_CASES[caseKey];
    if (!data) return;
    const titleEl = document.getElementById("hc-title");
    const mistakeEl = document.getElementById("hc-mistake");
    const standardEl = document.getElementById("hc-standard");
    const stepsEl = document.getElementById("hc-steps");
    const noteEl = document.getElementById("hc-note");
    const copyStatus = document.getElementById("hc-copy-status");
    if (titleEl) titleEl.textContent = data.title;
    if (mistakeEl) mistakeEl.textContent = data.mistake;
    if (standardEl) standardEl.textContent = data.standard;
    if (noteEl) noteEl.textContent = data.note;
    if (copyStatus) copyStatus.textContent = "";
    if (stepsEl) {
      stepsEl.replaceChildren();
      data.steps.forEach((step) => {
        const li = document.createElement("li");
        li.textContent = step;
        stepsEl.appendChild(li);
      });
    }
  }

  const hcCopyBtn = document.getElementById("hc-copy-note");
  if (hcCopyBtn) {
    hcCopyBtn.addEventListener("click", async () => {
      const noteEl = document.getElementById("hc-note");
      const statusEl = document.getElementById("hc-copy-status");
      try {
        await navigator.clipboard.writeText(noteEl?.textContent || "");
        if (statusEl) statusEl.textContent = "Healthcare escalation handoff note copied to clipboard.";
      } catch (_err) {
        if (statusEl) statusEl.textContent = "Copy ready: highlight the handoff note above.";
      }
    });
  }

  // 1. Unified WAI-ARIA Tablist controller (standard panels, dynamic webhook views, dynamic healthcare views)
  const WEBHOOK_CASES = {
    auth_401: {
      title: "HTTP 401 / 403 - Webhook Auth Token or Permission Scope Mismatch",
      payload:
        'POST /v1/webhooks/endpoints\nAuthorization: Bearer api_tok_readonly_***\n\n' +
        'Response: 403 {"error":"insufficient_scope","required":"webhooks:write","environment":"production"}',
      steps: [
        "Verify whether the request targets test/sandbox vs. production and confirm the API key matches that environment.",
        "Confirm token permission scopes include webhooks:write (read-only tokens fail cleanly with 401/403).",
        "If testing client-side vs. server-side keys, move write operations strictly to server configuration with secret keys before rotating tokens.",
      ],
      comms:
        "Customer Update Template: We isolated an environment/scope mismatch on your webhook management key (read-only scope against a write endpoint). No queued events were lost. Updating the server environment variable to a webhooks:write credential clears the 403 response.",
    },
    schema_400: {
      title: "HTTP 400 Bad Request - Date Format or Required JSON Field Missing",
      payload:
        'POST /v1/events/sync\n{"account_id":"acct_492","effective_date":"11/16/2026"}\n\n' +
        'Response: 400 {"error":"invalid_date_iso8601","field":"effective_date"}',
      steps: [
        "Inspect required keys and field types in the API schema guide against the captured request body.",
        "Normalize timestamps and calendar dates to ISO-8601 (YYYY-MM-DD) in Zapier or Python middleware prior to serialization.",
        "Replay one single validated test record before re-enabling scheduled batch syncs.",
      ],
      comms:
        "Customer Update Template: The sync rejected because effective_date arrived as MM/DD/YYYY instead of ISO-8601 (YYYY-MM-DD). Updating the date formatter in your workflow step resolves the 400 validation error.",
    },
    sig_mismatch: {
      title: "Webhook Signature Verification Failed (Parsed vs. Raw Request Body)",
      payload:
        'Stripe-Signature: t=1794826292,v1=9f4a...\nMiddleware ran JSON.parse() before cryptographic HMAC-SHA256 verification.\n\n' +
        'Response: 400 {"error":"webhook_signature_verification_failed"}',
      steps: [
        "Confirm the webhook route passes raw, unparsed request bytes into constructEvent() / HMAC verification before any JSON body parser runs.",
        "Confirm the endpoint webhook signing secret (whsec_...) matches the destination environment and clock skew stays within tolerance.",
        "Trigger a fresh signed test event from the Stripe dashboard rather than re-posting hand-edited JSON.",
      ],
      comms:
        "Customer Update Template: Webhook requests reached your endpoint intact, but body parsing altered whitespace before cryptographic signature verification. Passing raw bytes into the signature check restores 200 OK delivery.",
    },
  };

  function updateWebhookPanel(caseKey) {
    const data = WEBHOOK_CASES[caseKey];
    if (!data) return;
    const titleEl = document.getElementById("wh-title");
    const payloadEl = document.getElementById("wh-payload");
    const stepsEl = document.getElementById("wh-diagnosis");
    const commsEl = document.getElementById("wh-comms");
    const copyStatus = document.getElementById("wh-copy-status");
    if (titleEl) titleEl.textContent = data.title;
    if (payloadEl) payloadEl.textContent = data.payload;
    if (stepsEl) {
      stepsEl.replaceChildren();
      data.steps.forEach((step) => {
        const li = document.createElement("li");
        li.textContent = step;
        stepsEl.appendChild(li);
      });
    }
    if (commsEl) commsEl.textContent = data.comms;
    if (copyStatus) copyStatus.textContent = "";
  }

  const whCopyBtn = document.getElementById("wh-copy-comms");
  if (whCopyBtn) {
    whCopyBtn.addEventListener("click", async () => {
      const commsEl = document.getElementById("wh-comms");
      const statusEl = document.getElementById("wh-copy-status");
      try {
        await navigator.clipboard.writeText(commsEl?.textContent || "");
        if (statusEl) statusEl.textContent = "Customer update template copied to clipboard.";
      } catch (_err) {
        if (statusEl) statusEl.textContent = "Copy ready: highlight the template above.";
      }
    });
  }

  document.querySelectorAll("[data-tablist]").forEach((list) => {
    const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return;
    const isDynamicWebhook = tabs.some((t) => t.hasAttribute("data-webhook-case"));
    const isDynamicHc = tabs.some((t) => t.hasAttribute("data-hc-case"));
    const isDynamic = isDynamicWebhook || isDynamicHc;

    function selectTab(targetTab, focusTab = false) {
      tabs.forEach((tab) => {
        const active = tab === targetTab;
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.setAttribute("tabindex", active ? "0" : "-1");

        const panelId = tab.getAttribute("aria-controls");
        const panel = panelId ? document.getElementById(panelId) : null;
        if (panel && !isDynamic) {
          panel.hidden = !active;
        }
      });

      if (isDynamicWebhook) {
        const panel = document.getElementById(targetTab.getAttribute("aria-controls") || "");
        if (panel && targetTab.id) panel.setAttribute("aria-labelledby", targetTab.id);
        updateWebhookPanel(targetTab.getAttribute("data-webhook-case"));
      } else if (isDynamicHc) {
        const panel = document.getElementById(targetTab.getAttribute("aria-controls") || "");
        if (panel && targetTab.id) panel.setAttribute("aria-labelledby", targetTab.id);
        updateHealthcarePanel(targetTab.getAttribute("data-hc-case"));
      }

      if (focusTab) targetTab.focus();
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => selectTab(tab, false));
      tab.addEventListener("keydown", (event) => {
        let nextIndex = null;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = tabs.length - 1;
        if (nextIndex !== null) {
          event.preventDefault();
          selectTab(tabs[nextIndex], true);
        }
      });
    });

    const initialTab = tabs.find((t) => t.getAttribute("aria-selected") === "true") || tabs[0];
    selectTab(initialTab, false);
  });

  // 2. Interactive scenario quiz with live score counter & Reset
  const quizQuestions = Array.from(document.querySelectorAll("[data-quiz-question]"));
  const quizScoreEl = document.getElementById("quiz-score");
  const quizResetBtn = document.getElementById("quiz-reset");

  function refreshQuizScore() {
    if (!quizScoreEl || !quizQuestions.length) return;
    const correctCount = quizQuestions.filter((q) => q.getAttribute("data-answered-correct") === "true").length;
    quizScoreEl.textContent = `Score: ${correctCount} / ${quizQuestions.length} Correct`;
  }

  quizQuestions.forEach((block) => {
    const feedback = block.querySelector("[data-quiz-feedback]");
    const options = Array.from(block.querySelectorAll("button.quiz-option"));
    options.forEach((btn) => {
      btn.addEventListener("click", () => {
        options.forEach((o) => {
          o.classList.remove("is-correct", "is-wrong");
          o.setAttribute("aria-pressed", "false");
        });
        const isCorrect = btn.getAttribute("data-correct") === "true";
        btn.classList.add(isCorrect ? "is-correct" : "is-wrong");
        btn.setAttribute("aria-pressed", "true");
        block.setAttribute("data-answered-correct", isCorrect ? "true" : "false");
        if (feedback) {
          const prefix = isCorrect ? "[Correct] " : "[Needs review] ";
          feedback.textContent = prefix + (btn.getAttribute("data-rationale") || "");
          feedback.className = isCorrect ? "callout callout-teal" : "callout callout-amber";
        }
        refreshQuizScore();
      });
    });
  });

  if (quizResetBtn) {
    quizResetBtn.addEventListener("click", () => {
      quizQuestions.forEach((block) => {
        block.removeAttribute("data-answered-correct");
        block.querySelectorAll("button.quiz-option").forEach((btn) => {
          btn.classList.remove("is-correct", "is-wrong");
          btn.removeAttribute("aria-pressed");
        });
        const feedback = block.querySelector("[data-quiz-feedback]");
        if (feedback) {
          feedback.textContent = "";
          feedback.className = "";
        }
      });
      refreshQuizScore();
    });
  }
  refreshQuizScore();

  // 3. Decision tree walker (4 complete steps per track, 2+ real branches at every step, Back button, Copy Note)
  const treeHost = document.getElementById("decision-tree-app");
  if (treeHost) {
    const NODES = {
      start: {
        stepNum: 1,
        title: "Classify Incoming Escalation",
        prompt: "A frontline specialist or partner flags an issue that stalled at intake. Select the primary failure mode:",
        choices: [
          {
            label: "Track A: Conflicting Client or Billing Record (CRM / portal mismatch)",
            next: "record_mismatch",
            summaryAdd: "Triage Track: Record Mismatch Audit (CRM vs. primary portal state).",
          },
          {
            label: "Track B: Time-Sensitive Handoff Delay (unconfirmed receiving owner)",
            next: "stalled_handoff",
            summaryAdd: "Triage Track: Urgent Warm-Handoff Owner Confirmation.",
          },
          {
            label: "Track C: Repeat Process Confusion Across Multiple Specialists",
            next: "workflow_gap",
            summaryAdd: "Triage Track: Repeat Workflow Defect & Enablement Fix.",
          },
        ],
      },
      record_mismatch: {
        stepNum: 2,
        title: "Audit Source-of-Truth Fields",
        prompt: "Before routing externally, verify effective dates, billing status, and request error logs. What did you find?",
        choices: [
          {
            label: "Intake record missed an authorization date or stakeholder contact update",
            next: "warm_handoff_confirm",
            summaryAdd: "Root Cause: Corrected missing intake fields against primary system of record.",
          },
          {
            label: "Systems disagree because an automated webhook or sync event failed",
            next: "tech_repro",
            summaryAdd: "Root Cause: Isolated integration sync discrepancy with timestamps and payload IDs.",
          },
        ],
      },
      stalled_handoff: {
        stepNum: 2,
        title: "Verify Receiving Owner Availability",
        prompt: "Never leave an urgent escalation sitting unacknowledged in a shared queue. Secure named ownership:",
        choices: [
          {
            label: "Contact primary on-call/partner lead live and deliver verified summary",
            next: "warm_handoff_confirm",
            summaryAdd: "Containment: Contacted primary receiving owner directly with verified context.",
          },
          {
            label: "Primary owner unavailable within SLA window - trigger secondary backup lead",
            next: "warm_handoff_confirm",
            summaryAdd: "Containment: Escalated to backup on-duty lead and updated expected response ETA.",
          },
        ],
      },
      workflow_gap: {
        stepNum: 2,
        title: "Separate Training Gap vs. System Defect",
        prompt: "Three team members hit the same issue this week. Choose the structural root-cause intervention:",
        choices: [
          {
            label: "Steps work as designed, but job aid guidance is unclear or outdated",
            next: "publish_enablement",
            summaryAdd: "Diagnosis: Workflow works, but frontline documentation lacked step-by-step clarity.",
          },
          {
            label: "Product validation allows ambiguous inputs that generate downstream tickets",
            next: "publish_enablement",
            summaryAdd: "Diagnosis: Form validation edge case reproduced for Product and Operations review.",
          },
        ],
      },
      tech_repro: {
        stepNum: 3,
        title: "Package Engineering-Ready Reproduction",
        prompt: "Capture complete diagnostics so Engineering never needs to bounce the ticket back for basics:",
        choices: [
          {
            label: "Attach timestamp, expected vs. actual state, sanitized JSON payload, and impact",
            next: "sop_close",
            summaryAdd: "Handoff Standard: Timestamped reproduction package with expected vs. actual diff attached.",
          },
          {
            label: "Replay one sanitized test event first to confirm reproducible HTTP error before filing",
            next: "sop_close",
            summaryAdd: "Handoff Standard: Confirmed reproducible error via single sanitized replay prior to Engineering escalation.",
          },
        ],
      },
      warm_handoff_confirm: {
        stepNum: 3,
        title: "Confirm Ownership & Close Communication Loop",
        prompt: "The receiving lead accepted responsibility. Confirm accountability before exiting the case:",
        choices: [
          {
            label: "Log owner name + timestamp in CRM/Jira and notify waiting partner in writing",
            next: "sop_close",
            summaryAdd: "Closure Standard: Recorded named owner, acceptance timestamp, and written stakeholder update.",
          },
          {
            label: "Set a 30-minute supervisor follow-up reminder until final partner confirmation lands",
            next: "sop_close",
            summaryAdd: "Closure Standard: Logged named owner, notified partner, and scheduled 30-minute verification check.",
          },
        ],
      },
      publish_enablement: {
        stepNum: 3,
        title: "Ship Reinforcement Asset & Verify Adoption",
        prompt: "Close the loop so repeat errors actually drop after your fix ships:",
        choices: [
          {
            label: "Publish 1-page visual job aid + brief Loom clip and QA next 10 completed cases",
            next: "sop_close",
            summaryAdd: "Prevention Shipped: Published 1-page visual aid + micro-walkthrough and queued post-launch QA.",
          },
          {
            label: "File Product/Ops change ticket with 3 examples and interim specialist workaround",
            next: "sop_close",
            summaryAdd: "Prevention Shipped: Logged Product bug with 3 case examples and interim SOP workaround.",
          },
        ],
      },
      sop_close: {
        stepNum: 4,
        title: "Audit-Ready Handoff Note Complete",
        prompt: "Copy this verified summary directly into CRM or Jira so peers, leads, and QA auditors can verify every decision.",
        terminal: true,
      },
    };

    const stack = [{ nodeKey: "start", summaryAdd: null }];
    const stepEl = document.getElementById("tree-step");
    const promptEl = document.getElementById("tree-prompt");
    const choicesEl = document.getElementById("tree-choices");
    const summaryEl = document.getElementById("tree-summary");
    const backBtn = document.getElementById("tree-back");
    const resetBtn = document.getElementById("tree-reset");
    const copyBtn = document.getElementById("tree-copy");
    const copyStatus = document.getElementById("tree-copy-status");

    function render(moveFocus = false) {
      const current = stack[stack.length - 1];
      const node = NODES[current.nodeKey];
      if (!node) return;
      if (stepEl) stepEl.textContent = `Step ${node.stepNum} of 4: ${node.title}`;
      if (promptEl) promptEl.textContent = node.prompt;
      if (backBtn) backBtn.disabled = stack.length <= 1;

      if (choicesEl) {
        choicesEl.replaceChildren();
        (node.choices || []).forEach((ch) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "quiz-option";
          btn.textContent = ch.label;
          btn.addEventListener("click", () => {
            stack.push({ nodeKey: ch.next, summaryAdd: ch.summaryAdd });
            render(true);
          });
          choicesEl.appendChild(btn);
        });
      }

      if (summaryEl) {
        const items = stack.slice(1).map((s, idx) => `${idx + 1}. ${s.summaryAdd}`);
        summaryEl.textContent = items.length
          ? items.join("\n")
          : "Select a triage path above to construct a verified handoff summary.";
      }

      if (copyStatus) copyStatus.textContent = "";

      if (moveFocus) {
        if (node.terminal && resetBtn) {
          resetBtn.focus();
        } else if (stepEl) {
          stepEl.focus();
        }
      }
    }

    if (backBtn) {
      backBtn.addEventListener("click", () => {
        if (stack.length > 1) {
          stack.pop();
          render(true);
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        stack.length = 1;
        stack[0] = { nodeKey: "start", summaryAdd: null };
        render(true);
      });
    }

    if (copyBtn && summaryEl) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(summaryEl.textContent || "");
          if (copyStatus) copyStatus.textContent = "Handoff note copied to clipboard.";
        } catch (_err) {
          if (copyStatus) copyStatus.textContent = "Copy ready: highlight the handoff note above.";
        }
      });
    }

    render(false);
  }

  // 4. AI Verification Rubric + Live Draft Gate Tester
  const rubricBoxes = Array.from(document.querySelectorAll("[data-rubric-check]"));
  const rubricScoreEl = document.getElementById("rubric-score");
  const rubricNoteEl = document.getElementById("rubric-note");
  const presetBtn = document.getElementById("rubric-preset");
  const clearBtn = document.getElementById("rubric-clear");

  if (rubricBoxes.length && rubricScoreEl) {
    function updateRubric() {
      const checked = rubricBoxes.filter((b) => b.checked).length;
      const total = rubricBoxes.length;
      rubricScoreEl.textContent = `${checked} / ${total} Verification Gates Passed`;
      if (rubricNoteEl) {
        if (checked === 0) {
          rubricNoteEl.textContent =
            "Interactive Readiness Scorer: Check each review gate above (or load a passing example) to simulate release sign-off.";
          rubricNoteEl.className = "callout callout-neutral";
        } else if (checked === total) {
          rubricNoteEl.textContent =
            "APPROVED FOR RELEASE: All 6 factual traceability, privacy, clarity, and spot-check gates passed.";
          rubricNoteEl.className = "callout callout-teal";
        } else {
          rubricNoteEl.textContent =
            `HOLD FOR REVISION (${total - checked} gate${total - checked === 1 ? "" : "s"} remaining): Resolve remaining checks before release.`;
          rubricNoteEl.className = "callout callout-amber";
        }
      }
    }

    rubricBoxes.forEach((box) => box.addEventListener("change", updateRubric));
    if (presetBtn) {
      presetBtn.addEventListener("click", () => {
        rubricBoxes.forEach((b) => { b.checked = true; });
        updateRubric();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        rubricBoxes.forEach((b) => { b.checked = false; });
        updateRubric();
      });
    }
    updateRubric();
  }

  // Live Draft QA Gate Tester on ai-verification-rubric.html
  const draftInput = document.getElementById("qa-draft-input");
  const draftRunBtn = document.getElementById("qa-draft-run");
  const draftFailBtn = document.getElementById("qa-draft-load-fail");
  const draftPassBtn = document.getElementById("qa-draft-load-pass");
  const draftResult = document.getElementById("qa-draft-result");

  if (draftInput && draftRunBtn && draftResult) {
    const GATE_RULES = [
      {
        label: "Unsupported blanket claim",
        re: /\b(100%\s*(error-free|guaranteed|accurate|compliant)|always\s+guaranteed|all\s+50\s+states\s+verified)\b/i,
        fix: "Replace blanket claims with observed scope and cited source records.",
      },
      {
        label: "Unsafe privacy / PHI workaround",
        re: /\b(email\s+(patient|member)\s+(spreadsheet|csv|ssn|phi)|send\s+unencrypted|bypass\s+intake)\b/i,
        fix: "Route strictly through approved encrypted queues with redacted references.",
      },
      {
        label: "Unverified percentage metric",
        re: /\b(cuts?\s+ramp\s+time\s+by\s+\d+%|reduces?\s+errors?\s+by\s+\d+%|increases?\s+retention\s+by\s+\d+%)\b/i,
        fix: "Cite a real exported denominator and timeframe, or remove the unverified percentage.",
      },
      {
        label: "Escalation suppression risk",
        re: /\b(never\s+escalate|never\s+bother\s+(clinical|supervisors?|leads?)|skip\s+(schema|qa)\s+checks?)\b/i,
        fix: "Specify explicit escalation criteria and receiving owners when standard steps fail.",
      },
    ];

    function runDraftGate() {
      const text = (draftInput.value || "").trim();
      if (!text) {
        draftResult.className = "callout callout-neutral mt-sm";
        draftResult.textContent = "Paste or load a sample draft above to run the pre-release QA gate.";
        return;
      }
      const hits = GATE_RULES.filter((r) => r.re.test(text));
      if (!hits.length) {
        draftResult.className = "callout callout-teal mt-sm";
        draftResult.textContent =
          "PASS (0 policy or unverified-claim defects detected): Ready for final human SME sign-off.";
      } else {
        draftResult.className = "callout callout-amber mt-sm";
        draftResult.textContent =
          `BLOCKED (${hits.length} defect${hits.length === 1 ? "" : "s"} caught): ` +
          hits.map((h) => `[${h.label}] ${h.fix}`).join(" | ");
      }
    }

    draftRunBtn.addEventListener("click", runDraftGate);
    if (draftFailBtn) {
      draftFailBtn.addEventListener("click", () => {
        draftInput.value =
          "Our updated SOP cuts ramp time by 42% and guarantees 100% error-free intake. If the portal lags, email patient spreadsheets directly and skip QA checks.";
        runDraftGate();
      });
    }
    if (draftPassBtn) {
      draftPassBtn.addEventListener("click", () => {
        draftInput.value =
          "Follow the approved 1-page visual intake guide. If portal sync fails, capture a redacted timestamped screenshot, route through the encrypted queue, and notify your on-duty lead.";
        runDraftGate();
      });
    }
    runDraftGate();
  }
})();
