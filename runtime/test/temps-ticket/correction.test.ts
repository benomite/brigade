import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkMedian, CORRECTION_LABEL, type RailClient, type RailIssue, type TimeRecord } from "../../src/temps-ticket/correction.ts";

function record(n: number, total: number, over: Partial<TimeRecord> = {}): TimeRecord {
  const claimed = Date.parse("2026-11-01T00:00:00Z") + n * 86_400_000;
  return {
    ticket: n,
    claimedAt: new Date(claimed).toISOString(),
    mergedAt: new Date(claimed + total * 1000).toISOString(),
    cuisson: total - 240,
    cuissonTests: 60,
    attentePasse: 60,
    revue: 60,
    ci: 60,
    merge: 60,
    ...over,
  };
}

async function repo(records: TimeRecord[], projet: object = {}) {
  const dir = await mkdtemp(join(tmpdir(), "temps-correction-"));
  await mkdir(join(dir, ".claude/brigade"), { recursive: true });
  await writeFile(join(dir, ".claude/brigade/temps-tickets.json"), JSON.stringify(records));
  await writeFile(join(dir, ".claude/brigade/projet.json"), JSON.stringify(projet));
  return dir;
}

function fakeRail() {
  const issues: RailIssue[] = [];
  const created: Array<{ title: string; body: string; labels: string[] }> = [];
  const rail: RailClient = {
    async listIssues({ label }) {
      assert.equal(label, CORRECTION_LABEL);
      return issues.map((i) => ({ ...i }));
    },
    async createIssue(issue) {
      created.push(issue);
      const number = 500 + created.length;
      issues.push({ number, title: issue.title, body: issue.body, state: "open" });
      return { number };
    },
  };
  return { rail, issues, created };
}

const slow = (n: number) => record(n, 1800); // 30 min, cooking dominates

test("median over the max, no correction open: one ticket naming the phase, the median and the max", async () => {
  const dir = await repo([1, 2, 3].map(slow));
  const { rail, created } = fakeRail();
  const decision = await checkMedian(dir, rail);
  assert.deepEqual(decision, { action: "opened", number: 501, phase: "cuisson" });
  assert.equal(created.length, 1);
  for (const text of [created[0]!.title, created[0]!.body]) assert.match(text, /cooking/);
  assert.match(created[0]!.body, /30 min/);
  assert.match(created[0]!.body, /max of 15 min/);
});

test("the max comes from projet.json", async () => {
  const dir = await repo([1, 2, 3].map(slow), { tempsMaxTicketMin: 45 });
  const { rail, created } = fakeRail();
  assert.equal((await checkMedian(dir, rail)).action, "none");
  assert.equal(created.length, 0);
});

test("several slow tickets in the window still make one ticket, and a second check adds none", async () => {
  const dir = await repo(Array.from({ length: 12 }, (_, i) => slow(i + 1)));
  const { rail, created } = fakeRail();
  await checkMedian(dir, rail);
  const second = await checkMedian(dir, rail);
  assert.deepEqual(second, { action: "none", reason: "already-open", number: 501 });
  assert.equal(created.length, 1);
});

test("once the correction ticket is closed and the median is still over, a new one is created", async () => {
  const dir = await repo([1, 2, 3].map(slow));
  const { rail, issues, created } = fakeRail();
  await checkMedian(dir, rail);
  issues[0]!.state = "closed";
  const decision = await checkMedian(dir, rail);
  assert.equal(decision.action, "opened");
  assert.equal(created.length, 2);
});

test("median at or under the max: nothing is created", async () => {
  const { rail, created } = fakeRail();
  assert.equal((await checkMedian(await repo([1, 2, 3].map((n) => record(n, 900))), rail)).action, "none");
  assert.equal((await checkMedian(await repo([1, 2, 3].map((n) => record(n, 600))), rail)).action, "none");
  assert.equal(created.length, 0);
});

test("the slowest phase is the one with the largest median", async () => {
  const dir = await repo([1, 2, 3].map((n) => record(n, 1800, { cuisson: 300, ci: 1200 })));
  const { rail, created } = fakeRail();
  const decision = await checkMedian(dir, rail);
  assert.equal(decision.action === "opened" && decision.phase, "ci");
  assert.match(created[0]!.title, /CI/);
});
