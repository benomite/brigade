// A delivery red only on checks the base branch has red too is not the
// cook's fault: it waits for the base, with no try, then its CI runs again on
// the base's fix (#4560). The kitchen's gestures for it, kept out of
// runtime/src/kitchen/ (its 1,000-line cap).
import { LABELS, type Issue } from "./kitchen/decide.ts";
import { branchOf, type Gestures } from "./kitchen/github.ts";
import type { Git } from "./kitchen/kitchen.ts";

type Deps = {
  act: Gestures;
  git: Git;
  base: string;
  log: (line: string) => void;
  // The ticket's worktree, exactly its pushed branch.
  worktree: (issue: number) => Promise<string>;
  sendBack: (issue: Issue, reason: string, counts: boolean) => Promise<void>;
};

export function waitForMain({ act, git, base, log, worktree, sendBack }: Deps) {
  return {
    wait: async (issue: number, checks: string[]) => {
      await act.labels(issue, [LABELS.waitsMain]);
      await act.comment(issue, `Waits for ${base}: ${checks.join(", ")} ${checks.length > 1 ? "are" : "is"} red on ${base} too. No try is used: its CI runs again once ${base} is green.`);
      log(`#${issue} waits for ${base} — ${checks.join(", ")}`);
    },
    // The base is green again on those checks: its branch takes the base and is pushed, which runs its CI again.
    replay: async (issue: Issue) => {
      const wt = await worktree(issue.number);
      const before = await git(wt, ["rev-parse", "HEAD"]);
      const merged = await git(wt, ["merge", "--no-edit", `origin/${base}`]).then(() => true, () => git(wt, ["merge", "--abort"]).then(() => false, () => false));
      if (!merged) return sendBack(issue, `${base} is green again, but its branch conflicts with it`, false);
      if ((await git(wt, ["rev-parse", "HEAD"])) === before) return sendBack(issue, `${base} is green again and its branch already holds it: its CI must run anew`, false);
      await git(wt, ["push", "--quiet", "origin", `HEAD:refs/heads/${branchOf(issue.number)}`]);
      await act.labels(issue.number, [], [LABELS.waitsMain]);
      log(`#${issue.number} CI replayed on ${base}`);
    },
  };
}
