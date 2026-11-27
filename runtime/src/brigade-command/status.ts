// `brigade status [--json]`: `<station>/status.json` (written by the kitchen), plus whether the service runs and since
// when (systemctl or launchctl) and the disk space free. The text depends on the facts alone, never on the system.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fail, LABEL, ok, stationDir, UNIT, type Machine, type Result } from "./shared.ts";

// What the kitchen publishes in `status.json`; every field may be missing from an older or half-written file.
type Published = {
  version?: string;
  since?: string;
  projects?: { name: string; repo: string; places?: number }[];
  cooks?: { project?: string; ticket: number | string; since: string }[];
  update?: { at?: string; result?: string } | null;
  github?: { remaining: number; limit?: number; resetsAt?: string } | null;
  refusal?: string | null;
};

export type Service = { running: boolean; state: string; since: string | null };

// systemd's `Fri 2026-11-27 10:00:00 UTC` as an instant; launchd says no start time (the kitchen's `since` stands).
const instantOf = (stamp: string): string | null => {
  const [, date, time] = /(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)/.exec(stamp) ?? [];
  return date === undefined ? null : `${date}T${time}Z`;
};

export function readService(machine: Machine): Service {
  if (machine.platform === "darwin") {
    const done = machine.run("launchctl", ["print", `system/${LABEL}`]);
    const state = /^\s*state = (\S+)/m.exec(done.stdout)?.[1] ?? (done.code === 0 ? "unknown" : "not loaded");
    // launchd's `running` is systemd's `active`: the same word on both.
    return { running: state === "running", state: state === "running" ? "active" : state, since: null };
  }
  const done = machine.run("systemctl", ["show", UNIT, "--property=ActiveState,ActiveEnterTimestamp", "--timestamp=utc"]);
  const field = (key: string) => new RegExp(`^${key}=(.*)$`, "m").exec(done.stdout)?.[1]?.trim() ?? "";
  const state = field("ActiveState") || "not loaded";
  return { running: state === "active", state, since: state === "active" ? instantOf(field("ActiveEnterTimestamp")) : null };
}

const size = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
};

function readPublished(file: string): Published | null | "unreadable" {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Published;
  } catch {
    return "unreadable";
  }
}

export function statusCommand(machine: Machine, args: string[]): Result {
  const json = args.includes("--json");
  const unknown = args.find((arg) => arg !== "--json");
  if (unknown !== undefined) return fail(`status: unknown option "${unknown}"`, 2);
  const dir = stationDir(machine);
  const published = readPublished(join(dir, "status.json"));
  const facts = published === null || published === "unreadable" ? {} : published;
  const service = readService(machine);
  let free: number | null = null;
  try {
    free = machine.freeBytes(dir);
  } catch {}
  const since = service.running ? (service.since ?? facts.since ?? null) : null;

  if (json) {
    const all = {
      version: facts.version ?? null,
      service: { running: service.running, state: service.state, since },
      projects: facts.projects ?? [],
      cooks: facts.cooks ?? [],
      update: facts.update ?? null,
      github: facts.github ?? null,
      refusal: facts.refusal ?? null,
      disk: { path: dir, freeBytes: free },
      published: published !== null && published !== "unreadable",
    };
    return ok(JSON.stringify(all, null, 2));
  }

  const lines = [`Brigade station ${facts.version ?? "(version unknown)"}`];
  lines.push(`Service: ${service.running ? `running${since === null ? "" : ` since ${since}`}` : `not running (${service.state})`}`);
  if (published === null) lines.push("Status: not published yet (the station has not written status.json)");
  if (published === "unreadable") lines.push("Status: status.json is unreadable");
  const projects = facts.projects ?? [];
  lines.push(`Projects: ${projects.length}`);
  for (const project of projects) lines.push(`  ${project.name}  ${project.repo}${project.places === undefined ? "" : `  ${project.places} places`}`);
  const cooks = facts.cooks ?? [];
  lines.push(`Cooks running: ${cooks.length}`);
  for (const cook of cooks) lines.push(`  ${cook.project === undefined ? "" : `${cook.project} `}#${cook.ticket} since ${cook.since}`);
  lines.push(`Last update: ${facts.update?.at === undefined ? "none yet" : `${facts.update.at}${facts.update.result === undefined ? "" : ` — ${facts.update.result}`}`}`);
  lines.push(`GitHub quota: ${facts.github == null ? "unknown" : `${facts.github.remaining}${facts.github.limit === undefined ? "" : `/${facts.github.limit}`} left${facts.github.resetsAt === undefined ? "" : `, resets ${facts.github.resetsAt}`}`}`);
  lines.push(`Disk free: ${free === null ? "unknown" : size(free)}`);
  if (facts.refusal) lines.push(`Refuses to cook: ${facts.refusal}`);
  return ok(lines.join("\n"));
}
