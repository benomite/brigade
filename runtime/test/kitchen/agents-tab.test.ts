import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { kitchenDirOf, serveKitchenAgents } from "../../src/kitchen/agents-tab.ts";

test("the Agents tab of a project on the new kitchen lists its four agents and each one's last runs", () => {
  const station = mkdtempSync(join(tmpdir(), "station-"));
  const kitchen = join(station, "kitchen", "brigade");
  mkdirSync(join(kitchen, "runs"), { recursive: true });
  const ended = join(kitchen, "done", "1-cook-7");
  mkdirSync(ended, { recursive: true });
  writeFileSync(join(ended, "meta.json"), JSON.stringify({ kind: "cook", issue: 7, pr: null, started: Date.now() - 60_000, worktree: null }));
  writeFileSync(join(ended, "stream.jsonl"), `${JSON.stringify({ type: "result", result: "work\nAll criteria hold." })}\n`);

  assert.equal(kitchenDirOf(join(station, "etat", "brigade")), kitchen);
  assert.equal(kitchenDirOf(join(station, "etat", "other")), null);
  const agents = serveKitchenAgents(kitchen, "/api/agents", new Date()).corps as Array<{ id: string; state: string; figures: Array<{ label: string; value: number }> }>;
  assert.deepEqual(agents.map((agent) => agent.id), ["manager", "cook", "pass", "supervisor"]);
  assert.equal(agents[1]?.figures.find((figure) => figure.label === "Runs")?.value, 1);
  const thread = serveKitchenAgents(kitchen, "/api/agents/cook/gestures", new Date()).corps as Array<{ summary: string; issue: number }>;
  assert.deepEqual(thread.map(({ summary, issue }) => ({ summary, issue })), [{ summary: "#7: All criteria hold.", issue: 7 }]);
});
