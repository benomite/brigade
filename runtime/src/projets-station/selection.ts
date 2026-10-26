// Les projets choisis dans l'app pour cette station (`brigade-selection.json`,
// `enregistrement-station/contrat.ts`), tels que la station les tient : une
// demande comme celle de l'appairage (`projets/demande.ts`), que
// `projets/tenir.ts` prépare et sert. La sélection ne porte que des dépôts :
// le reste, la station le tire du dépôt, de sa machine, ou d'une valeur de
// départ — et le chef le change ensuite, comme toute décision.
import { availableParallelism } from "node:os";
import { execFileSync } from "../sans-invite.ts";
import type { Selection } from "../enregistrement-station/contrat.ts";
import { nomDuDepot } from "../projets/ajout-de-station.ts";
import { BRANCHE, type Calibre, type Demande, type ProjetDemande } from "../projets/demande.ts";
import { plafondDesCoeurs } from "../projections/stations.ts";
import { brancheDuProjet } from "../reglages-projet/en-vigueur.ts";

// Le calibrage du manager et du reviewer qu'un dépôt ne fixe pas : la valeur
// de départ mesurée que l'app propose aussi (`CALIBRAGE_MESURE`, #425). Celui
// que le dépôt déclare passe avant (`reglages-projet/en-vigueur.ts`).
export const CALIBRAGE_DE_DEPART: Calibre = { modele: "sonnet", effort: "medium" };

// Le plafond de cooks d'un projet choisi : celui que les cœurs de la machine
// permettent (#1079), le même que l'app propose.
export const cooksDeLaMachine = (coeurs = availableParallelism()): number => plafondDesCoeurs(coeurs);

// La branche que la ligne du projet nomme : aucune si son dépôt en déclare une
// (`.claude/brigade/projet.json`, ou son CLAUDE.md) — elle est relue à chaque
// ouverture de sa cuisine. Sinon, la branche par défaut du dépôt, lue sur son
// clone. Sans clone encore, aucune : la station le clone à cette lecture, et
// la nomme à la suivante.
export function baseDuClone(clone: string, env?: NodeJS.ProcessEnv): string | null {
  if (brancheDuProjet(clone, null, env).branche !== null) return null;
  try {
    const tete = execFileSync("git", ["-C", clone, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"], ...(env === undefined ? {} : { env }) })
      .trim()
      .replace(/^origin\//, "");
    return BRANCHE.test(tete) ? tete : null;
  } catch {
    return null;
  }
}

export type OptionsDemande = {
  // Le plafond de cooks de chaque projet.
  cooks: number;
  // La branche de la ligne d'un projet, par son nom (`baseDuClone`).
  base: (nom: string) => string | null;
};

// La demande que la sélection fait à la station : un projet par dépôt, dont
// elle est la principale. Son nom est celui que l'app tire du dépôt
// (`nomDuDepot`). Deux dépôts du même nom : le premier de la liste le garde,
// l'autre n'est pas servi, et c'est dit.
export function demandeDeLaSelection(selection: Selection, options: OptionsDemande): Demande {
  const projets: ProjetDemande[] = [];
  const problemes: string[] = [];
  for (const depot of selection.repositories) {
    const nom = nomDuDepot(depot);
    if (nom === null) {
      problemes.push(`${depot}, choisi dans l'app, n'est pas servi : son nom ne donne pas de nom de projet (minuscules, chiffres et tirets)`);
      continue;
    }
    const deja = projets.find((projet) => projet.nom === nom);
    if (deja !== undefined) {
      problemes.push(`${depot}, choisi dans l'app, n'est pas servi : ${deja.depot} sert déjà sous le nom de projet « ${nom} »`);
      continue;
    }
    projets.push({ nom, depot, base: options.base(nom), principale: true, cooks: options.cooks, manager: CALIBRAGE_DE_DEPART, reviewer: CALIBRAGE_DE_DEPART, ouvertLe: null, demandeLe: null });
  }
  return { projets, problemes };
}
