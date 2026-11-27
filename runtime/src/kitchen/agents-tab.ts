// The app's Agents tab for a project the new kitchen serves: its four agents,
// what each runs now, and its last finished runs as its thread. Read from the
// kitchen's run files (`runs.ts`): `runs/` for what runs, `done/` for what ended.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { listRuns, resultOf, type Kind, type RunMeta } from "./runs.ts";

const AGENTS: ReadonlyArray<{ id: Kind; name: string; role: string }> = [
  { id: "manager", name: "Manager", role: "Calibrates the next tickets of the backlog, splits the big ones, and parks for the chef only what is the chef's to decide." },
  { id: "cook", name: "Cooks", role: "Each cook does one ticket's work and commits it; the kitchen pushes it and opens its pull request." },
  { id: "pass", name: "Pass", role: "Judges each delivery whose CI is green: merge, or send it back with what to fix." },
  { id: "supervisor", name: "Supervisor", role: "Every fifteen minutes, looks at the whole kitchen: parks a ticket that loops, repairs labels, opens a defect ticket." },
];

const WEEK_MS = 7 * 24 * 3_600_000;

// The kitchen's directory of the project whose old state directory is `stateDir` (`<station>/etat/<name>`), if it has one.
export function kitchenDirOf(stateDir: string): string | null {
  const dir = join(dirname(dirname(stateDir)), "kitchen", basename(stateDir));
  return existsSync(join(dir, "runs")) ? dir : null;
}

type Done = RunMeta & { name: string; dir: string };
function done(kitchen: string): Done[] {
  const root = join(kitchen, "done");
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((name) => {
    try {
      return [{ ...(JSON.parse(readFileSync(join(root, name, "meta.json"), "utf8")) as RunMeta), name, dir: join(root, name) }];
    } catch {
      return [];
    }
  });
}

export function serveKitchenAgents(kitchen: string, url: string, now: Date): { statut: number; corps: unknown } {
  const path = new URL(url, "http://agents.invalid").pathname;
  const ended = done(kitchen);
  if (path === "/api/agents") {
    const { running } = listRuns(join(kitchen, "runs"));
    const since = now.getTime() - WEEK_MS;
    return {
      statut: 200,
      corps: AGENTS.map((agent) => {
        const mine = running.filter((run) => run.kind === agent.id);
        return {
          ...agent,
          state: mine.length > 0 ? "working" : "idle",
          workingOn: mine.find((run) => run.issue !== null)?.issue ?? null,
          nextRun: null,
          figures: [
            { label: "Running", value: mine.length, meaning: "runs of this agent now" },
            { label: "Runs", value: ended.filter((run) => run.kind === agent.id && run.started > since).length, meaning: "finished runs, last 7 days" },
          ],
          settings: null,
        };
      }),
    };
  }
  const id = /^\/api\/agents\/([^/]+)\/gestures$/.exec(path)?.[1];
  if (id === undefined || !AGENTS.some((agent) => agent.id === id)) return { statut: 404, corps: { reason: `nothing is served at ${path}` } };
  const thread = ended
    .filter((run) => run.kind === id)
    .sort((a, b) => b.started - a.started)
    .slice(0, 50)
    .map((run) => {
      const last = resultOf(join(run.dir, "stream.jsonl")).trim().split("\n").at(-1) ?? "";
      return { at: new Date(run.started).toISOString(), summary: `${run.issue === null ? run.kind : `#${run.issue}`}: ${last.slice(0, 200) || "ended with no last words"}`, reason: "", issue: run.issue };
    });
  return { statut: 200, corps: thread };
}
