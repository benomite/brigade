import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, triesOf, type Issue, type PullRequest } from "../../src/kitchen/decide.ts";

const issue = (number: number, labels: string[] = [], extra: Partial<Issue> = {}): Issue => ({ number, title: `#${number}`, labels, trusted: true, dependsOn: [], ...extra });
const pr = (n: number, extra: Partial<PullRequest> = {}): PullRequest => ({ number: 1000 + n, issue: n, checks: "success", failing: [], conflicting: false, ...extra });
type Context = Parameters<typeof decide>[2];
const context = (extra: Partial<Context> = {}): Context => ({
  places: 2,
  passPlaces: 2,
  baseFailing: [],
  running: { cooks: [], passes: [], manager: false, supervisor: true },
  now: 0,
  lastSupervisor: 0,
  supervisorEveryMs: 15 * 60_000,
  ...extra,
});

test("takes the ready tickets by priority then age, up to the free places", () => {
  const actions = decide([issue(5, ["fire"]), issue(3, ["fire"]), issue(9, ["fire", "prio:0"])], [], context());
  assert.deepEqual(actions.filter((a) => a.kind === "take"), [{ kind: "take", issue: 9 }, { kind: "take", issue: 3 }]);
});

test("never takes a parked, idea, epic, human, untrusted or waiting ticket", () => {
  const issues = [issue(1, ["fire", "parked:chef"]), issue(2, ["fire", "idea"]), issue(3, ["fire", "epic"]), issue(4, ["fire", "human"]), issue(5, ["fire"], { trusted: false }), issue(6, ["fire"], { dependsOn: [7] }), issue(7, ["parked"]), issue(8, ["fire", "waiting"])];
  assert.deepEqual(decide(issues, [], context()).filter((a) => a.kind === "take"), []);
});

test("a full pass does not block a take (#4460)", () => {
  const issues = [issue(1, ["fire", "in-pass"]), issue(2, ["fire", "in-pass"]), issue(3, ["fire"])];
  const actions = decide(issues, [pr(1, { checks: "pending" }), pr(2, { checks: "pending" })], context({ passPlaces: 0 }));
  assert.deepEqual(actions.filter((a) => a.kind === "take"), [{ kind: "take", issue: 3 }]);
});

test("a red delivery goes back to a cook without a review, and counts a try", () => {
  const actions = decide([issue(1, ["fire", "in-pass"])], [pr(1, { checks: "failure", failing: ["runtime tests"] })], context());
  assert.deepEqual(actions, [{ kind: "send-back", issue: 1, reason: "the CI is red: runtime tests", counts: true }]);
});

test("a delivery red only on checks main has red too is not refused: it waits for main, with no try (#4560)", () => {
  const red = [issue(1, ["fire", "in-pass"])];
  const prs = [pr(1, { checks: "failure", failing: ["gates", "tests runtime (13/16)"] })];
  assert.deepEqual(decide(red, prs, context({ baseFailing: ["gates", "tests runtime (13/16)", "windows tests"] })), [{ kind: "wait-main", issue: 1, checks: ["gates", "tests runtime (13/16)"] }]);
  // Labelled as waiting, it stays in pass and is neither reviewed nor refused while main stays red.
  assert.deepEqual(decide([issue(1, ["fire", "in-pass", "waits:main"])], prs, context({ baseFailing: ["gates", "tests runtime (13/16)"] })), []);
  // While main's run is not over, nothing is decided.
  assert.deepEqual(decide(red, prs, context({ baseFailing: null })), []);
});

test("a delivery with a red check that is green on main is refused as before, naming only that check (#4560)", () => {
  const actions = decide([issue(1, ["fire", "in-pass"])], [pr(1, { checks: "failure", failing: ["gates", "tests app"] })], context({ baseFailing: ["gates"] }));
  assert.deepEqual(actions, [{ kind: "send-back", issue: 1, reason: "the CI is red: tests app", counts: true }]);
});

test("a delivery waiting for main has its CI replayed once main is green on those checks (#4560)", () => {
  const actions = decide([issue(1, ["fire", "in-pass", "waits:main"])], [pr(1, { checks: "failure", failing: ["gates"] })], context({ baseFailing: [] }));
  assert.deepEqual(actions, [{ kind: "replay", issue: 1 }]);
});

test("a conflicting delivery goes back without counting a try", () => {
  const actions = decide([issue(1, ["fire", "in-pass"])], [pr(1, { conflicting: true })], context());
  assert.deepEqual(actions, [{ kind: "send-back", issue: 1, reason: "its branch conflicts with the base branch", counts: false }]);
});

test("a pull request parked for the chef's merge that starts conflicting goes back to a cook, without counting a try (#4492)", () => {
  const issues = [issue(1, ["fire", "parked:chef", "approved"]), issue(2, ["fire", "parked:chef", "approved"]), issue(3, ["fire", "parked:chef"])];
  const actions = decide(issues, [pr(1, { conflicting: true }), pr(2), pr(3, { conflicting: true })], context());
  assert.deepEqual(actions, [{ kind: "send-back", issue: 1, reason: "its branch conflicts with the base branch", counts: false }]);
});

test("a green delivery is reviewed within the pass places; a pending one waits", () => {
  const issues = [issue(1, ["fire", "in-pass"]), issue(2, ["fire", "in-pass"]), issue(3, ["fire", "in-pass"])];
  const actions = decide(issues, [pr(1), pr(2, { checks: "none" }), pr(3, { checks: "pending" })], context({ passPlaces: 1 }));
  assert.deepEqual(actions, [{ kind: "review", issue: 1, pr: 1001 }]);
});

test("a ticket in pass without a pull request, or taken without a cook, goes back on the rail", () => {
  const actions = decide([issue(1, ["fire", "in-pass"]), issue(2, ["fire", "taken"]), issue(3, ["fire", "taken"])], [], context({ places: 1, running: { cooks: [3], passes: [], manager: true, supervisor: true } }));
  assert.deepEqual(actions, [
    { kind: "requeue", issue: 1, reason: "it is in pass with no open pull request" },
    { kind: "requeue", issue: 2, reason: "its cook is gone" },
  ]);
});

test("the manager is called when few tickets are ready, with the top of the uncalibrated backlog", () => {
  const actions = decide([issue(1), issue(2, ["prio:0"]), issue(3, ["idea"])], [], context());
  assert.deepEqual(actions, [{ kind: "manager", issues: [2, 1] }]);
  const busy = decide([issue(1)], [], context({ running: { cooks: [], passes: [], manager: true, supervisor: true } }));
  assert.deepEqual(busy, []);
});

test("the supervisor runs at its period, once at a time", () => {
  const due = context({ now: 15 * 60_000, running: { cooks: [], passes: [], manager: false, supervisor: false } });
  assert.deepEqual(decide([], [], due), [{ kind: "supervisor" }]);
  assert.deepEqual(decide([], [], { ...due, now: 60_000 }), []);
});

test("tries are read from the try:N labels", () => {
  assert.equal(triesOf(["fire", "try:2"]), 2);
  assert.equal(triesOf(["fire"]), 0);
});
