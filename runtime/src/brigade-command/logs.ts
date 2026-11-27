// `brigade logs [--since 1h] [<project>]`: the station's journal — journalctl on Linux, the launchd log file on a Mac —
// filtered by project. The same lines either way: each line of a project's log names it.
import { existsSync, readFileSync } from "node:fs";
import { fail, MAC_LOG, ok, type Machine, type Result } from "./shared.ts";

const SINCE = /^(\d+)([smhd])$/;
const MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
const STAMP = /^(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d:\d\d)/;

// A line is a project's when it names the project as a word (`[brigade]`, `brigade #12`, `brigade/…`).
const mentions = (line: string, project: string) => new RegExp(`(^|[^\\w.-])${project.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\w.-])`).test(line);

export function logsCommand(machine: Machine, args: string[]): Result {
  let since: string | undefined;
  let project: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--since") since = args[++i];
    else if (arg.startsWith("--since=")) since = arg.slice("--since=".length);
    else if (arg.startsWith("-")) return fail(`logs: unknown option "${arg}"`, 2);
    else if (project === undefined) project = arg;
    else return fail("usage: brigade logs [--since 1h] [<project>]", 2);
  }
  const span = since === undefined ? null : SINCE.exec(since);
  if (since !== undefined && span === null) return fail(`logs: --since wants a span like 30m, 2h or 1d, not "${since}"`, 2);

  let text: string;
  if (machine.platform === "darwin") {
    const file = machine.env.BRIGADE_LOG_FILE || MAC_LOG;
    if (!existsSync(file)) return fail(`logs: no log file at ${file}`);
    text = readFileSync(file, "utf8");
    if (span !== null) {
      const from = machine.now().getTime() - Number(span[1]) * MS[span[2] as keyof typeof MS];
      let keeping = true;
      text = text
        .split("\n")
        .filter((line) => {
          const [, date, time] = STAMP.exec(line) ?? [];
          if (date !== undefined) keeping = new Date(`${date}T${time}Z`).getTime() >= from;
          return keeping;
        })
        .join("\n");
    }
  } else {
    const units = ["brigade-station.service", "brigade-station-porte.service", "brigade-station-mise-a-jour.service"].flatMap((unit) => ["-u", unit]);
    const done = machine.run("journalctl", [...units, "--no-pager", "--output=short-iso", ...(span === null ? [] : ["--since", `-${span[1]}${span[2]}`])]);
    if (done.code !== 0) return fail(`logs: journalctl failed: ${done.stderr.trim() || `exit ${done.code}`}`);
    text = done.stdout;
  }
  const lines = text.split("\n").filter((line) => line !== "" && (project === undefined || mentions(line, project)));
  return ok(lines.join("\n"));
}
