// The kitchen's whole policy, as one pure function: from what GitHub says
// and which agents run, the gestures of this turn. No memory: a restarted
// kitchen reads the same state and decides the same thing.
// Spec: docs/superpowers/specs/2026-11-26-agents-in-prompts.md.

export type Checks = "pending" | "success" | "failure" | "none";

export type Issue = {
  number: number;
  title: string;
  labels: string[];
  // Its author has write access to the repository, or a writer labelled it `accepted`.
  trusted: boolean;
  // Open issues it waits for (`Depends on #N` in its body).
  dependsOn: number[];
};

export type PullRequest = {
  number: number;
  issue: number;
  checks: Checks;
  // The failing checks by name, when `checks` is "failure".
  failing: string[];
  conflicting: boolean;
};

export type Running = { cooks: number[]; passes: number[]; manager: boolean; supervisor: boolean };

export type Context = {
  places: number;
  passPlaces: number;
  running: Running;
  now: number;
  lastSupervisor: number;
  supervisorEveryMs: number;
};

export type Action =
  | { kind: "take"; issue: number }
  | { kind: "review"; issue: number; pr: number }
  | { kind: "send-back"; issue: number; reason: string; counts: boolean }
  | { kind: "requeue"; issue: number; reason: string }
  | { kind: "manager"; issues: number[] }
  | { kind: "supervisor" };

export const LABELS = {
  ready: "fire",
  taken: "taken",
  inPass: "in-pass",
  parked: "parked",
  parkedChef: "parked:chef",
  idea: "idea",
  epic: "epic",
  human: "human",
} as const;

export const TRIES_MAX = 3;

const has = (issue: Issue, label: string) => issue.labels.includes(label);
const parked = (issue: Issue) => issue.labels.some((label) => label === LABELS.parked || label.startsWith(`${LABELS.parked}:`));
export const triesOf = (labels: readonly string[]): number => Math.max(0, ...labels.filter((label) => /^try:\d+$/.test(label)).map((label) => Number(label.slice(4))));

const priority = (issue: Issue): number => {
  const label = issue.labels.find((name) => /^prio:\d+$/.test(name));
  return label === undefined ? 9 : Number(label.slice(5));
};
export const byPriorityThenAge = (a: Issue, b: Issue) => priority(a) - priority(b) || a.number - b.number;

// In the backlog and free to move: no agent holds it, nothing waits on it.
const free = (issue: Issue, open: ReadonlySet<number>) =>
  issue.trusted && !has(issue, LABELS.taken) && !has(issue, LABELS.inPass) && !parked(issue) && !has(issue, LABELS.idea) && !has(issue, LABELS.epic) && !has(issue, LABELS.human) && issue.dependsOn.every((n) => !open.has(n));

export function decide(issues: readonly Issue[], prs: readonly PullRequest[], context: Context): Action[] {
  const actions: Action[] = [];
  const open = new Set(issues.map((issue) => issue.number));
  const cooking = new Set(context.running.cooks);
  const reviewing = new Set(context.running.passes);
  const prOf = new Map(prs.map((pr) => [pr.issue, pr]));

  // The pass: every delivery whose CI is complete is judged; a red or
  // conflicting one goes back to a cook without a review. A full pass never
  // blocks a take (#4460).
  let passFree = context.passPlaces - reviewing.size;
  for (const issue of issues.filter((one) => has(one, LABELS.inPass)).sort(byPriorityThenAge)) {
    if (reviewing.has(issue.number)) continue;
    const pr = prOf.get(issue.number);
    if (pr === undefined) actions.push({ kind: "requeue", issue: issue.number, reason: "it is in pass with no open pull request" });
    else if (pr.conflicting) actions.push({ kind: "send-back", issue: issue.number, reason: "its branch conflicts with the base branch", counts: false });
    else if (pr.checks === "failure") actions.push({ kind: "send-back", issue: issue.number, reason: `the CI is red: ${pr.failing.join(", ") || "a check failed"}`, counts: true });
    else if (pr.checks !== "pending" && passFree > 0) {
      passFree -= 1;
      actions.push({ kind: "review", issue: issue.number, pr: pr.number });
    }
  }

  // A ticket marked taken that no cook of this kitchen holds lost its cook.
  for (const issue of issues) {
    if (has(issue, LABELS.taken) && !cooking.has(issue.number)) actions.push({ kind: "requeue", issue: issue.number, reason: "its cook is gone" });
  }

  // Takes: the top of the backlog, while places are free.
  const ready = issues.filter((issue) => has(issue, LABELS.ready) && free(issue, open)).sort(byPriorityThenAge);
  const places = Math.max(0, context.places - cooking.size);
  for (const issue of ready.slice(0, places)) actions.push({ kind: "take", issue: issue.number });

  // The manager calibrates, splits or parks the next ones when few are ready.
  const uncalibrated = issues.filter((issue) => !has(issue, LABELS.ready) && free(issue, open)).sort(byPriorityThenAge);
  if (!context.running.manager && ready.length - places < context.places && uncalibrated.length > 0) {
    actions.push({ kind: "manager", issues: uncalibrated.slice(0, 5).map((issue) => issue.number) });
  }

  if (!context.running.supervisor && context.now - context.lastSupervisor >= context.supervisorEveryMs) actions.push({ kind: "supervisor" });
  return actions;
}
