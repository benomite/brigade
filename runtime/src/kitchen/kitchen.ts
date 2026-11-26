// One turn of a project's kitchen: read what the finished agents left, read
// GitHub, decide, act. The agents judge; this file only does the few
// gestures that stay locked in code: merge, the try count, places, risk zones.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decide, LABELS, triesOf, TRIES_MAX, type Action, type Issue, type PullRequest } from "./decide.ts";
import { branchOf, gestures, readState, ticketText, type Gh } from "./github.ts";
import { applyAgentActions, parseAgentActions, parseVerdict, prompts, type Prompts } from "./agents.ts";
import { forget, listRuns, startRun, type Finished, type Kind, type Launch } from "./runs.ts";

export type Git = (cwd: string, args: string[]) => Promise<string>;
export const gitCli = (env: NodeJS.ProcessEnv): Git => (cwd, args) =>
  new Promise((resolve, reject) => {
    execFile("git", ["-C", cwd, ...args], { env, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => (error ? reject(new Error(`git ${args[0]}: ${stderr.trim() || error.message}`)) : resolve(stdout)));
  });

export type KitchenOptions = {
  repo: string;
  base: string;
  clone: string;
  worktrees: string;
  state: string;
  gh: Gh;
  git: Git;
  // Builds the launch of one agent: `claude` with its calibration, wrapped in the sandbox.
  launch: (kind: Kind, cwd: string, write: boolean, calibration: { model: string; effort: string }, input: string) => Launch;
  places: () => number;
  passPlaces?: number;
  riskPaths: () => string[];
  prompts?: Prompts;
  supervisorEveryMs?: number;
  now?: () => number;
  log: (line: string) => void;
};

const calibrationOf = (labels: readonly string[], fallback: { model: string; effort: string }) => ({
  model: labels.find((label) => label.startsWith("model:"))?.slice(6) ?? fallback.model,
  effort: labels.find((label) => label.startsWith("effort:"))?.slice(7) ?? fallback.effort,
});
const COOK = { model: "sonnet", effort: "medium" };
const JUDGE = { model: "opus", effort: "medium" };

export function openKitchen(options: KitchenOptions) {
  const { repo, base, gh, git, log } = options;
  const act = gestures(gh, repo);
  const text = prompts(options.prompts);
  const runs = join(options.state, "runs");
  const lastSupervisorFile = join(options.state, "supervisor.last");
  const now = options.now ?? Date.now;
  const worktreeOf = (issue: number) => join(options.worktrees, `${issue}-github`);
  mkdirSync(runs, { recursive: true });

  const lastSupervisor = () => {
    try {
      return Number(readFileSync(lastSupervisorFile, "utf8")) || 0;
    } catch {
      return 0;
    }
  };

  async function sendBack(issue: Issue, reason: string, counts: boolean) {
    const tries = triesOf(issue.labels) + (counts ? 1 : 0);
    const old = issue.labels.filter((label) => /^try:\d+$/.test(label));
    if (counts && tries >= TRIES_MAX) {
      await act.labels(issue.number, [LABELS.parkedChef], [LABELS.inPass, LABELS.taken]);
      await act.comment(issue.number, `Parked for the chef: refused ${tries} times. Last reason: ${reason}`);
      log(`#${issue.number} parked for the chef after ${tries} tries — ${reason}`);
      return;
    }
    await act.labels(issue.number, counts ? [`try:${tries}`] : [], [LABELS.inPass, LABELS.taken, ...(counts ? old : [])]);
    await act.comment(issue.number, `Sent back to a cook${counts ? ` (try ${tries}/${TRIES_MAX})` : ""}: ${reason}`);
    log(`#${issue.number} sent back — ${reason}`);
  }

  // The worktree of a ticket, on its branch, with the base merged in. A merge
  // that conflicts is left in progress: the cook resolves it.
  // For a review, the worktree is exactly the pushed delivery.
  async function prepare(issue: number, forReview = false): Promise<string> {
    const wt = worktreeOf(issue);
    const branch = branchOf(issue);
    await git(options.clone, ["fetch", "--quiet", "--prune", "origin"]);
    if (!existsSync(wt)) {
      await git(options.clone, ["worktree", "prune"]);
      // A worktree left elsewhere on this branch (by an older kitchen) would forbid ours.
      const listed = await git(options.clone, ["worktree", "list", "--porcelain"]);
      for (const block of listed.split("\n\n")) {
        const path = /^worktree (.+)$/m.exec(block)?.[1];
        if (path !== undefined && block.split("\n").includes(`branch refs/heads/${branch}`)) await git(options.clone, ["worktree", "remove", "--force", path]).catch(() => "");
      }
      const remote = (await git(options.clone, ["ls-remote", "--heads", "origin", branch])).trim() !== "";
      await git(options.clone, ["worktree", "add", "--force", "-B", branch, wt, remote ? `origin/${branch}` : `origin/${base}`]);
    }
    if (forReview) await git(wt, ["reset", "--hard", "--quiet", `origin/${branch}`]);
    else await git(wt, ["merge", "--no-edit", `origin/${base}`]).catch(() => "");
    return wt;
  }

  async function onCookEnd(run: Finished, issue: Issue | undefined) {
    if (issue === undefined || run.issue === null || run.worktree === null) return;
    const wt = run.worktree;
    const park = /^PARK:\s*(.+)$/m.exec(run.result);
    if (park !== null) {
      await act.labels(issue.number, [LABELS.parkedChef], [LABELS.taken]);
      await act.comment(issue.number, `Parked for the chef by its cook: ${park[1]}`);
      return;
    }
    // Work the cook left uncommitted is kept, not lost.
    if ((await git(wt, ["status", "--porcelain"]).catch(() => "")).trim() !== "") {
      await git(wt, ["add", "-A"]);
      await git(wt, ["commit", "--quiet", "--no-verify", "-m", `#${issue.number} — work left uncommitted by the cook`]).catch(() => "");
    }
    const ahead = (await git(wt, ["rev-list", "--count", `origin/${base}..HEAD`]).catch(() => "0")).trim();
    if (ahead === "0") {
      await sendBack(issue, `the cook delivered nothing${run.end.erreur ? ` (${run.end.erreur})` : ""}: ${run.result.slice(-600) || "no last words"}`, true);
      return;
    }
    try {
      await git(wt, ["push", "--quiet", "--force-with-lease", "origin", `HEAD:refs/heads/${branchOf(issue.number)}`]);
      await act.openPr(issue.number, base, issue.title).catch((error: Error) => {
        if (!/already exists/.test(error.message)) throw error;
        return "";
      });
      await act.labels(issue.number, [LABELS.inPass], [LABELS.taken]);
      log(`#${issue.number} delivered`);
    } catch (error) {
      await sendBack(issue, `its delivery could not be pushed: ${(error as Error).message}`, false);
    }
  }

  async function onPassEnd(run: Finished, issue: Issue | undefined, pr: PullRequest | undefined) {
    if (issue === undefined || !issue.labels.includes(LABELS.inPass)) return;
    const verdict = parseVerdict(run.result);
    if (verdict === null) return sendBack(issue, "the pass gave no verdict", true);
    if (verdict.merge === false) return sendBack(issue, verdict.reason, true);
    if (pr === undefined) return;
    const files = await act.prFiles(pr.number);
    const risky = files.filter((file) => options.riskPaths().some((zone) => file.startsWith(zone)));
    if (risky.length > 0) {
      await act.labels(issue.number, [LABELS.parkedChef], [LABELS.inPass]);
      await act.comment(issue.number, `The pass approves PR #${pr.number}, but it touches a risk zone (${risky.slice(0, 5).join(", ")}): it waits for the chef to merge it.`);
      return;
    }
    try {
      await act.merge(pr.number);
      await act.labels(issue.number, [], [LABELS.inPass]).catch(() => "");
      await git(options.clone, ["worktree", "remove", "--force", worktreeOf(issue.number)]).catch(() => "");
      log(`#${issue.number} merged (PR #${pr.number})`);
    } catch (error) {
      await sendBack(issue, `the merge failed: ${(error as Error).message}`, false);
    }
  }

  async function execute(action: Action, issues: Map<number, Issue>) {
    const issue = action.kind === "manager" || action.kind === "supervisor" ? undefined : issues.get(action.issue);
    switch (action.kind) {
      case "send-back":
        return sendBack(issue as Issue, action.reason, action.counts);
      case "requeue":
        await act.labels(action.issue, [], [LABELS.taken, LABELS.inPass]);
        return log(`#${action.issue} back on the rail — ${action.reason}`);
      case "take": {
        await act.labels(action.issue, [LABELS.taken]);
        const wt = await prepare(action.issue);
        const input = text.cook({ issue: action.issue, base, worktree: wt, ticket: await ticketText(gh, repo, action.issue) });
        startRun(runs, { kind: "cook", issue: action.issue, pr: null, worktree: wt }, options.launch("cook", wt, true, calibrationOf(issue?.labels ?? [], COOK), input));
        return log(`#${action.issue} taken`);
      }
      case "review": {
        const wt = await prepare(action.issue, true);
        const input = text.pass({ issue: action.issue, base, pr: action.pr, ticket: await ticketText(gh, repo, action.issue) });
        startRun(runs, { kind: "pass", issue: action.issue, pr: action.pr, worktree: wt }, options.launch("pass", wt, false, JUDGE, input));
        return log(`#${action.issue} in review (PR #${action.pr})`);
      }
      case "manager": {
        const tickets = await Promise.all(action.issues.map((n) => ticketText(gh, repo, n)));
        startRun(runs, { kind: "manager", issue: null, pr: null, worktree: null }, options.launch("manager", options.clone, false, JUDGE, text.manager({ tickets })));
        return log(`manager called on ${action.issues.map((n) => `#${n}`).join(", ")}`);
      }
      case "supervisor": {
        writeFileSync(lastSupervisorFile, String(now()));
        const { running } = listRuns(runs);
        startRun(runs, { kind: "supervisor", issue: null, pr: null, worktree: null }, options.launch("supervisor", options.clone, false, JUDGE, text.supervisor({ issues: [...issues.values()], running, now: now() })));
        return log("supervisor called");
      }
    }
  }

  let labelled = false;
  async function turn() {
    if (!labelled) {
      await act.ensureLabels([LABELS.ready, LABELS.taken, LABELS.inPass, LABELS.parkedChef, LABELS.epic, "try:1", "try:2"]);
      labelled = true;
    }
    const listed = listRuns(runs);
    let state = await readState(gh, repo);
    if (listed.finished.length > 0) {
      const issues = new Map(state.issues.map((issue) => [issue.number, issue]));
      const prs = new Map(state.prs.map((pr) => [pr.issue, pr]));
      for (const run of listed.finished) {
        const issue = run.issue === null ? undefined : issues.get(run.issue);
        try {
          if (run.kind === "cook") await onCookEnd(run, issue);
          else if (run.kind === "pass") await onPassEnd(run, issue, run.issue === null ? undefined : prs.get(run.issue));
          else await applyAgentActions(parseAgentActions(run.result), { act, issues, log, who: run.kind });
        } catch (error) {
          log(`${run.name} ended, its outcome could not be applied — ${(error as Error).message}`);
        }
        forget(run);
      }
      state = await readState(gh, repo);
    }
    const { running } = listRuns(runs);
    const actions = decide(state.issues, state.prs, {
      places: options.places(),
      passPlaces: options.passPlaces ?? 2,
      running: {
        cooks: running.filter((run) => run.kind === "cook").map((run) => run.issue as number),
        passes: running.filter((run) => run.kind === "pass").map((run) => run.issue as number),
        manager: running.some((run) => run.kind === "manager"),
        supervisor: running.some((run) => run.kind === "supervisor"),
      },
      now: now(),
      lastSupervisor: lastSupervisor(),
      supervisorEveryMs: options.supervisorEveryMs ?? 15 * 60_000,
    });
    const issues = new Map(state.issues.map((issue) => [issue.number, issue]));
    for (const action of actions) {
      try {
        await execute(action, issues);
      } catch (error) {
        log(`${action.kind}${"issue" in action ? ` #${action.issue}` : ""} failed — ${(error as Error).message}`);
      }
    }
  }

  return { turn };
}
