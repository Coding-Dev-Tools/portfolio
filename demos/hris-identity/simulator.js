(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.JmlSimulator = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const REQUIRED = [
    "employee_id",
    "action",
    "display_name",
    "department",
    "manager_email",
    "effective_date",
    "employment_status",
  ];
  const GROUPS = {
    Finance: "APP-FINANCE-STANDARD",
    "People Ops": "APP-PEOPLE-OPS-STANDARD",
    Engineering: "APP-ENGINEERING-STANDARD",
  };

  function parseCsv(source) {
    const text = String(source).replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    let afterQuote = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else if (char === '"') {
          quoted = false;
          afterQuote = true;
        } else {
          field += char;
        }
      } else if (afterQuote) {
        if (char === ",") {
          row.push(field.trim());
          field = "";
          afterQuote = false;
        } else if (char === "\n") {
          row.push(field.trim());
          if (row.some((value) => value !== "")) rows.push(row);
          row = [];
          field = "";
          afterQuote = false;
        } else if (char === "\r") {
          continue;
        } else {
          throw new Error("Unexpected character after a closing CSV quote.");
        }
      } else if (char === '"') {
        if (field.length !== 0) throw new Error("A quote may only start at the beginning of a CSV field.");
        quoted = true;
      } else if (char === ",") {
        row.push(field.trim());
        field = "";
      } else if (char === "\n") {
        row.push(field.trim());
        if (row.some((value) => value !== "")) rows.push(row);
        row = [];
        field = "";
      } else if (char !== "\r") {
        field += char;
      }
    }
    if (quoted) throw new Error("The CSV ends inside a quoted field.");
    row.push(field.trim());
    if (row.some((value) => value !== "")) rows.push(row);
    return rows;
  }

  function isRealIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }

  function parseRecords(source) {
    const rows = parseCsv(source);
    if (rows.length < 2) throw new Error("Include a header row and at least one event row.");
    const headers = rows[0].map((header) => header.toLowerCase());
    const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
    if (duplicateHeaders.length) throw new Error(`Duplicate CSV header: ${duplicateHeaders[0]}.`);
    const missingHeaders = REQUIRED.filter((header) => !headers.includes(header));
    if (missingHeaders.length) throw new Error(`Missing required column(s): ${missingHeaders.join(", ")}.`);

    return rows.slice(1).map((values, index) => {
      if (values.length !== headers.length) {
        throw new Error(`Row ${index + 2} has ${values.length} values; expected ${headers.length}.`);
      }
      const record = {};
      headers.forEach((header, column) => { record[header] = values[column]; });
      return record;
    });
  }

  function graphPreview(record) {
    if (record.action === "leave") {
      return {
        method: "PATCH",
        path: "/v1.0/users/{id-or-userPrincipalName}",
        body: { accountEnabled: false },
        leastPrivilegedPermissions: ["User.EnableDisableAccount.All", "User.Read.All"],
        sendsRequest: false,
        note: "Reference preview only: no request is sent. It shows the accountEnabled shape; no group-removal request or membership change is implemented.",
      };
    }
    if (record.action === "join") {
      return {
        method: "POST",
        path: "/v1.0/users",
        body: null,
        leastPrivilegedPermission: "User.Create",
        sendsRequest: false,
        note: "Reference preview only: no request is sent. No create body or group-membership change is implemented; tenant-specific values and group IDs are not configured.",
      };
    }
    return {
      method: null,
      path: null,
      body: null,
      sendsRequest: false,
      note: "Reference note only: no group membership change is implemented. Any future change would need approved target group IDs and a least-privilege permission review.",
    };
  }

  function eventFor(record, duplicateId) {
    const errors = [];
    const action = record.action.toLowerCase();
    const status = record.employment_status.toLowerCase();
    const normalized = { ...record, action, employment_status: status };

    if (!record.employee_id) errors.push("Employee ID is required.");
    if (duplicateId) errors.push("Employee ID is duplicated in this file; all matching rows are blocked.");
    if (!/^[A-Z0-9-]{3,32}$/i.test(record.employee_id)) errors.push("Employee ID must use letters, numbers, or hyphens.");
    if (!record.display_name) errors.push("Display name is required.");
    if (!record.manager_email || !/^[^@\s]+@example\.test$/i.test(record.manager_email)) {
      errors.push("Manager email must use the reserved .test domain.");
    }
    if (!isRealIsoDate(record.effective_date)) errors.push("Effective date must be a real date in YYYY-MM-DD format.");
    if (!["join", "move", "leave"].includes(action)) errors.push("Action must be join, move, or leave.");
    if (!Object.hasOwn(GROUPS, record.department)) errors.push("Department is not in the approved mapping.");
    if (!["active", "terminated"].includes(status)) errors.push("Employment status must be active or terminated.");
    if ((action === "join" || action === "move") && status !== "active") errors.push("Join and move events require active status.");
    if (action === "leave" && status !== "terminated") errors.push("Leave events require terminated status.");

    const valid = errors.length === 0;
    const group = valid && action !== "leave" ? GROUPS[record.department] : null;
    const actionNames = {
      join: "Review possible account creation and baseline access",
      move: "Review possible department access mapping change",
      leave: "Review possible account disablement and access removal",
    };
    const reviewRecommendation = action === "leave"
      ? "Confirm termination with HR and request reviewer assessment"
      : "Request HR and manager review";

    return {
      employee_id: record.employee_id,
      action,
      display_name: record.display_name,
      department: record.department,
      effective_date: record.effective_date,
      decision: valid ? "review-recommended" : "blocked",
      errors,
      review_recommendation: valid ? reviewRecommendation : null,
      review_summary: valid ? actionNames[action] : "No action recommended",
      suggested_groups: valid && group ? [group] : [],
      graph_preview: valid ? graphPreview(normalized) : null,
      audit: {
        event_type: `synthetic_hris.${action || "unknown"}`,
        source: "synthetic_csv",
        employee_id: record.employee_id,
        decision: valid ? "review-recommended" : "blocked",
        external_side_effects: "none",
      },
    };
  }

  function simulate(source) {
    const records = parseRecords(source);
    const counts = new Map();
    for (const record of records) counts.set(record.employee_id, (counts.get(record.employee_id) || 0) + 1);
    const events = records.map((record) => eventFor(record, counts.get(record.employee_id) > 1));
    return {
      mode: "offline-dry-run",
      summary: {
        totalRows: events.length,
        awaitingReview: events.filter((event) => event.decision === "review-recommended").length,
        blocked: events.filter((event) => event.decision === "blocked").length,
      },
      events,
    };
  }

  return { parseCsv, simulate };
});
