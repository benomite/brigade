import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAgentActions, type AgentAction } from "../../src/kitchen/agents.ts";
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
  const act = { open: async (title: string, _body: string, labels: string[] = []) => (opened.push({ title, labels }), 9), labels: async () => {}, comment: async () => {} } as unknown as Gestures;
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
