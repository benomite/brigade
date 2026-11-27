// `brigade update [--check]`: starts the update service now (it runs as root, `runtime/src/mise-a-jour/main.ts`), or says
// what the last pass found and what the next would do, from the update's `etat.json`.
import { fail, ok, updateDir, UPDATE_LABEL, UPDATE_UNIT, type Machine, type Result } from "./shared.ts";
import { lireEtatMiseAJour } from "../mise-a-jour/etat.ts";

export function updateCommand(machine: Machine, args: string[]): Result {
  const check = args.includes("--check");
  const unknown = args.find((arg) => arg !== "--check");
  if (unknown !== undefined) return fail(`update: unknown option "${unknown}"`, 2);
  if (check) {
    const state = lireEtatMiseAJour(updateDir(machine));
    if (state === null) return ok("No update pass has run yet: `brigade update` would run the first one.");
    const lines = [`Installed: ${state.installee ?? "none"}`, `Latest published: ${state.disponible ?? "unknown"}`, `Last pass: ${state.verifieeLe}`];
    if (state.verification !== null) lines.push(`Could not read the published versions: ${state.verification}`);
    if (state.retenue !== null) lines.push(`Held back: ${state.retenue}`);
    const next = state.disponible !== null && state.disponible !== state.installee && state.retenue === null && !state.gelee;
    lines.push(next ? `An update pass would switch ${state.installee ?? "none"} to ${state.disponible}.` : "An update pass would change nothing.");
    return ok(lines.join("\n"));
  }
  const done = machine.platform === "darwin" ? machine.run("sudo", ["launchctl", "kickstart", `system/${UPDATE_LABEL}`]) : machine.run("sudo", ["systemctl", "start", "--no-block", UPDATE_UNIT]);
  return done.code === 0 ? ok("Update pass started; `brigade update --check` and `brigade status` say where it is.") : fail(`update failed: ${done.stderr.trim() || `exit ${done.code}`}`);
}
