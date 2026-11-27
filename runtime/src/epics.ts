// An epic the manager split stays open after its children close, and a child that depends on it would wait for ever:
// the kitchen closes it once every child is closed (#4672).
import type { Issue, PullRequest } from "./kitchen/decide.ts";
import type { Gestures } from "./kitchen/github.ts";
import type { Gh } from "./kitchen/github.ts";
import type { Git } from "./kitchen/kitchen.ts";
import { join } from "node:path";

export async function closeFinishedEpics(
  issues: Issue[],
  commentsOf: (issue: number) => Promise<Array<{ body: string }>>,
  act: Pick<Gestures, "close">,
  log: (line: string) => void,
  branches: readonly number[] = [],
): Promise<void> {
  const parents = new Set(issues.flatMap((one) => (one.epic === undefined ? [] : [one.epic])));
  // An epic with an open child is not done, and one with a branch ends in its own PR (openFinishedEpics); the issues list holds open tickets only, so any other child is closed.
  for (const epic of issues.filter((one) => one.trusted && one.labels.includes("epic") && !parents.has(one.number) && !branches.includes(one.number))) {
    try {
      const split = (await commentsOf(epic.number)).find((one) => /^Split by the manager into /.test(one.body));
      if (split === undefined) continue;
      await act.close(epic.number, "Closed by the kitchen: every ticket it was split into is closed.", "completed");
      log(`#${epic.number} closed: its children are all closed`);
    } catch (error) {
      log(`#${epic.number} epic not closed — ${(error as Error).message}`);
    }
  }
}

// An epic's children are cooked, judged and merged on its branch; every other ticket goes to the base branch.
export const epicBranch = (epic: number): string => `epic/${epic}`;
export const baseOf = (issue: Issue, base: string): string => (issue.epic === undefined ? base : epicBranch(issue.epic));

// A merge into an epic's branch does not close the child by itself (`Closes #N` acts on the default branch only).
export const closeMergedChild = async (act: Pick<Gestures, "close">, issue: Issue): Promise<void> => {
  if (issue.epic === undefined) return;
  await act.close(issue.number, `Merged into ${epicBranch(issue.epic)}: ships with #${issue.epic}.`, "completed");
};

// One child for an epic whose branch cannot reach `main` by itself; the epic waits while it is open.
type Opener = Pick<Gestures, "open">;
export const openEpicChild = async (act: Opener, epic: Issue, title: string, body: string): Promise<number> =>
  act.open(`Epic #${epic.number}: ${title}`, `Epic: #${epic.number}\n\n${body}`, ["fire", ...epic.labels.filter((label) => /^prio:\d+$/.test(label))]);
export const epicChildOfAction = async (act: Opener, epic: Issue, reason: string, log: (line: string) => void) =>
  log(`#${epic.number} epic: child #${await openEpicChild(act, epic, `fix its pull request (${reason.slice(0, 50)})`, `The pull request of epic/${epic.number} cannot be merged: ${reason}. Fix it on the branch epic/${epic.number}.`)} opened — ${reason}`);

