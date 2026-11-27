import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAgentActions, type AgentAction } from "../../src/kitchen/agents.ts";
import type { Gestures } from "../../src/kitchen/github.ts";

test("the supervisor's open gesture carries its labels, minus the locked ones (#4600)", async () => {
  const opened: Array<{ title: string; labels: string[] }> = [];
  const act = { open: async (title: string, _body: string, labels: string[] = []) => (opened.push({ title, labels }), 9) } as unknown as Gestures;
  const actions: AgentAction[] = [{ open: { title: "Main is red", body: "tests", labels: ["fire", "prio:0", "repair-main", "try:1"] } }];
  await applyAgentActions(actions, { act, issues: new Map(), log: () => {}, who: "supervisor" });
  assert.deepEqual(opened, [{ title: "Main is red", labels: ["fire", "prio:0", "repair-main"] }]);
});
