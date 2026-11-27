// The kanban of a project (app/src/board/kitchen-board.ts, #4482, #4507): read from the GitHub labels alone, through the
// rail reading itself (read.ts), against a fake GitHub that answers by path — nothing goes to the network.
import assert from "node:assert/strict";
import { test } from "node:test";
import { boardOf, columnOf, kitchenBoardRead, triesOf, type KitchenBoard } from "../../src/board/kitchen-board.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/board/client.ts";
import { readTheBoardOfRepository, type BoardRead } from "../../src/board/read.ts";

const REPOSITORY = "chef/neuve";
const NOW = new Date("2026-11-26T12:00:00.000Z");
const HOUR = 3_600_000;
const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], extra: object = {}) => ({
  number,
  title: `Ticket ${number}`,
  html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
  created_at: "2026-11-25T21:00:00Z",
  labels: labels.map((name) => ({ name })),
  ...extra,
});
const pr = (number: number, ticket: number, extra: object = {}) => ({ number, title: `#${ticket} — Ticket ${ticket}`, html_url: `https://github.com/${REPOSITORY}/pull/${number}`, head: { ref: `cook/${ticket}-github` }, body: `Closes #${ticket}`, updated_at: NOW.toISOString(), ...extra });
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * HOUR).toISOString();

// One issue in each column, as the kitchen labels them (runtime/src/kitchen/kitchen.ts): #1 in the backlog, #2 ready, #3
// taken by a cook after one refusal, #4 delivered by PR #40 after two, #5 parked for the chef after the third, #6 served by
// PR #38 two hours ago. And what is none of them: a pull request the issues API lists, #7 served 30 hours ago, #9 whose PR
// was closed unmerged.
const OPEN = [
  issue(1, ["prio:2"]),
  issue(2, ["fire", "model:sonnet", "effort:medium"]),
  issue(3, ["fire", "taken", "try:1"]),
  issue(4, ["fire", "in-pass", "try:1", "try:2"]),
  issue(5, ["fire", "parked:chef", "try:3"]),
  issue(40, [], { pull_request: {} }),
];
const OPEN_PRS = [pr(40, 4)];
const CLOSED_PRS = [pr(38, 6, { merged_at: at(2) }), pr(36, 7, { merged_at: at(30), updated_at: at(30) }), pr(35, 9, { merged_at: null, updated_at: at(1) })];

function github(): { appeler: CallGitHub; paths: string[] } {
  const paths: string[] = [];
  return {
    paths,
    appeler: async (path) => {
      paths.push(path);
      if (path.startsWith(`/repos/${REPOSITORY}/issues?state=open`)) return ok(OPEN);
      if (path.startsWith(`/repos/${REPOSITORY}/pulls?state=open`)) return ok(OPEN_PRS);
      if (path.startsWith(`/repos/${REPOSITORY}/pulls?state=closed`)) return ok(CLOSED_PRS);
      if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main", permissions: { push: true } });
      return { status: 404, data: { message: "Not Found" } };
    },
  };
}

const ticketsByColumn = (board: KitchenBoard) => Object.fromEntries(board.columns.map(({ key, cards }) => [key, cards.map(({ ticket }) => ticket)]));
const cardOf = (board: KitchenBoard, ticket: number) => board.columns.flatMap(({ cards }) => cards).find((card) => card.ticket === ticket) ?? assert.fail(`no card #${ticket}`);

