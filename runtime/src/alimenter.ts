// Le dépôt GitHub d'un projet, son bail et ses chemins communs, lus de
// l'environnement ; la priorité d'un ticket ; ceux dont un commentaire fait
// foi. Le rail ne s'alimente plus de GitHub dans le journal : c'est la station
// GitHub seul (`brigade-github.ts`) qui lit les tickets sur GitHub (#2061).
import { ConfigInvalide } from "./runtime.ts";
import { refusEn } from "./zones.ts";

// `prio:1` → 1, de 1 à 9 — et `prio:0`, qui passe devant tout : celle que la
// pass pose sur la réparation d'une base rouge. Sans label de priorité, ou
// avec un label hors de cette plage : rien, le ticket passe après les autres.
export function priorite(labels: string[]): number | null {
  const niveaux = labels.flatMap((label) => /^prio:([0-9])$/.exec(label)?.[1] ?? []).map(Number);
  return niveaux.length === 0 ? null : Math.min(...niveaux);
}

// Ceux dont un commentaire fait foi : le propriétaire du dépôt, les membres de
// son organisation, ses collaborateurs. Tout le monde peut commenter une issue
// publique, et une fiche dit quoi cuisiner.
export const DE_CONFIANCE = ["OWNER", "MEMBER", "COLLABORATOR"];

export type ConfigRail = {
  // `<owner>/<repo>` : le dépôt GitHub dont le projet sert les issues.
  depot: string;
  dureeBailMs: number;
  gh: string;
  // Les chemins du dépôt qui n'appartiennent à aucun ticket : ce que presque
  // tous touchent (la doc vivante, un changelog). Aucun par défaut.
  communs: string[];
};

// Trois fois le délai d'inactivité, la moitié du plafond de durée : un cook
// qui lit longuement avant d'écrire garde son ticket.
const BAIL_PAR_DEFAUT_S = 1800;

// Lit la configuration du rail dans l'environnement. Le dépôt n'a pas de
// défaut : le nom de projet est un identifiant court, il ne le désigne pas.
export function configRail(env: Record<string, string | undefined>): ConfigRail {
  const depot = env.BRIGADE_GITHUB_REPO;
  if (!depot) throw new ConfigInvalide("BRIGADE_GITHUB_REPO is not set");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(depot)) {
    throw new ConfigInvalide(`BRIGADE_GITHUB_REPO invalid: “${depot}” — expected <owner>/<repo>`);
  }
  const bail = env.BRIGADE_LEASE_SECONDS || String(BAIL_PAR_DEFAUT_S);
  if (!/^[1-9][0-9]*$/.test(bail)) {
    throw new ConfigInvalide(`BRIGADE_LEASE_SECONDS invalid: “${bail}” — expected a whole number of seconds`);
  }
  const communs = [...new Set((env.BRIGADE_COMMON_PATHS ?? "").split(",").map((chemin) => chemin.trim()).filter(Boolean))];
  for (const chemin of communs) {
    const pourquoi = refusEn(chemin);
    if (pourquoi !== null) {
      throw new ConfigInvalide(`BRIGADE_COMMON_PATHS invalid: “${chemin}” ${pourquoi} — expected paths relative to its root, separated by commas`);
    }
  }
  return { depot, dureeBailMs: Number(bail) * 1000, gh: env.BRIGADE_GH_BIN || "gh", communs };
}
