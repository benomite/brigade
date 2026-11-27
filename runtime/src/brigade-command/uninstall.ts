// `brigade uninstall [--purge]`: removes the services, the account, the `/opt/brigade-station` versions and the
// `/usr/local/bin/brigade` link, each step through sudo. The station's state stays unless `--purge` is given.
import { fail, LABEL, ok, stationDir, UNIT, UPDATE_LABEL, UPDATE_UNIT, type Machine, type Result } from "./shared.ts";

type Step = { say: string; program: string; args: string[]; tolerant?: boolean };

const UNITS = [UNIT, "brigade-station-porte.service", UPDATE_UNIT, "brigade-station-mise-a-jour.timer"];
const LABELS = [LABEL, `${LABEL}.gate`, UPDATE_LABEL];

export function uninstallCommand(machine: Machine, args: string[]): Result {
  const purge = args.includes("--purge");
  const unknown = args.find((arg) => arg !== "--purge");
  if (unknown !== undefined) return fail(`uninstall: unknown option "${unknown}"`, 2);
  const sudo = (say: string, program: string, programArgs: string[], tolerant = false): Step => ({ say, program: "sudo", args: [program, ...programArgs], tolerant });
  const steps: Step[] = [];
  if (machine.platform === "darwin") {
    for (const label of LABELS) steps.push(sudo(`stop ${label}`, "launchctl", ["bootout", `system/${label}`], true));
    steps.push(sudo("remove the launchd plists", "rm", ["-f", ...LABELS.map((label) => `/Library/LaunchDaemons/${label}.plist`)]));
    steps.push(sudo("remove the account", "dscl", [".", "-delete", "/Users/brigade"], true));
  } else {
    steps.push(sudo("stop the services", "systemctl", ["disable", "--now", ...UNITS], true));
    steps.push(sudo("remove the units", "rm", ["-f", ...UNITS.map((unit) => `/etc/systemd/system/${unit}`)]));
    steps.push(sudo("reload systemd", "systemctl", ["daemon-reload"], true));
    steps.push(sudo("remove the account", "userdel", ["brigade"], true));
  }
  steps.push(sudo("remove the installed versions", "rm", ["-rf", "/opt/brigade-station"]));
  if (purge) {
    steps.push(sudo("remove the station's state", "rm", ["-rf", stationDir(machine), ...(machine.platform === "linux" ? ["/etc/brigade", "/var/lib/brigade-station"] : [])]));
  }
  steps.push(sudo("remove the command", "rm", ["-f", "/usr/local/bin/brigade"]));

  const out: string[] = [];
  let failed = 0;
  for (const step of steps) {
    const done = machine.run(step.program, step.args);
    if (done.code === 0) out.push(`ok      ${step.say}`);
    else if (step.tolerant) out.push(`skipped ${step.say} (${done.stderr.trim() || `exit ${done.code}`})`);
    else {
      failed++;
      out.push(`FAILED  ${step.say}: ${done.stderr.trim() || `exit ${done.code}`}`);
    }
  }
  out.push(failed > 0 ? `${failed} step(s) failed.` : purge ? "Station removed, state included." : `Station removed. Its state is kept in ${stationDir(machine)}; --purge removes it too.`);
  return failed > 0 ? { code: 1, out: "", err: `${out.join("\n")}\n` } : ok(out.join("\n"));
}
