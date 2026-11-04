// Whether a project's ticket times drift since the closer's last pass, and why (#2362).
// The station measures each served ticket's time and its split — the cook's own work, the
// tests, the CI (#2336, #2337); the closer reads those measures from GitHub and hands them
// here. Pure: no call to `claude`, no GitHub read nor write, no clock — the last pass is an
// input, so its caller passes the real one.
//
// The reading: a project's tickets since the last pass, in the order they were served, cut
// in two halves; the times drift when the second half's median ticket is markedly longer
// than the first's. The cause is the part of the split that grew the most.

export type Phase = "cook" | "tests" | "ci";

export type TicketTime = {
  project: string;
  ticket: number;
  // When the time was measured: the ticket's service. ISO.
  at: string;
  // The ticket's whole time, in seconds.
  seconds: number;
  // Seconds spent in each part. What they leave of `seconds` is the rest (waiting, review).
  split: Record<Phase, number>;
};

export type Cause = "slow-tests" | "tickets-too-big" | "ci-drifting" | "elsewhere";

export type Numbers = {
  // The last pass the reading starts from, `null` when there was none.
  since: string | null;
  tickets: { before: number; after: number };
  medianSeconds: { before: number; after: number };
  // The part that grew the most, and what it weighed in each half.
  part: Phase | "rest";
  partMedianSeconds: { before: number; after: number };
  // Its share of the half's whole time, from 0 to 1.
  partShare: { before: number; after: number };
};

export type Finding = { cause: Cause; sentence: string; numbers: Numbers };

// `tickets`: those dated after the last pass, the reading's base.
export type ProjectReading = { project: string; tickets: number; finding: Finding | null };

export type Thresholds = {
  // Fewer tickets than this in a half, nothing is said: too few to tell a drift from noise.
  minTicketsPerHalf: number;
  // The second half's median over the first's, at least.
  growthRatio: number;
  // And at least this many seconds more: a 40 s ticket that takes 70 s does not drift.
  minGrowthSeconds: number;
};

export const THRESHOLDS: Thresholds = { minTicketsPerHalf: 3, growthRatio: 1.5, minGrowthSeconds: 120 };

const PARTS = ["cook", "tests", "ci", "rest"] as const;
type Part = (typeof PARTS)[number];

const CAUSE: Record<Part, Cause> = { cook: "tickets-too-big", tests: "slow-tests", ci: "ci-drifting", rest: "elsewhere" };

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

const readable = (time: TicketTime): boolean =>
  typeof time.project === "string" && Number.isFinite(Date.parse(time.at)) && finite(time.seconds) && finite(time.split?.cook) && finite(time.split?.tests) && finite(time.split?.ci);

const partOf = (time: TicketTime, part: Part): number =>
  part === "rest" ? Math.max(0, time.seconds - time.split.cook - time.split.tests - time.split.ci) : time.split[part];

// `lastPass`: the closer's last pass; `null` when it never passed, and every measure counts.
export function readDrift(times: TicketTime[], lastPass: Date | string | null, thresholds: Thresholds = THRESHOLDS): ProjectReading[] {
  const boundary = lastPass === null ? null : new Date(lastPass);
  if (boundary !== null && !Number.isFinite(boundary.getTime())) throw new Error(`unreadable last pass: ${String(lastPass)}`);
  const byProject = new Map<string, TicketTime[]>();
  for (const time of times) {
    if (!readable(time)) continue;
    const kept = byProject.get(time.project) ?? [];
    byProject.set(time.project, kept);
    if (boundary === null || Date.parse(time.at) > boundary.getTime()) kept.push(time);
  }
  return [...byProject.keys()].sort().map((project) => {
    const since = byProject.get(project)!;
    return { project, tickets: since.length, finding: findDrift(since, boundary, thresholds) };
  });
}

function findDrift(times: TicketTime[], boundary: Date | null, thresholds: Thresholds): Finding | null {
  const ordered = [...times].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.ticket - b.ticket);
  const half = Math.floor(ordered.length / 2);
  if (half < thresholds.minTicketsPerHalf) return null;
  // An odd ticket out, the middle one, belongs to neither half.
  const before = ordered.slice(0, half);
  const after = ordered.slice(ordered.length - half);
  const medianSeconds = { before: median(before.map(({ seconds }) => seconds)), after: median(after.map(({ seconds }) => seconds)) };
  const grown = medianSeconds.after - medianSeconds.before;
  if (medianSeconds.after < medianSeconds.before * thresholds.growthRatio || grown < thresholds.minGrowthSeconds) return null;
  const parts = PARTS.map((part) => {
    const total = (side: TicketTime[]) => side.reduce((sum, { seconds }) => sum + seconds, 0);
    const share = (side: TicketTime[]) => (total(side) === 0 ? 0 : side.reduce((sum, time) => sum + partOf(time, part), 0) / total(side));
    return {
      part,
      medianSeconds: { before: median(before.map((time) => partOf(time, part))), after: median(after.map((time) => partOf(time, part))) },
      share: { before: share(before), after: share(after) },
    };
  });
  // The part that grew the most; on a tie, the first named.
  const cause = parts.reduce((best, part) => (part.medianSeconds.after - part.medianSeconds.before > best.medianSeconds.after - best.medianSeconds.before ? part : best));
  const numbers: Numbers = {
    since: boundary === null ? null : boundary.toISOString(),
    tickets: { before: before.length, after: after.length },
    medianSeconds,
    part: cause.part,
    partMedianSeconds: cause.medianSeconds,
    partShare: cause.share,
  };
  return { cause: CAUSE[cause.part], sentence: say(CAUSE[cause.part], numbers), numbers };
}

// `45 s`, `12 min 30 s`, `1 h 05 min`.
export function sayDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  if (s < 3600) return s % 60 === 0 ? `${s / 60} min` : `${Math.floor(s / 60)} min ${s % 60} s`;
  const minutes = Math.round(s / 60);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

const LEAD: Record<Cause, string> = {
  "slow-tests": "The tests got slow: a ticket's tests",
  "tickets-too-big": "The tickets are too big: the cook's own work on a ticket",
  "ci-drifting": "The CI is drifting: a ticket's wait on its CI",
  elsewhere: "The tickets take longer, but not in the cook's work, the tests or the CI: the rest of a ticket's time",
};

function say(cause: Cause, n: Numbers): string {
  const since = n.since === null ? "" : ` since ${n.since.slice(0, 10)}`;
  return `${LEAD[cause]} went from ${sayDuration(n.partMedianSeconds.before)} to ${sayDuration(n.partMedianSeconds.after)} (${percent(n.partShare.before)} → ${percent(n.partShare.after)} of a ticket's time), and the median ticket from ${sayDuration(n.medianSeconds.before)} to ${sayDuration(n.medianSeconds.after)} — the first ${n.tickets.before} tickets${since} against the last ${n.tickets.after}.`;
}
