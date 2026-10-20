// `sandbox-unusable` : le bac à sable de Claude Code ne sert pas sur cet
// ordinateur. Ce que la station peut y faire d'elle-même : mettre `claude` à
// jour, un `claude` trop ancien ne lisant pas la configuration du bac à sable.
// Si la cause est autre (Seatbelt absent…), le refus tient, avec sa raison.
import { execFile } from "../../sans-invite.ts";
import type { Remede } from "../registre.ts";

export const remedeDuBacASable = (claudeBin?: string): Remede => ({
  id: "update-claude",
  leve: ["sandbox-unusable"],
  description: "Updates Claude Code on this computer, which the sandbox needs to be recent enough.",
  destructif: false,
  async executer({ env, relireLaConfiguration }) {
    const bin = claudeBin || env.BRIGADE_CLAUDE_BIN || "claude";
    await new Promise<void>((resoudre, rejeter) => {
      execFile(bin, ["update"], { timeout: 10 * 60_000, env: { ...process.env, ...env } }, (erreur, _, erreurs) => {
        if (erreur === null) return resoudre();
        rejeter(new Error(`\`claude update\` did not go through — ${erreurs.trim().split("\n").at(-1) || erreur.message}`));
      });
    });
    relireLaConfiguration();
  },
});
