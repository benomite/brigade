// A whole ticket through the new kitchen: a real git origin, a fake `gh`
// that holds issues and pull requests in memory, and a fake agent.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openKitchen, gitCli } from "../../src/kitchen/kitchen.ts";
import type { Gh } from "../../src/kitchen/github.ts";
import type { Kind } from "../../src/kitchen/runs.ts";

type FakeIssue = { number: number; title: string; body: string; labels: string[]; comments: string[]; closed: boolean };
type FakePr = { number: number; head: string; checks: "SUCCESS" | "FAILURE"; merged: boolean; conflicting?: boolean; log?: string; body?: string };

function fakeGh() {
  const issues = new Map<number, FakeIssue>();
  const prs: FakePr[] = [];
  let next = 1;
  const options = { files: ["feature.txt"], failMerges: 0, lossyEdits: false };
  const gh: Gh = async (args, input) => {
    const flag = (name: string) => args[args.indexOf(name) + 1] ?? "";
    if (args[0] === "api" && args.at(-1)?.includes("/comments")) {
      const i = issues.get(Number(/issues\/(\d+)\/comments/.exec(args.at(-1) ?? "")?.[1]));
      return JSON.stringify([(i?.comments ?? []).map((body) => ({ user: { login: "chef" }, author_association: "OWNER", body }))]);
    }
    if (args[0] === "api" && /^repos\/o\/r\/pulls\/\d+$/.test(args[1] ?? "")) return JSON.stringify({ head: { sha: `sha${args[1]?.split("/").pop()}` } });
    if (args[0] === "api" && args[1]?.includes("/check-runs")) {
      const pr = prs.find((p) => args[1]?.includes(`/commits/sha${p.number}/`)) as FakePr;
      return JSON.stringify({ check_runs: [{ name: "tests", conclusion: pr.checks.toLowerCase(), html_url: `https://github.com/o/r/actions/runs/7/job/${pr.number}` }] });
    }
    if (args[0] === "run" && args[1] === "view") return (prs.find((p) => String(p.number) === args[3]) as FakePr).log ?? "";
    if (args[0] === "api" && args[1]?.startsWith("repos/o/r/actions/workflows/tests.yml/runs")) return JSON.stringify({ workflow_runs: [{ conclusion: "failure", updated_at: "2026-11-27T12:00:00Z" }] });
    if (args[0] === "api" && args[1]?.startsWith("repos/o/r/commits?sha=main")) return JSON.stringify([{ commit: { committer: { date: "2026-11-27T11:00:00Z" } } }]);
    if (args[0] === "api" && args[1]?.startsWith("repos/")) {
      const i = issues.get(Number(args[1].split("/").pop())) as FakeIssue;
      return JSON.stringify({ title: i.title, body: i.body, author_association: "OWNER", labels: i.labels.map((name) => ({ name })) });
    }
    if (args[0] === "api") {
      return JSON.stringify({
        data: {
          repository: {
            issues: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [...issues.values()].filter((i) => !i.closed).map((i) => ({ number: i.number, title: i.title, body: i.body, authorAssociation: "OWNER", labels: { nodes: i.labels.map((name) => ({ name })) } })),
            },
            pullRequests: {
              nodes: prs.filter((p) => !p.merged).map((p) => ({ number: p.number, headRefName: p.head, mergeable: p.conflicting === true ? "CONFLICTING" : "MERGEABLE", commits: { nodes: [{ commit: { statusCheckRollup: { state: p.checks, contexts: { nodes: [{ __typename: "CheckRun", name: "tests", status: "COMPLETED", conclusion: p.checks }] } } } }] } })),
            },
          },
        },
      });
    }
    const n = Number(args[2]);
    if (args[0] === "issue" && args[1] === "view") {
      const i = issues.get(n) as FakeIssue;
      return JSON.stringify({ title: i.title, body: i.body, authorAssociation: "OWNER", labels: i.labels.map((name) => ({ name })), comments: [] });
    }
    if (args[0] === "issue" && args[1] === "edit") {
      const i = issues.get(n) as FakeIssue;
      if (args.includes("--add-label")) for (const l of flag("--add-label").split(",")) if (!i.labels.includes(l)) i.labels.push(l);
      if (args.includes("--remove-label")) i.labels = i.labels.filter((l) => !flag("--remove-label").split(",").includes(l));
      return "";
    }
    if (args[0] === "issue" && args[1] === "comment") {
      (issues.get(n) as FakeIssue).comments.push(input ?? "");
      return "";
    }
    if (args[0] === "issue" && args[1] === "create") {
      const number = next++;
      issues.set(number, { number, title: flag("--title"), body: input ?? "", labels: [], comments: [], closed: false });
      return `https://github.com/o/r/issues/${number}\n`;
    }
    if (args[0] === "pr" && args[1] === "create") {
      if (prs.some((p) => !p.merged && p.head === flag("--head"))) throw new Error("a pull request already exists");
      prs.push({ number: 100 + prs.length, head: flag("--head"), checks: "SUCCESS", merged: false, body: input ?? "" });
      return "";
    }
    if (args[0] === "pr" && args[1] === "edit") {
      if (!options.lossyEdits) (prs.find((p) => !p.merged && p.head === args[2]) as FakePr).body = input ?? "";
      return "";
    }
    if (args[0] === "pr" && args[1] === "view") return JSON.stringify({ files: options.files.map((path) => ({ path })), body: prs.find((p) => p.number === n || p.head === args[2])?.body ?? "" });
    if (args[0] === "pr" && args[1] === "merge") {
      if (options.failMerges > 0) {
        options.failMerges -= 1;
        throw new Error("gh pr merge: the head branch is not up to date with the base branch");
      }
      const pr = prs.find((p) => p.number === n) as FakePr;
      pr.merged = true;
      (issues.get(Number(/^cook\/(\d+)-github$/.exec(pr.head)?.[1])) as FakeIssue).closed = true;
      return "";
    }
    if (args[0] === "label") return "";
    throw new Error(`fake gh: ${args.join(" ")}`);
  };
  return { gh, issues, prs, options, add: (title: string, labels: string[]) => {
    const number = next++;
    issues.set(number, { number, title, body: "", labels, comments: [], closed: false });
    return number;
  } };
}