test("a project: one issue in each of the six columns, from its labels alone", async () => {
  const { appeler: call } = github();
  const readOne = (await readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => NOW })) as BoardRead;
  assert.equal(readOne.lu, true);
  const board = readOne.faits.kitchenBoard as KitchenBoard;
  assert.deepEqual(board.columns.map(({ title }) => title), ["Backlog", "Ready", "Cooking", "Pass", "Parked", "Served"]);
  assert.deepEqual(ticketsByColumn(board), { backlog: [1], ready: [2], cooking: [3], pass: [4], parked: [5], served: [6] });
  // Its try count and its links: the issue, and the pull request that delivers or served it.
  assert.deepEqual(cardOf(board, 3), { ticket: 3, title: "Ticket 3", url: `https://github.com/${REPOSITORY}/issues/3`, tries: 1, pr: null });
  assert.deepEqual(cardOf(board, 4), { ticket: 4, title: "Ticket 4", url: `https://github.com/${REPOSITORY}/issues/4`, tries: 2, pr: { number: 40, url: `https://github.com/${REPOSITORY}/pull/40` } });
  assert.deepEqual(cardOf(board, 5), { ticket: 5, title: "Ticket 5", url: `https://github.com/${REPOSITORY}/issues/5`, tries: 3, pr: null, forTheChef: true });
  assert.deepEqual(cardOf(board, 6), { ticket: 6, title: "Ticket 6", url: `https://github.com/${REPOSITORY}/issues/6`, tries: 0, pr: { number: 38, url: `https://github.com/${REPOSITORY}/pull/38` } });
  // The old rail stays empty, and its line says the board.
  assert.deepEqual(readOne.faits.rail, []);
  assert.deepEqual(readOne.faits.compteurs, { rail: 1, auTravail: 1, aLaPass: 1, attend: 0, livres24h: 1 });
  assert.deepEqual(readOne.cuisine.rubriques.find(({ titre: title }) => title === "rail")?.lignes, ["1 ready · 1 cooking · 1 in pass · 1 parked"]);
  // The chef's TODO reads its `parked:chef` issues from the same list (#4474); there is no "before the rail".
  assert.deepEqual(readOne.parqueesPourLeChef?.map(({ ticket }) => ticket), [5]);
  assert.equal("avantLeRail" in readOne, false);
});

// Every project is on the new kitchen (#4507): none is asked for `.brigade/kitchen.json` first, and none is read as the old
// rail — no `fire` list, no claim, no event, no check run, no station.
test("nothing of the old runtime is read: no claim, no event, no check run, no station", async () => {
  const { appeler: call, paths } = github();
  await readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => NOW });
  const read = paths.map((path) => path.replace(/[?&](per_page|page)=\d+/g, ""));
  assert.deepEqual([...new Set(read)].sort(), [
    `/repos/${REPOSITORY}`,
    `/repos/${REPOSITORY}/issues?state=open&sort=created&direction=asc`,
    `/repos/${REPOSITORY}/pulls?state=closed&sort=updated&direction=desc`,
    `/repos/${REPOSITORY}/pulls?state=open`,
  ]);
});

test("the column of an issue: parked first, whatever else it carries, then the furthest step", () => {
  assert.equal(columnOf([]), "backlog");
  assert.equal(columnOf(["idea"]), "backlog");
  assert.equal(columnOf(["fire"]), "ready");
  assert.equal(columnOf(["fire", "taken"]), "cooking");
  assert.equal(columnOf(["fire", "in-pass"]), "pass");
  assert.equal(columnOf(["fire", "taken", "parked:chef"]), "parked");
  assert.equal(columnOf(["parked"]), "parked");
  assert.equal(columnOf(["fire", "parked:until-friday"]), "parked");
  // The old process's waiting labels, which the kitchen still reads as parked (runtime/src/kitchen/decide.ts).
  assert.equal(columnOf(["fire", "waiting"]), "parked");
  assert.equal(triesOf(["try:1", "try:2"]), 2);
  assert.equal(triesOf(["fire"]), 0);
});

test("each column in the kitchen's order: priority, then age; Served, the latest merged first", () => {
  const now = NOW.getTime();
  const board = boardOf({
    issues: [issue(12, ["fire", "prio:3"]), issue(10, ["fire"]), issue(11, ["fire", "prio:1"]), issue(13, ["parked"])],
    openPrs: [],
    closedPrs: [pr(51, 20, { merged_at: at(5) }), pr(52, 21, { merged_at: at(1) }), pr(53, 20, { merged_at: at(3) })],
    now,
  });
  assert.deepEqual(ticketsByColumn(board), { backlog: [], ready: [11, 12, 10], cooking: [], pass: [], parked: [13], served: [21, 20] });
  assert.equal(cardOf(board, 20).pr?.number, 53, "the latest merge of a ticket served twice");
  assert.equal(cardOf(board, 13).forTheChef, undefined);
});

test("`kitchenBoard` read back from `facts`: the board as written, and nothing from a malformed one", () => {
  const board = boardOf({ issues: OPEN, openPrs: OPEN_PRS, closedPrs: CLOSED_PRS, now: NOW.getTime() });
  assert.deepEqual(kitchenBoardRead(JSON.parse(JSON.stringify(board))), { kitchenBoard: board });
  assert.deepEqual(kitchenBoardRead(undefined), {});
  assert.deepEqual(kitchenBoardRead({ columns: board.columns.slice(1) }), {});
  assert.deepEqual(kitchenBoardRead({ columns: board.columns.map((column) => ({ ...column, cards: [{ ticket: "1" }] })) }), {});
});
