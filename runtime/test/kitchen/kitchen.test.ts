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
type FakePr = { number: number; head: string; checks: "SUCCESS" | "FAILURE"; merged: boolean; log?: string };

function fakeGh() {
  const issues = new Map<number, FakeIssue>();
  const prs: FakePr[] = [];
  let next = 1;
  const gh: Gh = async (args, input) => {
    const flag = (name: string) => args[args.indexOf(name) + 1] ?? "";
    if (args[0] === "api" && args.at(-1)?.includes("/comments")) return "[[]]";
    if (args[0] === "api" && /^repos\/o\/r\/pulls\/\d+$/.test(args[1] ?? "")) return JSON.stringify({ head: { sha: `sha${args[1]?.split("/").pop()}` } });
    if (args[0] === "api" && args[1]?.includes("/check-runs")) {
      const pr = prs.find((p) => args[1]?.includes(`/commits/sha${p.number}/`)) as FakePr;
      return JSON.stringify({ check_runs: [{ name: "tests", conclusion: pr.checks.toLowerCase(), html_url: `https://github.com/o/r/actions/runs/7/job/${pr.number}` }] });
    }
    if (args[0] === "run" && args[1] === "view") return (prs.find((p) => String(p.number) === args[3]) as FakePr).log ?? "";
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
              nodes: prs.filter((p) => !p.merged).map((p) => ({ number: p.number, headRefName: p.head, mergeable: "MERGEABLE", commits: { nodes: [{ commit: { statusCheckRollup: { state: p.checks, contexts: { nodes: [{ __typename: "CheckRun", name: "tests", status: "COMPLETED", conclusion: p.checks }] } } } }] } })),
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
      prs.push({ number: 100 + prs.length, head: flag("--head"), checks: "SUCCESS", merged: false });
      return "";
    }
    if (args[0] === "pr" && args[1] === "view") return JSON.stringify({ files: [{ path: "feature.txt" }] });
    if (args[0] === "pr" && args[1] === "merge") {
      const pr = prs.find((p) => p.number === n) as FakePr;
      pr.merged = true;
      (issues.get(Number(/^cook\/(\d+)-github$/.exec(pr.head)?.[1])) as FakeIssue).closed = true;
      return "";
    }
    if (args[0] === "label") return "";
    throw new Error(`fake gh: ${args.join(" ")}`);
  };
  return { gh, issues, prs, add: (title: string, labels: string[]) => {
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
  *"Tu es un **cook**"*) echo work > feature.txt; git add feature.txt; git -c user.email=c@k -c user.name=cook commit -qm "#1 — work"; echo '{"type":"result","result":"done"}' ;;
  *"Tu es le **pass**"*) printf '%s\\n' '{"type":"result","result":"fine\\nVERDICT: merge"}' ;;
  *) echo '{"type":"result","result":"none"}' ;;
esac
`;

async function until(condition: () => boolean, turn: () => Promise<void>) {
  for (let i = 0; i < 100 && !condition(); i++) {
    await turn();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

test("a ready ticket is taken, cooked, delivered as a pull request, reviewed and merged", async () => {
  const root = mkdtempSync(join(tmpdir(), "kitchen-"));
  const origin = join(root, "origin.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  const seed = join(root, "seed");
  execFileSync("git", ["clone", "-q", origin, seed], { stdio: "pipe" });
  writeFileSync(join(seed, "README"), "hi");
  sh(seed, "add", "README");
  sh(seed, "-c", "user.email=s@s", "-c", "user.name=s", "commit", "-qm", "seed");
  sh(seed, "push", "-q", "origin", "HEAD:main");
  const clone = join(root, "clone");
  execFileSync("git", ["clone", "-q", origin, clone], { stdio: "pipe" });
  const agent = join(root, "agent.sh");
  writeFileSync(agent, AGENT, { mode: 0o755 });

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
  assert.deepEqual(lines, ["#1 taken", "#1 delivered", "#1 in review (PR #100)", "#1 merged (PR #100)"]);
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
  assert.deepEqual(lines, ["manager called on #1", "#1 parked for the chef — the manager gave no usable gesture"]);
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

test("the kitchen stays under 1,000 lines", () => {
  const dir = join(import.meta.dirname, "../../src/kitchen");
  const lines = readdirSync(dir).reduce((sum, file) => sum + readFileSync(join(dir, file), "utf8").split("\n").length - 1, 0);
  assert.ok(lines < 1000, `${lines} lines`);
});
