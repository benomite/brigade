// Les gates du projet, jouées par la pass dans le worktree d'une livraison.
// Le contrat est celui de la V1 : `.claude/brigade/gates.sh <worktree>`, et son
// code de sortie est le verdict. Seul module qui lance les scripts du projet.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Gates } from "./evenements/pass.ts";

export const SCRIPT_GATES = ".claude/brigade/gates.sh";
const SCRIPT_SETUP = ".claude/brigade/worktree-setup.sh";

// Un worktree neuf n'est pas exécutable : le setup du projet, s'il en a un,
// passe d'abord, et les variables qu'il imprime valent pour les gates — c'est
// son contrat (`eval "$(worktree-setup.sh N WT)"`).
const ENCHAINEMENT = `
set -u
if [ -f "$1" ]; then
  EXPORTS="$("$1" "$2" "$3")" || { echo "FAIL  setup du worktree en échec : $1" >&2; exit 1; }
  eval "$EXPORTS"
fi
exec "$4" "$3"
`;

const LIGNES_DE_FIN = 40;
// Ce que le verdict garde des gates part au journal, sur l'issue et dans la
// consigne d'un renvoi : borné.
const ECHECS_MAX = 20;
const LIGNE_MAX = 300;
const SORTIE_MAX = 256 * 1024;
const FIN_MAX = 4000;
// Ce qu'on laisse à la sortie des gates pour se fermer une fois qu'elles ont fini.
const DELAI_DE_FERMETURE_MS = 1000;

export type DemandeGates = {
  worktree: string;
  ticket: number;
  env: NodeJS.ProcessEnv;
  delaiMs: number;
  // Abandonne les gates en cours : le runtime s'arrête.
  signal?: AbortSignal;
};

export const aDesGates = (worktree: string) => existsSync(join(worktree, SCRIPT_GATES));

// Joue les gates et rend ce qu'elles ont dit. Ne lève pas : des gates
// impossibles à lancer sont des gates rouges, avec leur motif.
export function jouerGates(demande: DemandeGates): Promise<Gates> {
  const { worktree } = demande;
  return new Promise((resoudre) => {
    // Son propre groupe de process : au plafond, les gates meurent avec tout
    // ce qu'elles ont lancé.
    const enfant = spawn("bash", ["-c", ENCHAINEMENT, "brigade-pass", join(worktree, SCRIPT_SETUP), String(demande.ticket), worktree, join(worktree, SCRIPT_GATES)], {
      cwd: worktree,
      env: demande.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let sortie = "";
    const noter = (morceau: Buffer) => {
      sortie = (sortie + morceau.toString()).slice(-SORTIE_MAX);
    };
    enfant.stdout.on("data", noter);
    enfant.stderr.on("data", noter);

    let depasse = false;
    const tuer = () => {
      try {
        if (enfant.pid !== undefined) process.kill(-enfant.pid, "SIGKILL");
      } catch {
        // Déjà mort.
      }
    };
    const plafond = setTimeout(() => {
      depasse = true;
      tuer();
    }, demande.delaiMs);
    demande.signal?.addEventListener("abort", tuer, { once: true });

    let rendues = false;
    const rendre = (code: number | null, erreur?: string) => {
      if (rendues) return;
      rendues = true;
      clearTimeout(plafond);
      demande.signal?.removeEventListener("abort", tuer);
      const lignes = (erreur ? `${sortie}\n${erreur}` : sortie).split("\n").filter((ligne) => ligne.trim() !== "");
      resoudre({
        outcome: depasse ? "timeout" : code === 0 ? "green" : "red",
        code,
        failures: lignes.filter((ligne) => /^FAIL\b/.test(ligne)).slice(0, ECHECS_MAX).map((ligne) => ligne.slice(0, LIGNE_MAX)),
        tail: lignes.slice(-LIGNES_DE_FIN).join("\n").slice(-FIN_MAX),
      });
    };
    enfant.on("error", (erreur) => rendre(null, erreur.message));
    // Le verdict est le code de sortie des gates, connu dès leur fin — pas la
    // fermeture de leur sortie, qu'un process laissé en arrière-plan tiendrait
    // ouverte jusqu'au plafond. Ce qu'elles ont laissé meurt avec leur groupe ;
    // la sortie se ferme alors, et ce qui restait à lire est lu.
    enfant.on("exit", (code) => {
      clearTimeout(plafond);
      tuer();
      const rendu = () => rendre(code);
      enfant.on("close", rendu);
      setTimeout(rendu, DELAI_DE_FERMETURE_MS);
    });
  });
}
