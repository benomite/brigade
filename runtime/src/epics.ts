// An epic the manager split stays open after its children close, and a child that depends on it would wait for ever:
// the kitchen closes it once every child is closed (#4672).
import type { Issue } from "./kitchen/decide.ts";
import type { Gestures } from "./kitchen/github.ts";

export async function closeFinishedEpics(
  issues: Issue[],
  commentsOf: (issue: number) => Promise<Array<{ body: string }>>,
  act: Pick<Gestures, "close">,
  log: (line: string) => void,
): Promise<void> {
  const parents = new Set(issues.flatMap((one) => (one.epic === undefined ? [] : [one.epic])));
  // An epic with an open child is not done; the issues list holds open tickets only, so any other child is closed.
  for (const epic of issues.filter((one) => one.trusted && one.labels.includes("epic") && !parents.has(one.number))) {
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
export const closeMergedChild = (act: Pick<Gestures, "close">, issue: Issue): Promise<void> =>
  issue.epic === undefined ? Promise.resolve() : act.close(issue.number, `Merged into ${epicBranch(issue.epic)}: ships with #${issue.epic}.`, "completed");
