// La configuration de la station d'un projet : son clone, sa branche
// d'intégration, le `claude` qu'elle lance, les stations que le projet déclare
// et ce que la machine doit garder. C'est la station GitHub seul
// (`brigade-github.ts`) qui prend, cuisine, relit et merge les tickets : rien
// ici ne prend un ticket ni ne lance un cook (#2061).
import { join } from "node:path";
import { VARIABLES_DE_CLE } from "./claude.ts";
import { ouvrirDepot, type Depot, type OptionsDepot } from "./depot.ts";
import { configMachine, type Seuils } from "./machine.ts";
import { lire } from "./plafonds.ts";
import { ConfigInvalide } from "./runtime.ts";
import { lireStations, type StationDeclaree } from "./stations-declarees.ts";

// Combien de tickets peuvent être en entrée à la fois : un `git worktree add`
// et le setup du projet (un `npm ci`, souvent) par ticket.
export const ENTREES_PAR_DEFAUT = 4;

export type ConfigStation = {
  // Les stations que le projet déclare. Aucune : aucun cook ne part.
  stations: StationDeclaree[];
  // Le clone du dépôt du projet, réservé à la station.
  clone: string;
  // La branche d'intégration : d'où part le worktree, où vise la PR.
  base: string;
  // Le binaire `claude`. Surchargé par les tests, jamais sur la box.
  bin: string;
  // Les tickets en entrée à la fois, et ce que la machine doit garder.
  entreesMax: number;
  seuils: Seuils;
};

// Lit la configuration des stations dans l'environnement. Ni le clone ni la
// branche n'ont de défaut, et aucune station n'est supposée ; et rien ne doit
// faire payer `claude` hors de la connexion Max de la machine.
export function configStation(env: Record<string, string | undefined>): ConfigStation {
  for (const variable of VARIABLES_DE_CLE) {
    if (env[variable]) {
      throw new ConfigInvalide(
        `${variable} est défini : la station ne pilote \`claude\` que par la connexion Max de la machine, jamais par une clé ou un jeton d'API — retirer la variable`,
      );
    }
  }
  const clone = env.BRIGADE_REPO_DIR;
  if (!clone) throw new ConfigInvalide("BRIGADE_REPO_DIR n'est pas défini");
  const base = env.BRIGADE_BASE_BRANCH;
  if (!base) throw new ConfigInvalide("BRIGADE_BASE_BRANCH n'est pas défini — ni la configuration ni le dépôt du projet (`.claude/brigade/projet.json`, ou la ligne « Branche d'intégration » de son `CLAUDE.md`) ne disent sa branche d'intégration");
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(base)) {
    throw new ConfigInvalide(`BRIGADE_BASE_BRANCH invalide : « ${base} » — attendu un nom de branche (v2, main)`);
  }
  return {
    stations: lireStations(env),
    clone,
    base,
    bin: env.BRIGADE_CLAUDE_BIN || "claude",
    entreesMax: lire(env, "BRIGADE_MAX_SETUPS", ENTREES_PAR_DEFAUT, "un entier supérieur à zéro", (valeur) => Number.isSafeInteger(valeur) && valeur > 0),
    seuils: configMachine(env),
  };
}

// Le dépôt de la station : son clone, et ses worktrees sous l'état du projet.
// `jeton` : celui sous lequel elle rapatrie et pousse, quand elle a une
// identité GitHub pour cela.
export function depotDeStation(repertoireEtat: string, config: ConfigStation, jeton?: OptionsDepot["jeton"], apresRapatriement?: OptionsDepot["apresRapatriement"]): Depot {
  return ouvrirDepot({ clone: config.clone, base: config.base, worktrees: join(repertoireEtat, "worktrees"), jeton, apresRapatriement });
}
