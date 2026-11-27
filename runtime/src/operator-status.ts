// What the kitchen tells its operator: `<status dir>/status.json`, mode 0644, written atomically (temporary file, then
// rename) and rewritten whenever a fact changes and at least every minute. The status dir is `BRIGADE_STATUS_DIR`, else
// the station dir; it must lie outside `BRIGADE_SANDBOX_HIDDEN`, since the file is for the chef, not for the cooks.
// It holds no secret: versions, project names, ticket numbers, one-line reasons, counters.
//
// Shape (`Status`):
//   version      the runtime's version
//   since        ISO instant the kitchen started
//   updatedAt    ISO instant of this write
//   projects     the projects served, sorted
//   cooks        [{ project, issue, since }] the cooks running, `since` an ISO instant
//   update       the station's update (`mise-a-jour/etat.ts`), or null when it is not readable:
//                { installed, available, frozen, held, checkedAt, last: { result, version, at } | null }
//                `result` is "passed" or "rolled-back"; `held` says why `available` is not installed
//   quota        GitHub's rate limit (`gh api rate_limit`, not counted against it), or null when unreadable:
//                { core | graphql: { limit, remaining, resetsAt } }
//   refusal      why the kitchen refuses to cook, in one line, or null when it refuses nothing
//   refused      the same per project: { <project>: <one-line reason> }
import { chmodSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { versionDuRuntime } from "./mise-a-jour/en-service.ts";
import { lireEtatMiseAJour, type EtatMiseAJour } from "./mise-a-jour/etat.ts";
import type { Gh } from "./kitchen/github.ts";
import { listRuns } from "./kitchen/runs.ts";

export const STATUS_FILE = "status.json";
const EVERY_MS = 60_000;

type Window = { limit: number; remaining: number; resetsAt: string };
export type Status = {
  version: string;
  since: string;
  updatedAt: string;
  projects: string[];
  cooks: Array<{ project: string; issue: number; since: string }>;
  update: { installed: string | null; available: string | null; frozen: boolean; held: string | null; checkedAt: string; last: { result: "passed" | "rolled-back"; version: string; at: string } | null } | null;
  quota: { core: Window | null; graphql: Window | null } | null;
  refusal: string | null;
  refused: Record<string, string>;
};

export type StatusFacts = { projects: string[]; refused: Record<string, string> };

const updateOf = (state: EtatMiseAJour | null): Status["update"] =>
  state === null
    ? null
    : {
        installed: state.installee,
        available: state.disponible,
        frozen: state.gelee,
        held: state.retenue,
        checkedAt: state.verifieeLe,
        last: state.derniere === null ? null : state.derniere.quoi === "passee" ? { result: "passed", version: state.derniere.version, at: state.derniere.le } : { result: "rolled-back", version: state.derniere.visee, at: state.derniere.le },
      };

export async function quotaOf(gh: Gh): Promise<Status["quota"]> {
  try {
    const { resources } = JSON.parse(await gh(["api", "rate_limit"])) as { resources: Record<string, { limit: number; remaining: number; reset: number } | undefined> };
    const window = (name: string): Window | null => {
      const one = resources[name];
      return one ? { limit: one.limit, remaining: one.remaining, resetsAt: new Date(one.reset * 1000).toISOString() } : null;
    };
    return { core: window("core"), graphql: window("graphql") };
  } catch {
    return null;
  }
}

// Atomic, readable by all. The directory is made traversable too: a service manager may create it 0750.
export function writeStatus(dir: string, status: Status): void {
  mkdirSync(dir, { recursive: true, mode: 0o755 });
  try {
    chmodSync(dir, 0o755);
  } catch {
    // Not ours to change: the file is still written.
  }
  const file = join(dir, STATUS_FILE);
  writeFileSync(`${file}.${process.pid}.tmp`, `${JSON.stringify(status, null, 2)}\n`, { mode: 0o644 });
  chmodSync(`${file}.${process.pid}.tmp`, 0o644);
  renameSync(`${file}.${process.pid}.tmp`, file);
}

export function readStatus(station: string, facts: StatusFacts, extra: { since: string; version: string; now: Date; quota: Status["quota"]; updateDir?: string }): Status {
  const cooks = facts.projects.flatMap((project) => listRuns(join(station, "kitchen", project, "runs")).running.filter((run) => run.kind === "cook" && run.issue !== null).map((run) => ({ project, issue: run.issue as number, since: new Date(run.started).toISOString() })));
  const reasons = Object.entries(facts.refused).map(([project, reason]) => `${project}: ${reason}`);
  return {
    version: extra.version,
    since: extra.since,
    updatedAt: extra.now.toISOString(),
    projects: [...facts.projects].sort(),
    cooks,
    update: updateOf(extra.updateDir ? lireEtatMiseAJour(extra.updateDir) : null),
    quota: extra.quota,
    refusal: reasons.length === 0 ? null : reasons.join("; "),
    refused: facts.refused,
  };
}

// The kitchen publishes its status: now, then when a fact changes (checked every `checkMs`) and every minute. The quota
// is read once a minute. Returns what stops it; never keeps the process alive, never throws.
export function publishStatus(
  station: string,
  facts: () => StatusFacts,
  options: { gh: Gh; updateDir?: string; dir?: string; version?: string; now?: () => Date; checkMs?: number; say?: (line: string) => void },
): () => void {
  const now = options.now ?? (() => new Date());
  const since = now().toISOString();
  const dir = options.dir ?? station;
  let quota: Status["quota"] = null;
  let quotaAt = Number.NEGATIVE_INFINITY;
  let wrote = "";
  let wroteAt = Number.NEGATIVE_INFINITY;
  let busy = false;
  let said = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (now().getTime() - quotaAt >= EVERY_MS) {
        quotaAt = now().getTime();
        quota = await quotaOf(options.gh);
      }
      const status = readStatus(station, facts(), { since, version: options.version ?? versionDuRuntime(), now: now(), quota, updateDir: options.updateDir });
      const content = JSON.stringify({ ...status, updatedAt: "" });
      if (content === wrote && now().getTime() - wroteAt < EVERY_MS) return;
      writeStatus(dir, status);
      wrote = content;
      wroteAt = now().getTime();
      said = false;
    } catch (error) {
      if (!said) options.say?.(`kitchen: ${join(dir, STATUS_FILE)} cannot be written — ${(error as Error).message}`);
      said = true;
    } finally {
      busy = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), options.checkMs ?? 5000);
  timer.unref();
  return () => clearInterval(timer);
}
