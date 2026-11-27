import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseOf, closeFinishedEpics, epicBranch, epicChildOfAction, openFinishedEpics } from "../src/epics.ts";
import type { Gh } from "../src/kitchen/github.ts";
import type { Git } from "../src/kitchen/kitchen.ts";

const ticket = { number: 1, title: "t", labels: [], trusted: true, dependsOn: [] };

test("a child's base is its epic's branch; any other ticket's is the base branch", () => {
  assert.equal(epicBranch(7), "epic/7");
  assert.equal(baseOf({ ...ticket, epic: 7 }, "main"), "epic/7");
  assert.equal(baseOf(ticket, "main"), "main");
});

function repo() {
  const root = mkdtempSync(join(tmpdir(), "epics-"));
  const sh = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.email=s@s", "-c", "user.name=s", ...args], { cwd, stdio: "pipe" }).toString();
  const bare = join(root, "origin.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare]);
  const clone = join(root, "clone");
  execFileSync("git", ["clone", "-q", bare, clone], { stdio: "pipe" });
  const commit = (file: string, text: string, message: string) => {
    writeFileSync(join(clone, file), text);
    sh(clone, "add", file);
    sh(clone, "commit", "-qm", message);
  };
  commit("README", "hi", "seed");
  sh(clone, "push", "-q", "origin", "HEAD:main");
  return { root, clone, sh, commit };
}

const gitCli: Git = async (cwd, args) => execFileSync("git", ["-c", "user.email=s@s", "-c", "user.name=s", "-C", cwd, ...args], { stdio: "pipe" }).toString();
const epic = { ...ticket, number: 7, title: "Big thing", labels: ["epic", "prio:2"], split: true };

function setup(ahead: boolean, conflict = false) {
  const { root, clone, sh, commit } = repo();
  sh(clone, "checkout", "-q", "-b", "epic/7");
  if (ahead) commit("feature", "epic", "child work");
  if (conflict) commit("clash", "epic side", "epic clash");
  sh(clone, "push", "-q", "origin", "epic/7");
  sh(clone, "checkout", "-q", "main");
  commit("main-only", "x", "main moves");
  if (conflict) commit("clash", "main side", "main clash");
  sh(clone, "push", "-q", "origin", "main");
  const calls: string[][] = [];
  const opened: Array<{ title: string; body: string; labels: string[] }> = [];
  const labelled: Array<[number, string[]]> = [];
  const prs: string[] = [];
  const gh: Gh = async (args) => {
    calls.push(args);
    if (args[0] === "issue" && args[1] === "list") return JSON.stringify([{ number: 8, title: "First", body: "Epic: #7\n\nx" }, { number: 9, title: "Other epic's", body: "Epic: #70\n\nx" }]);
    return JSON.stringify({ body: "Intro\n\n## Done when\n\n- it works\n\n## Notes\n\nmore" });
  };
  const act = {
    labels: async (n: number, add: string[]) => void labelled.push([n, add]),
    open: async (title: string, body: string, labels: string[] = []) => (opened.push({ title, body, labels }), 20),
    openEpicPr: async (n: number, base: string, title: string, body: string) => void prs.push(`${n} ${base} ${title}\n${body}`),
  };
  const deps = { act, git: gitCli, gh, repo: "o/r", clone, worktrees: join(root, "wt"), base: "main", log: () => {} };
  return { deps, opened, labelled, prs, sh, clone };
}

test("an epic with a branch, no open child and the branch ahead of main gets its PR after a clean merge of main, and is labelled in-pass (#4701)", async () => {
  const { deps, opened, labelled, prs, sh, clone } = setup(true);
  await openFinishedEpics({ issues: [epic], prs: [], epicBranches: [7] }, deps);
  assert.deepEqual(opened, []);
  assert.deepEqual(labelled, [[7, ["in-pass"]]]);
  assert.equal(prs.length, 1);
  assert.match(prs[0] as string, /^7 main Big thing\nCloses #7\n\n## Done when\n\n- it works\n\n## Children\n\n- #8 — First$/);
  sh(clone, "fetch", "-q", "origin");
  assert.equal(sh(clone, "rev-list", "--count", "origin/main..origin/epic/7").trim(), "2", "the branch holds main's merge and its own work");
  assert.equal(sh(clone, "merge-base", "--is-ancestor", "origin/main", "origin/epic/7"), "");
});

test("a conflict with main opens one child and no PR (#4701)", async () => {
  const { deps, opened, labelled, prs } = setup(true, true);
  await openFinishedEpics({ issues: [epic], prs: [], epicBranches: [7] }, deps);
  assert.deepEqual(prs, []);
  assert.deepEqual(labelled, []);
  assert.deepEqual(opened, [{ title: "Epic #7: merge main into epic/7", body: "Epic: #7\n\nThe branch epic/7 conflicts with main: merge `origin/main` into it and resolve the conflicts.", labels: ["fire", "prio:2"] }]);
});

test("an epic with an open child, an open PR, no branch, or a branch not ahead of main is left alone (#4701)", async () => {
  for (const [state, branches, ahead] of [
    [{ issues: [epic, { ...ticket, number: 8, epic: 7 }], prs: [] }, [7], true],
    [{ issues: [epic], prs: [{ issue: 7 }] }, [7], true],
    [{ issues: [epic], prs: [] }, [], true],
    [{ issues: [epic], prs: [] }, [7], false],
  ] as const) {
    const { deps, opened, labelled, prs } = setup(ahead);
    await openFinishedEpics({ ...state, prs: [...state.prs], issues: [...state.issues], epicBranches: [...branches] }, deps);
    assert.deepEqual([opened, labelled, prs], [[], [], []]);
  }
});

test("closeFinishedEpics closes a split epic with no branch and every child closed, never one with a branch (#4701)", async () => {
  const closed: number[] = [];
  const act = { close: async (n: number) => void closed.push(n) };
  const comments = async () => [{ body: "Split by the manager into #8." }];
  await closeFinishedEpics([epic], comments, act, () => {}, [7]);
  assert.deepEqual(closed, []);
  await closeFinishedEpics([epic], comments, act, () => {}, []);
  assert.deepEqual(closed, [7]);
});

test("an epic whose PR is red or conflicts gets a child carrying the reason, with its priority (#4701)", async () => {
  const opened: Array<{ title: string; body: string; labels: string[] }> = [];
  await epicChildOfAction({ open: async (title, body, labels = []) => (opened.push({ title, body, labels }), 20) }, epic, "the CI is red: tests", () => {});
  assert.equal(opened.length, 1);
  assert.match(opened[0]?.title ?? "", /^Epic #7: /);
  assert.match(opened[0]?.body ?? "", /^Epic: #7\n\n.*the CI is red: tests/);
  assert.deepEqual(opened[0]?.labels, ["fire", "prio:2"]);
});
