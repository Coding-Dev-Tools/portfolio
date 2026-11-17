const test = require("node:test");
const assert = require("node:assert/strict");
const { simulate } = require("./simulator.js");

const HEADER = "employee_id,action,display_name,department,manager_email,effective_date,employment_status";

test("routes synthetic join, move, and leave events to human-review recommendations", () => {
  const result = simulate([
    HEADER,
    "EMP-1001,join,Avery Chen,Finance,mgr-finance@example.test,2026-11-02,active",
    "EMP-1002,move,Jordan Patel,People Ops,mgr-people@example.test,2026-10-01,active",
    "EMP-1003,leave,Casey Rivera,Engineering,mgr-eng@example.test,2026-10-13,terminated",
  ].join("\n"));

  assert.deepEqual(result.summary, { totalRows: 3, awaitingReview: 3, blocked: 0 });
  assert.equal(result.events[0].decision, "review-recommended");
  assert.equal(result.events[0].review_recommendation, "Request HR and manager review");
  assert.match(result.events[0].review_summary, /^Review possible/);
  assert.deepEqual(result.events[0].suggested_groups, ["APP-FINANCE-STANDARD"]);
  assert.equal(result.events[0].graph_preview.leastPrivilegedPermission, "User.Create");
  assert.equal(result.events[0].graph_preview.body, null);
  assert.deepEqual(result.events[1].suggested_groups, ["APP-PEOPLE-OPS-STANDARD"]);
  assert.deepEqual(result.events[2].suggested_groups, []);
  assert.deepEqual(result.events[2].graph_preview.body, { accountEnabled: false });
  assert.equal(result.events[2].graph_preview.sendsRequest, false);
  assert.match(result.events[2].review_summary, /Review possible account disablement/);
  assert.match(result.events[2].graph_preview.note, /no group-removal request or membership change is implemented/);
});

test("blocks unknown departments and status mismatches", () => {
  const result = simulate([
    HEADER,
    "EMP-1004,join,Sam Lee,Payroll,mgr-payroll@example.test,2026-11-02,active",
    "EMP-1005,leave,Alex Kim,Finance,mgr-finance@example.test,2026-10-13,active",
  ].join("\n"));

  assert.equal(result.summary.blocked, 2);
  assert.equal(result.events[0].graph_preview, null);
  assert.match(result.events[0].errors.join(" "), /Department is not in the approved mapping/);
  assert.match(result.events[1].errors.join(" "), /Leave events require terminated status/);
});

test("blocks every row with a duplicated employee ID", () => {
  const result = simulate([
    HEADER,
    "EMP-1006,join,Taylor Ray,Finance,mgr-finance@example.test,2026-11-02,active",
    "EMP-1006,move,Taylor Ray,Engineering,mgr-eng@example.test,2026-11-03,active",
  ].join("\n"));

  assert.equal(result.summary.blocked, 2);
  assert.ok(result.events.every((event) => event.errors.some((error) => error.includes("duplicated"))));
});

test("parses quoted CSV commas and escaped quotes", () => {
  const result = simulate([
    HEADER,
    'EMP-1007,join,"Riley, ""RJ"" Morgan",Finance,mgr-finance@example.test,2026-11-02,active',
  ].join("\n"));

  assert.equal(result.events[0].display_name, 'Riley, "RJ" Morgan');
  assert.equal(result.summary.awaitingReview, 1);
});

test("rejects malformed CSV headers and rows", () => {
  assert.throws(() => simulate("employee_id,action\nEMP-1001,join"), /Missing required column/);
  assert.throws(() => simulate(`${HEADER}\nEMP-1001,join`), /expected 7/);
  assert.throws(() => simulate(`${HEADER}\nEMP-1001,join,"unfinished`), /quoted field/);
  assert.throws(
    () => simulate(`${HEADER}\nEMP-1001,join,"Alice"junk,Finance,mgr-finance@example.test,2026-11-02,active`),
    /Unexpected character after a closing CSV quote/,
  );
  assert.throws(
    () => simulate(`${HEADER}\nEMP-1001,join,Al"ice,Finance,mgr-finance@example.test,2026-11-02,active`),
    /quote may only start at the beginning/,
  );
});
