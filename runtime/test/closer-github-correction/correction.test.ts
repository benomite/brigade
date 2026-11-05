import { test } from "node:test";
import assert from "node:assert/strict";
import { writeCorrection, CORRECTION_LABEL, type CorrectionIssue, type GithubClient } from "../../src/closer-github-correction/correction.ts";
import type { Finding } from "../../src/closer-github-durees/derive.ts";

const FINDING: Finding = {
  cause: "slow-tests",
  sentence: "The tests got slow: a ticket's tests went from 2 min to 12 min.",
  numbers: {
    since: "2026-11-01T00:00:00.000Z",
    tickets: { before: 4, after: 4 },
    medianSeconds: { before: 600, after: 1200 },
    part: "tests",
    partMedianSeconds: { before: 120, after: 720 },
    partShare: { before: 0.2, after: 0.6 },
  },
};

function fake(issues: CorrectionIssue[] = []) {
  const calls = { created: [] as Array<{ title: string; body: string; labels: string[] }>, updated: [] as number[] };
  const client: GithubClient = {
    async listIssues({ label }) {
      assert.equal(label, CORRECTION_LABEL);
      return issues.map((issue) => ({ ...issue }));
    },
    async createIssue(issue) {
      calls.created.push(issue);
      const number = 100 + calls.created.length;
      issues.push({ number, title: issue.title, body: issue.body, state: "open" });
      return { number };
    },
    async updateIssueBody(number, body) {
      calls.updated.push(number);
      issues.find((issue) => issue.number === number)!.body = body;
    },
  };
  return { client, calls, issues };
}

const marker = (project: string) => `<!-- brigade:correction project=${project} -->`;

test("with no open correction ticket, exactly one is opened, with the cause and the numbers", async () => {
  const { client, calls } = fake();
  const result = await writeCorrection("brigade", FINDING, client);
  assert.deepEqual(result, { action: "opened", number: 101 });
  assert.equal(calls.created.length, 1);
  const [created] = calls.created;
  assert.deepEqual(created!.labels, [CORRECTION_LABEL]);
  assert.match(created!.body, /The tests got slow/);
  assert.match(created!.body, /600 s → 1200 s/);
  assert.match(created!.body, /120 s → 720 s/);
});

test("with an open correction ticket, none is created and it is completed with the finding", async () => {
  const { client, calls, issues } = fake([{ number: 7, title: "Max passed", body: `${marker("brigade")}\nThe max was passed.`, state: "open" }]);
  const result = await writeCorrection("brigade", FINDING, client);
  assert.deepEqual(result, { action: "completed", number: 7 });
  assert.equal(calls.created.length, 0);
  assert.match(issues[0]!.body, /The max was passed\./);
  assert.match(issues[0]!.body, /The tests got slow/);
  assert.match(issues[0]!.body, /600 s → 1200 s/);
});

test("running twice with the same finding does not duplicate the text", async () => {
  const { client, calls, issues } = fake([{ number: 7, title: "t", body: marker("brigade"), state: "open" }]);
  await writeCorrection("brigade", FINDING, client);
  const once = issues[0]!.body;
  const again = await writeCorrection("brigade", FINDING, client);
  assert.deepEqual(again, { action: "unchanged", number: 7 });
  assert.equal(issues[0]!.body, once);
  assert.equal(calls.updated.length, 1);
});

test("running twice with no ticket yet opens one, then completes it without a second", async () => {
  const { client, calls, issues } = fake();
  await writeCorrection("brigade", FINDING, client);
  const again = await writeCorrection("brigade", FINDING, client);
  assert.equal(calls.created.length, 1);
  assert.equal(again.action, "unchanged");
  assert.equal(issues[0]!.body.split("The tests got slow").length - 1, 1);
});

test("a new finding is added to the open ticket next to the first", async () => {
  const { client, issues } = fake([{ number: 7, title: "t", body: marker("brigade"), state: "open" }]);
  await writeCorrection("brigade", FINDING, client);
  const other: Finding = { ...FINDING, cause: "ci-drifting", sentence: "The CI is drifting.", numbers: { ...FINDING.numbers, part: "ci" } };
  assert.equal((await writeCorrection("brigade", other, client)).action, "completed");
  assert.match(issues[0]!.body, /The tests got slow/);
  assert.match(issues[0]!.body, /The CI is drifting/);
});

test("a closed correction ticket does not block opening a new one", async () => {
  const { client, calls } = fake([{ number: 7, title: "old", body: marker("brigade"), state: "closed" }]);
  const result = await writeCorrection("brigade", FINDING, client);
  assert.deepEqual(result, { action: "opened", number: 101 });
  assert.equal(calls.created.length, 1);
});

test("another project's open correction ticket is left alone", async () => {
  const { client, calls, issues } = fake([{ number: 7, title: "t", body: marker("other"), state: "open" }]);
  const result = await writeCorrection("brigade", FINDING, client);
  assert.equal(result.action, "opened");
  assert.equal(calls.updated.length, 0);
  assert.equal(issues[0]!.body, marker("other"));
});
