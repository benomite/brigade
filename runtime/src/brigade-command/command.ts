// The `brigade` command, as a pure dispatcher over a `Machine`: the platform, the environment, and the programs it
// runs (systemctl, launchctl, journalctl, sudo) are handed in, so a test plays each subcommand on linux and darwin
// with those programs stubbed. It never reads the station's secrets: only `status.json` and the projects file.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fail, ok, stationDir, LABEL, UNIT, type Machine, type Result } from "./shared.ts";
import { logsCommand } from "./logs.ts";
import { addProject, removeProject } from "./projects.ts";
import { statusCommand } from "./status.ts";
import { updateCommand } from "./update.ts";
import { uninstallCommand } from "./uninstall.ts";

export const USAGE = `Usage: brigade <command>

Commands:
  status [--json]                               the station's state: version, service, projects, cooks, update, quota, disk
  logs [--since 1h] [<project>]                 the station's journal, from the last hour (or any 30m, 2h, 1d), of one project
  restart                                       restarts the station (sudo)
  project add <name> <owner/repo> [--places N]  serves a project: adds its line to <station>/kitchen/projects
  project remove <name>                         stops serving a project: removes its line
  update [--check]                              runs an update pass now (sudo), or says what it would do
  uninstall [--purge]                           removes the services, the account, the installed versions and the command (sudo);
                                                keeps the station's state unless --purge
`;

export function runCommand(machine: Machine, argv: string[]): Result {
  const [command, ...rest] = argv;
  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      return ok(USAGE);
    case "status":
      return statusCommand(machine, rest);
    case "logs":
      return logsCommand(machine, rest);
    case "restart": {
      const done = machine.platform === "darwin" ? machine.run("sudo", ["launchctl", "kickstart", "-k", `system/${LABEL}`]) : machine.run("sudo", ["systemctl", "restart", UNIT]);
      return done.code === 0 ? ok("Station restarted.") : fail(`restart failed: ${done.stderr.trim() || `exit ${done.code}`}`);
    }
    case "project":
      return projectCommand(machine, rest);
    case "update":
      return updateCommand(machine, rest);
    case "uninstall":
      return uninstallCommand(machine, rest);
    default:
      return { code: 2, out: "", err: `brigade: unknown command "${command}"\n\n${USAGE}` };
  }
}

function projectCommand(machine: Machine, args: string[]): Result {
  const [verb, ...rest] = args;
  const file = join(stationDir(machine), "kitchen", "projects");
  const text = existsSync(file) ? readFileSync(file, "utf8") : null;
  let changed;
  if (verb === "add") changed = addProject(text, rest);
  else if (verb === "remove") changed = removeProject(text, rest);
  else return { code: 2, out: "", err: `brigade: usage: brigade project add <name> <owner/repo> [--places N] | brigade project remove <name>\n` };
  if ("error" in changed) return fail(changed.error, 2);
  const written = writeProjects(machine, file, changed.text);
  return written === null ? ok(changed.said) : fail(written);
}

// An empty projects file is no file: `add` then `remove` leaves the folder as it was. The station's folder is its
// account's, so a refused write goes through sudo.
function writeProjects(machine: Machine, file: string, text: string): string | null {
  try {
    if (text === "") rmSync(file, { force: true });
    else {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EACCES" && (error as NodeJS.ErrnoException).code !== "EPERM") return `cannot write ${file}: ${(error as Error).message}`;
  }
  const done = text === "" ? machine.run("sudo", ["rm", "-f", file]) : machine.run("sudo", ["tee", file], text);
  return done.code === 0 ? null : `cannot write ${file}: ${done.stderr.trim() || `exit ${done.code}`}`;
}
