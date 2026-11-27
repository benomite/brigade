import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAgentActions, parseAgentActions, type AgentAction } from "../../src/kitchen/agents.ts";
import { closeFinishedEpics } from "../../src/epics.ts";
import type { Gestures } from "../../src/kitchen/github.ts";

test("the supervisor's open gesture carries its labels, minus the locked ones (#4600)", async () => {
  const opened: Array<{ title: string; labels: string[] }> = [];
  const act = { open: async (title: string, _body: string, labels: string[] = []) => (opened.push({ title, labels }), 9) } as unknown as Gestures;
  const actions: AgentAction[] = [{ open: { title: "Main is red", body: "tests", labels: ["fire", "prio:0", "repair-main", "try:1"] } }];
  await applyAgentActions(actions, { act, issues: new Map(), log: () => {}, who: "supervisor" });
  assert.deepEqual(opened, [{ title: "Main is red", labels: ["fire", "prio:0", "repair-main"] }]);
});

test("a manager split opens its children fired, at the parent's priority (#4672)", async () => {
  const opened: Array<{ title: string; labels: string[] }> = [];
  const act = { open: async (title: string, _body: string, labels: string[] = []) => (opened.push({ title, labels }), 9), labels: async () => {}, createBranch: async () => {}, comment: async () => {} } as unknown as Gestures;
  const issues = new Map([[5, { number: 5, title: "t", labels: ["fire", "prio:2"], trusted: true, dependsOn: [] }]]);
  await applyAgentActions([{ split: 5, tickets: [{ title: "a", body: "b" }, { title: "c", body: "d" }] }], { act, issues, log: () => {}, who: "manager" });
  assert.deepEqual(opened.map((one) => one.labels), [["fire", "prio:2"], ["fire", "prio:2"]]);
});

test("an epic whose children are all closed is closed; one with an open child stays (#4672)", async () => {
  const closed: number[] = [];
  const act = { close: async (n: number) => (closed.push(n), "") };
  const issue = (number: number, labels: string[], epic?: number) => ({ number, title: "t", labels, trusted: true, dependsOn: [], epic });
  const comments = async () => [{ body: "Split by the manager into #11, #12." }];
  await closeFinishedEpics([issue(10, ["epic"])], comments, act, () => {});
  assert.deepEqual(closed, [10]);
  await closeFinishedEpics([issue(10, ["epic"]), issue(11, ["fire"], 10)], comments, act, () => {});
  assert.deepEqual(closed, [10]);
});

test("a manager split of an epic opens up to 30 children and creates epic/<n> from main once; the supervisor cannot split (#4700)", async () => {
  const opened: string[] = [];
  const branches: string[][] = [];
  const act = { open: async (title: string) => (opened.push(title), 20 + opened.length), labels: async () => {}, comment: async () => {}, createBranch: async (name: string, from: string) => void branches.push([name, from]) } as unknown as Gestures;
  const issues = new Map([[9, { number: 9, title: "big", labels: ["epic"], trusted: true, dependsOn: [] }]]);
  const tickets = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `t${i}`, body: "x" }));
  await applyAgentActions([{ split: 9, tickets: tickets(12) }], { act, issues, log: () => {}, who: "manager" });
  assert.equal(opened.length, 12);
  assert.deepEqual(branches, [["epic/9", "main"]]);
  await applyAgentActions([{ split: 9, tickets: tickets(31) }], { act, issues, log: () => {}, who: "manager" });
  await applyAgentActions([{ split: 9, tickets: tickets(2) }], { act, issues, log: () => {}, who: "supervisor" });
  assert.equal(opened.length, 12);
  assert.equal(branches.length, 1);
});

test("a split whose ticket body holds a fenced code block is still read: the closing fence is the one at a line's start (#4730)", () => {
  const body = "Run it:\n```bash\nbrigade status\n```\nThen check.";
  const answer = `Splitting.\n\n\`\`\`json\n${JSON.stringify({ actions: [{ split: 9, tickets: [{ title: "One", body }, { title: "Two", body: "b" }] }] })}\n\`\`\`\n`;
  const actions = parseAgentActions(answer);
  assert.equal(actions.length, 1);
  assert.deepEqual((actions[0] as { tickets: Array<{ body: string }> }).tickets.map((one) => one.body), [body, "b"]);
});

test("a split's `Depends on ticket K` becomes `Depends on #<K-th child>`; a K that is itself or later is dropped (#4754)", async () => {
  const bodies: string[] = [];
  let next = 100;
  const act = { open: async (_title: string, body: string) => (bodies.push(body), next++), labels: async () => {}, createBranch: async () => {}, comment: async () => {} } as unknown as Gestures;
  const issues = new Map([[5, { number: 5, title: "t", labels: [], trusted: true, dependsOn: [] }]]);
  const tickets = [{ title: "a", body: "A" }, { title: "b", body: "B\n\nDepends on ticket 3" }, { title: "c", body: "C\n\nDepends on ticket 1" }];
  await applyAgentActions([{ split: 5, tickets }], { act, issues, log: () => {}, who: "manager" });
  assert.match(bodies[2], /Depends on #100\b/);
  assert.doesNotMatch(bodies[1], /Depends on/);
});