const sh = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" }).toString();

// The fake agent: a cook commits a file; the pass approves; the manager calibrates.
const AGENT = `#!/bin/sh
input=$(cat)
case "$input" in
  *"Tu es un **cook**"*) echo work > feature.txt; git add feature.txt; git -c user.email=c@k -c user.name=cook commit -qm "#1 — work"; echo '{"type":"result","result":"Done: the work is committed, and this report is long enough to be one"}' ;;
  *"Tu es le **pass**"*) printf '%s\\n' '{"type":"result","result":"fine\\nVERDICT: merge"}' ;;
  *) echo '{"type":"result","result":"none"}' ;;
esac
`;

function origin() {
  const root = mkdtempSync(join(tmpdir(), "kitchen-"));
  const bare = join(root, "origin.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare]);
  const seed = join(root, "seed");
  execFileSync("git", ["clone", "-q", bare, seed], { stdio: "pipe" });
  writeFileSync(join(seed, "README"), "hi");
  sh(seed, "add", "README");
  sh(seed, "-c", "user.email=s@s", "-c", "user.name=s", "commit", "-qm", "seed");
  sh(seed, "push", "-q", "origin", "HEAD:main");
  const clone = join(root, "clone");
  execFileSync("git", ["clone", "-q", bare, clone], { stdio: "pipe" });
  const agent = join(root, "agent.sh");
  writeFileSync(agent, AGENT, { mode: 0o755 });
  return { root, clone, agent, seed };
}

async function until(condition: () => boolean, turn: () => Promise<void>) {
  for (let i = 0; i < 100 && !condition(); i++) {
    await turn();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

test("a ready ticket is taken, cooked, delivered as a pull request, reviewed and merged", async () => {
  const { root, clone, agent } = origin();
  const fake = fakeGh();
  const issue = fake.add("Add a feature", ["fire"]);
  const env = { ...process.env, GIT_AUTHOR_NAME: "k", GIT_AUTHOR_EMAIL: "k@k", GIT_COMMITTER_NAME: "k", GIT_COMMITTER_EMAIL: "k@k" };
  const lines: string[] = [];
  const kitchen = openKitchen({
    repo: "o/r",
    base: "main",
    clone,
    worktrees: join(root, "wt"),
    state: join(root, "state"),
    gh: fake.gh,
    git: gitCli(env),
    launch: (_kind: Kind, cwd, _write, _calibration, input) => ({ command: agent, args: [], input, cwd, env, secrets: {} }),
    places: () => 2,
    riskPaths: () => [],
    supervisorEveryMs: Number.MAX_SAFE_INTEGER,
    log: (line) => lines.push(line),
  });

  await until(() => fake.issues.get(issue)?.closed === true, kitchen.turn);
  assert.equal(fake.issues.get(issue)?.closed, true, lines.join("\n"));
  assert.equal(sh(clone, "fetch", "-q", "origin") === "" && sh(clone, "ls-tree", "--name-only", "origin/cook/1-github").includes("feature.txt"), true);
  assert.deepEqual(lines.filter((line) => !line.startsWith("network ")), ["#1 taken", "#1 delivered", "#1 in review (PR #100)", "#1 merged (PR #100)"]);
});

test("a ticket the manager gives no usable gesture is parked for the chef, not handed back to it every turn", async () => {
  const root = mkdtempSync(join(tmpdir(), "kitchen-"));
  const agent = join(root, "agent.sh");
  writeFileSync(agent, AGENT, { mode: 0o755 });
  const fake = fakeGh();
  const issue = fake.add("Something vague", []);
  const lines: string[] = [];
  const kitchen = openKitchen({
    repo: "o/r",
    base: "main",
    clone: root,
    worktrees: join(root, "wt"),
    state: join(root, "state"),
    gh: fake.gh,
    git: gitCli(process.env),
    launch: (_kind: Kind, cwd, _write, _calibration, input) => ({ command: agent, args: [], input, cwd, env: process.env, secrets: {} }),
    places: () => 2,
    riskPaths: () => [],
    supervisorEveryMs: Number.MAX_SAFE_INTEGER,
    log: (line) => lines.push(line),
  });
  await until(() => fake.issues.get(issue)?.labels.includes("parked:chef") === true, kitchen.turn);
  assert.deepEqual(lines.filter((line) => !line.startsWith("network ")), ["manager called on #1", "#1 parked for the chef — the manager gave no usable gesture"]);
});

async function riskKitchen() {
  const { root, clone, agent, seed } = origin();
  const fake = fakeGh();
  const issue = fake.add("Touch the kitchen", ["fire"]);
  const env = { ...process.env, GIT_AUTHOR_NAME: "k", GIT_AUTHOR_EMAIL: "k@k", GIT_COMMITTER_NAME: "k", GIT_COMMITTER_EMAIL: "k@k" };
  const lines: string[] = [];
  const kitchen = openKitchen({
    repo: "o/r",
    base: "main",
    clone,
    worktrees: join(root, "wt"),
    state: join(root, "state"),
    gh: fake.gh,
    git: gitCli(env),
    launch: (_kind: Kind, cwd, _write, _calibration, input) => ({ command: agent, args: [], input, cwd, env, secrets: {} }),
    places: () => 2,
    riskPaths: () => ["feature"],
    supervisorEveryMs: Number.MAX_SAFE_INTEGER,
    log: (line) => lines.push(line),
  });
  await until(() => fake.issues.get(issue)?.labels.includes("parked:chef") === true, kitchen.turn);
  const ticket = fake.issues.get(issue) as FakeIssue;
  assert.match(ticket.comments.at(-1) ?? "", /^The pass approves PR #100, but it touches a risk zone/);
  assert.ok(ticket.labels.includes("approved"));
  // The chef answers merge on the TODO card: the app posts the answer and lifts parked:chef (app/src/board-actions/answer-github.ts).
  ticket.comments.push("<!-- brigade:reponse gesture=resume -->\nmerge");
  ticket.labels = ticket.labels.filter((label) => label !== "parked:chef");
  lines.length = 0;
  return { fake, ticket, kitchen, lines, seed };
}

test("a chef's merge answer on a PR parked for a risk zone merges it, with no cook and no new pass", async () => {
  const { fake, ticket, kitchen, lines } = await riskKitchen();
  await until(() => ticket.closed, kitchen.turn);
  assert.equal(fake.prs[0]?.merged, true, lines.join("\n"));
  assert.deepEqual(lines, ["#1 merged (PR #100)"]);
  assert.deepEqual(ticket.labels.filter((label) => label === "parked:chef" || label === "approved"), []);
});

test("a chef's merge answer still holds after the branch is brought up to date and passes again: the ticket is not parked again", async () => {
  const { fake, ticket, kitchen, lines, seed } = await riskKitchen();
  writeFileSync(join(seed, "NEWS"), "main moved");
  sh(seed, "add", "NEWS");
  sh(seed, "-c", "user.email=s@s", "-c", "user.name=s", "commit", "-qm", "main moves");
  sh(seed, "push", "-q", "origin", "HEAD:main");
  fake.options.failMerges = 1;
  await until(() => ticket.closed, kitchen.turn);
  assert.equal(fake.prs[0]?.merged, true, lines.join("\n"));
  assert.equal(ticket.labels.includes("parked:chef"), false);
  assert.equal(ticket.comments.filter((body) => body.includes("risk zone")).length, 1);
  assert.deepEqual(lines, [
    "#1 could not be merged as the chef answered, a cook brings it up to date — gh pr merge: the head branch is not up to date with the base branch",
    "#1 taken",
    "#1 delivered",
    "#1 in review (PR #100)",
    "#1 merged (PR #100)",
  ]);
});

test("a pull request parked for the chef's merge that starts conflicting goes back to a cook, then waits for the chef again once approved (#4492)", async () => {
  const { root, clone, agent } = origin();
  const fake = fakeGh();
  const issue = fake.add("Touch a risk zone", ["fire"]);
  const env = { ...process.env, GIT_AUTHOR_NAME: "k", GIT_AUTHOR_EMAIL: "k@k", GIT_COMMITTER_NAME: "k", GIT_COMMITTER_EMAIL: "k@k" };
  const lines: string[] = [];
  const kitchen = openKitchen({
    repo: "o/r",
    base: "main",
    clone,
    worktrees: join(root, "wt"),
    state: join(root, "state"),
    gh: fake.gh,
    git: gitCli(env),
    launch: (_kind: Kind, cwd, _write, _calibration, input) => ({ command: agent, args: [], input, cwd, env, secrets: {} }),
    places: () => 2,
    riskPaths: () => ["feature.txt"],
    supervisorEveryMs: Number.MAX_SAFE_INTEGER,
    log: (line) => lines.push(line),
  });
  const labels = () => fake.issues.get(issue)?.labels ?? [];

  await until(() => labels().includes("parked:chef"), kitchen.turn);
  assert.deepEqual(labels().filter((l) => l === "parked:chef" || l === "approved"), ["parked:chef", "approved"], lines.join("\n"));
  await kitchen.turn();
  assert.ok(labels().includes("parked:chef"), "a mergeable pull request keeps waiting for the chef");

  (fake.prs[0] as FakePr).conflicting = true;
  await until(() => !labels().includes("parked:chef"), kitchen.turn);
  assert.deepEqual(labels().filter((l) => l === "parked:chef" || l === "approved" || /^try:/.test(l)), []);
  assert.ok(fake.issues.get(issue)?.comments.includes("Sent back to a cook: its branch conflicts with the base branch"));

  (fake.prs[0] as FakePr).conflicting = false;
  await until(() => labels().includes("parked:chef"), kitchen.turn);
  assert.deepEqual(labels().filter((l) => l === "parked:chef" || l === "approved"), ["parked:chef", "approved"], lines.join("\n"));
  assert.equal(fake.prs.length, 1);
  assert.equal(fake.prs[0]?.merged, false);
  assert.deepEqual(lines.filter((line) => !line.startsWith("network ")), ["#1 taken", "#1 delivered", "#1 in review (PR #100)", "#1 sent back — its branch conflicts with the base branch", "#1 taken", "#1 delivered", "#1 in review (PR #100)"]);
});

test("a delivery's report is the body of its pull request, refreshed at each delivery and given to the pass (#4563)", async () => {
  const { root, clone } = origin();
  const passInput = join(root, "pass-input");
  // The cook's last words are its report; the pass keeps the input it was given.
  const agent = join(root, "reporting-agent.sh");
  writeFileSync(agent, `#!/bin/sh
input=$(cat)
case "$input" in
  *"Tu es un **cook**"*) date +%N > feature.txt; git add feature.txt; git -c user.email=c@k -c user.name=cook commit -qm "#1 — work"; n=$(git rev-list --count HEAD); printf '{"type":"result","result":"Criterion 1: served, delivery %s\\\\nToken ghp_secretvalue1234 not shown"}\\n' "$n" ;;
  *"Tu es le **pass**"*) printf '%s' "$input" > "${passInput.replaceAll("\\", "/")}"; echo '{"type":"result","result":"VERDICT: refuse — again"}' ;;
esac
`, { mode: 0o755 });
  const fake = fakeGh();
  const issue = fake.add("Report what was removed", ["fire"]);
  const env = { ...process.env, GIT_AUTHOR_NAME: "k", GIT_AUTHOR_EMAIL: "k@k", GIT_COMMITTER_NAME: "k", GIT_COMMITTER_EMAIL: "k@k" };
  const lines: string[] = [];
  const kitchen = openKitchen({
    repo: "o/r",
    base: "main",
    clone,
    worktrees: join(root, "wt"),
    state: join(root, "state"),
    gh: fake.gh,
    git: gitCli(env),
    launch: (_kind: Kind, cwd, _write, _calibration, input) => ({ command: agent, args: [], input, cwd, env, secrets: {} }),
    places: () => 2,
    riskPaths: () => [],
    secrets: { GH_TOKEN: "ghp_secretvalue1234" },
    supervisorEveryMs: Number.MAX_SAFE_INTEGER,
    log: (line) => lines.push(line),
  });

  await until(() => fake.prs.length > 0, kitchen.turn);
  assert.equal(fake.prs[0]?.body, `Closes #${issue}\n\nCriterion 1: served, delivery 2\nToken [secret:GH_TOKEN] not shown\n`, lines.join("\n"));
  await until(() => (fake.issues.get(issue)?.comments.length ?? 0) > 0, kitchen.turn);
  assert.match(readFileSync(passInput, "utf8"), /# La description de la PR #100 \(le compte rendu du cook\)\n\nCloses #1\n\nCriterion 1: served, delivery 2\n/);

  await until(() => fake.prs[0]?.body?.includes("delivery 3") === true, kitchen.turn);
  assert.equal(fake.prs.length, 1, "the same pull request is kept");
  assert.equal(fake.prs[0]?.body, `Closes #${issue}\n\nCriterion 1: served, delivery 3\nToken [secret:GH_TOKEN] not shown\n`, lines.join("\n"));
});

async function deliverOnOpenPr(agentResult: string, lossyEdits: boolean) {
  const { root, clone } = origin();
  const agent = join(root, "agent.sh");
  writeFileSync(agent, `#!/bin/sh
input=$(cat)
case "$input" in
  *"Tu es un **cook**"*) echo work > feature.txt; git add feature.txt; git -c user.email=c@k -c user.name=cook commit -qm "#1 — work"; printf '%s\\n' '{"type":"result","result":"${agentResult}"}' ;;
  *"Tu es le **pass**"*) echo '{"type":"result","result":"VERDICT: refuse — again"}' ;;
esac
`, { mode: 0o755 });
  const fake = fakeGh();
  fake.options.lossyEdits = lossyEdits;
  const issue = fake.add("Report it", ["fire"]);
  fake.prs.push({ number: 100, head: `cook/${issue}-github`, checks: "SUCCESS", merged: false, body: `Closes #${issue}\n` });
  const env = { ...process.env, GIT_AUTHOR_NAME: "k", GIT_AUTHOR_EMAIL: "k@k", GIT_COMMITTER_NAME: "k", GIT_COMMITTER_EMAIL: "k@k" };
  const lines: string[] = [];
  const kitchen = openKitchen({
    repo: "o/r", base: "main", clone, worktrees: join(root, "wt"), state: join(root, "state"), gh: fake.gh, git: gitCli(env),
    launch: (_kind: Kind, cwd, _write, _calibration, input) => ({ command: agent, args: [], input, cwd, env, secrets: {} }),
    places: () => 2, riskPaths: () => [], secrets: {}, supervisorEveryMs: Number.MAX_SAFE_INTEGER, log: (line) => lines.push(line),
  });
  await until(() => lines.includes(`#${issue} delivered`), kitchen.turn);
  return { fake, issue, lines };
}

test("a delivery without a report leaves the PR description as it is and says so on the ticket and in the log (#4574)", async () => {
  const { fake, issue, lines } = await deliverOnOpenPr("done", false);
  assert.equal(fake.prs[0]?.body, `Closes #${issue}\n`);
  assert.match(fake.issues.get(issue)?.comments.join("\n") ?? "", /delivered without a report .*: the PR description stays as it is/);
  assert.ok(lines.some((line) => line.includes("delivered without a report")), lines.join("\n"));
});

test("a report that does not reach the PR description after `gh pr edit` is said on the ticket (#4574)", async () => {
  const { fake, issue, lines } = await deliverOnOpenPr("Criterion 1: served, with a report long enough to be one", true);
  assert.equal(fake.prs[0]?.body, `Closes #${issue}\n`);
  assert.match(fake.issues.get(issue)?.comments.join("\n") ?? "", /does not contain the report after `gh pr edit`/);
  assert.ok(lines.some((line) => line.includes("does not contain the report")), lines.join("\n"));
});

test("a red delivery goes back to a cook with the last lines of its failing check's log, secrets masked", async () => {
  const root = mkdtempSync(join(tmpdir(), "kitchen-"));
  const fake = fakeGh();
  const issue = fake.add("Add a feature", ["in-pass"]);
  const log = Array.from({ length: 60 }, (_, i) => `tests\tRun tests\t2026-11-26T10:00:00Z line ${i + 1}`);
  log[58] = "tests\tRun tests\tnot ok 3 - token ghp_secretvalue1234 rejected";
  fake.prs.push({ number: 100, head: "cook/1-github", checks: "FAILURE", merged: false, log: `${log.join("\n")}\n` });
  const lines: string[] = [];
  const kitchen = openKitchen({
    repo: "o/r",
    base: "main",
    clone: root,
    worktrees: join(root, "wt"),
    state: join(root, "state"),
    gh: fake.gh,
    git: gitCli(process.env),
    launch: () => {
      throw new Error("no agent is launched");
    },
    places: () => 2,
    riskPaths: () => [],
    secrets: { GH_TOKEN: "ghp_secretvalue1234" },
    supervisorEveryMs: Number.MAX_SAFE_INTEGER,
    log: (line) => lines.push(line),
  });
  await kitchen.turn();
  const comment = fake.issues.get(issue)?.comments.at(-1) ?? "";
  assert.match(comment, /^Sent back to a cook \(try 1\/3\): the CI is red: tests/);
  assert.match(comment, /#### tests/);
  assert.match(comment, /line 60\n````$/);
  assert.match(comment, /2026-11-26T10:00:00Z line 21\n/);
  assert.doesNotMatch(comment, /line 20\n/);
  assert.doesNotMatch(comment, /Run tests\t/);
  assert.match(comment, /token \[secret:GH_TOKEN\] rejected/);
  assert.doesNotMatch(comment, /ghp_secretvalue1234/);
  assert.deepEqual(fake.issues.get(issue)?.labels, ["try:1"]);
});

test("a ticket refused for the third time is parked for the supervisor, never for the chef (#4600)", async () => {
  const root = mkdtempSync(join(tmpdir(), "kitchen-"));
  const fake = fakeGh();
  const issue = fake.add("Add a feature", ["in-pass", "try:2"]);
  fake.prs.push({ number: 100, head: "cook/1-github", checks: "FAILURE", merged: false, log: "tests\tRun tests\tnot ok\n" });
  const kitchen = openKitchen({
    repo: "o/r", base: "main", clone: root, worktrees: join(root, "wt"), state: join(root, "state"), gh: fake.gh, git: gitCli(process.env),
    launch: () => {
      throw new Error("no agent is launched");
    },
    places: () => 2, riskPaths: () => [], supervisorEveryMs: Number.MAX_SAFE_INTEGER, log: () => {},
  });
  await kitchen.turn();
  const ticket = fake.issues.get(issue);
  assert.ok(ticket?.labels.includes("parked"), ticket?.labels.join(","));
  assert.ok(!ticket?.labels.includes("parked:chef"));
  assert.match(ticket?.comments.at(-1) ?? "", /^Parked for the supervisor: refused 3 times\. Last reason: the CI is red: tests/);
});

test("the supervisor is given main's last tests conclusion, the last merge time and each parked ticket's last comment (#4600)", async () => {
  const root = mkdtempSync(join(tmpdir(), "kitchen-"));
  const agent = join(root, "agent.sh");
  writeFileSync(agent, AGENT, { mode: 0o755 });
  const fake = fakeGh();
  const issue = fake.add("Looping", ["parked"]);
  (fake.issues.get(issue) as FakeIssue).comments.push("Sent back", "Parked for the supervisor: refused 3 times. Last reason: no PR description");
  let given = "";
  const kitchen = openKitchen({
    repo: "o/r", base: "main", clone: root, worktrees: join(root, "wt"), state: join(root, "state"), gh: fake.gh, git: gitCli(process.env),
    launch: (kind: Kind, cwd, _write, _calibration, input) => {
      if (kind === "supervisor") given = input;
      return { command: agent, args: [], input, cwd, env: process.env, secrets: {} };
    },
    places: () => 2, riskPaths: () => [], supervisorEveryMs: 0, log: () => {},
  });
  await kitchen.turn();
  assert.match(given, /dernier run `tests` : failure à 2026-11-27T12:00:00Z/);
  assert.match(given, /dernière fusion : 2026-11-27T11:00:00Z/);
  assert.match(given, /#1: Parked for the supervisor: refused 3 times\. Last reason: no PR description/);
  assert.doesNotMatch(given, /#1: Sent back/);
});

test("the kitchen stays under 1,000 lines", () => {
  const dir = join(import.meta.dirname, "../../src/kitchen");
  const lines = readdirSync(dir).reduce((sum, file) => sum + readFileSync(join(dir, file), "utf8").split("\n").length - 1, 0);
  assert.ok(lines < 1000, `${lines} lines`);
});