// The epic's own "Done when" section, up to the next heading.
export const doneWhen = (body: string): string => {
  const lines = body.split("\n");
  const at = lines.findIndex((line) => /done when/i.test(line));
  if (at < 0) return "";
  const next = lines.findIndex((line, i) => i > at && /^#/.test(line));
  return lines.slice(at, next < 0 ? undefined : next).join("\n").trim();
};

type Deps = { act: Pick<Gestures, "labels" | "open" | "openEpicPr">; git: Git; gh: Gh; repo: string; clone: string; worktrees: string; base: string; log: (line: string) => void };

// An epic with a branch, no open child, no open PR and a branch ahead of the base gets the base merged in, then its PR;
// a conflict opens one child instead (#4701). It is not looked at again while that child or PR is open.
export async function openFinishedEpics(state: { issues: Issue[]; prs: Array<{ issue: number }>; epicBranches: number[] }, deps: Deps): Promise<void> {
  const { act, git, gh, repo, clone, base, log } = deps;
  const busy = new Set([...state.issues.flatMap((one) => (one.epic === undefined ? [] : [one.epic])), ...state.prs.map((pr) => pr.issue)]);
  const waiting = (one: Issue) => one.labels.some((label) => label.startsWith("parked") || label === "human");
  const epics = state.issues.filter((one) => one.trusted && one.labels.includes("epic") && state.epicBranches.includes(one.number) && !busy.has(one.number) && !waiting(one));
  if (epics.length > 0) await git(clone, ["fetch", "--quiet", "--prune", "origin"]);
  for (const epic of epics) {
    const branch = epicBranch(epic.number);
    const wt = join(deps.worktrees, `epic-${epic.number}`);
    try {
      if ((await git(clone, ["rev-list", "--count", `origin/${base}..origin/${branch}`])).trim() === "0") continue;
      await git(clone, ["worktree", "remove", "--force", wt]).catch(() => "");
      await git(clone, ["worktree", "add", "--force", "--detach", wt, `origin/${branch}`]);
      const merged = await git(wt, ["merge", "--no-edit", `origin/${base}`]).then(() => true, () => false);
      if (!merged) {
        await git(wt, ["merge", "--abort"]).catch(() => "");
        const child = await openEpicChild(act, epic, `merge ${base} into ${branch}`, `The branch ${branch} conflicts with ${base}: merge \`origin/${base}\` into it and resolve the conflicts.`);
        log(`#${epic.number} epic: ${base} conflicts, child #${child} opened`);
        continue;
      }
      await git(wt, ["push", "--quiet", "origin", `HEAD:refs/heads/${branch}`]);
      const raw = JSON.parse(await gh(["issue", "list", "-R", repo, "--state", "all", "--limit", "100", "--search", `"Epic: #${epic.number}" in:body`, "--json", "number,title,body"])) as Array<{ number: number; title: string; body: string }>;
      const children = raw.filter((one) => new RegExp(`^Epic: #${epic.number}\\b`, "m").test(one.body)).map((one) => `- #${one.number} — ${one.title}`);
      const body = (await gh(["api", `repos/${repo}/issues/${epic.number}`]).then((out) => (JSON.parse(out) as { body: string | null }).body ?? ""));
      await act.openEpicPr(epic.number, base, epic.title, [`Closes #${epic.number}`, doneWhen(body), children.length > 0 ? `## Children\n\n${children.join("\n")}` : ""].filter((part) => part !== "").join("\n\n"));
      await act.labels(epic.number, ["in-pass"]);
      log(`#${epic.number} epic: pull request opened on ${base}`);
    } catch (error) {
      log(`#${epic.number} epic PR not opened — ${(error as Error).message}`);
    } finally {
      await git(clone, ["worktree", "remove", "--force", wt]).catch(() => "");
    }
  }
}

// A PR the pass approves waits for the chef when it touches a risk zone, or when it is an epic's and the project's release is the chef's.
// The chef's merge answer holds for that PR until a pass refuses the ticket: a branch only brought up to date keeps it (#4489).
export const riskZoneComment = (pr: number) => `The pass approves PR #${pr}, but `;
const answerText = (body: string) => body.replace(/^\s*<!--\s*brigade:reponse\b[^>]*-->/, "").trim();
export function chefSaidMerge(comments: readonly string[], pr: number): boolean {
  let asked = false, granted = false;
  for (const body of comments) {
    if (body.startsWith(riskZoneComment(pr))) asked = true;
    else if (body.startsWith("Sent back to a cook (try ") || body.startsWith("Parked for the chef: refused")) asked = granted = false;
    else if (asked && /^merge\b/i.test(answerText(body))) granted = true;
  }
  return granted;
}

// The pass's `## What changes for the user` on an epic PR: the release notes read it from the PR's body (#4698); a later pass replaces it.
const USER_SECTION = /^## What changes for the user\n[\s\S]*?(?=^#{1,2} |^VERDICT:|(?![\s\S]))/m;
export const userChanges = (answer: string): string => USER_SECTION.exec(answer)?.[0].trim() ?? "";
export async function userChangesInBody(gh: Gh, repo: string, pr: number, answer: string): Promise<void> {
  const section = userChanges(answer);
  if (section === "") return;
  const body = (JSON.parse(await gh(["pr", "view", String(pr), "-R", repo, "--json", "body"])) as { body: string }).body;
  await gh(["pr", "edit", String(pr), "-R", repo, "--body-file", "-"], `${body.replace(USER_SECTION, "").trimEnd()}\n\n${section}\n`);
}

// A split's ticket says `Depends on ticket K` (K = a sibling's rank, from 1): once the K-th child is open, it reads `Depends on #<its number>`. A K that is not an earlier sibling is dropped.
export const siblingDependencies = (body: string, opened: readonly number[]): string =>
  body.replace(/^[ \t]*Depends on ticket (\d+)[ \t]*$/gim, (_line, k: string) => (Number(k) >= 1 && Number(k) <= opened.length ? `Depends on #${opened[Number(k) - 1]}` : "")).replace(/\n{3,}/g, "\n\n");
