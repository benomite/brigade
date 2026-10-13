// Un historique de merges fixe, écrit d'un seul `git fast-import` : cent
// merges par `git merge` coûteraient six cents process. Il s'écrit sur
// `origin/<base>` du clone — ce que l'observation lit — et nulle part
// ailleurs : la branche locale, l'index et l'arbre de travail ne bougent pas.
import { execFileSync } from "node:child_process";
import { BASE, ENV_GIT } from "../outils.ts";

// Ce qu'un commit change : le contenu d'un fichier, ou `null` s'il le retire.
export type Fichiers = Record<string, string | null>;
// Un merge de la branche d'intégration, ou un commit posé droit dessus.
// `brouillon` : la branche mergée a d'abord écrit autre chose, qu'elle a
// retiré avant son merge. `enRetard` : elle est partie avant l'étape
// précédente, et ne porte pas ce que celle-ci a apporté.
export type Etape = { merge: Fichiers; brouillon?: Fichiers; enRetard?: true } | { commit: Fichiers };

// `combien` lignes toutes différentes.
export const lignes = (combien: number, nom = "ligne"): string => Array.from({ length: combien }, (_, i) => `${nom} ${i + 1}\n`).join("");

const REF = `refs/remotes/origin/${BASE}`;
const COTE = "refs/essai/cote";

export function ecrireHistoire(clone: string, etapes: Etape[]): void {
  const flux: string[] = [];
  let marque = 0;
  // La tête de la branche d'intégration : une référence, puis une marque.
  let tete = `${REF}^0`;
  // Celle d'avant l'étape précédente.
  let avant = tete;
  const donnees = (texte: string) => `data ${Buffer.byteLength(texte)}\n${texte}\n`;
  const commit = (ref: string, parents: string[], fichiers: Fichiers): string => {
    marque += 1;
    flux.push(`commit ${ref}\n`, `mark :${marque}\n`, `committer cook <cook@brigade.test> ${1_760_000_000 + marque * 60} +0000\n`, donnees(`étape ${marque}`));
    parents.forEach((parent, rang) => flux.push(`${rang === 0 ? "from" : "merge"} ${parent}\n`));
    for (const [chemin, contenu] of Object.entries(fichiers)) flux.push(contenu === null ? `D ${chemin}\n` : `M 100644 inline ${chemin}\n${donnees(contenu)}`);
    return `:${marque}`;
  };
  for (const etape of etapes) {
    const precedente = avant;
    avant = tete;
    if ("commit" in etape) {
      tete = commit(REF, [tete], etape.commit);
      continue;
    }
    // L'arbre d'un merge part de son premier parent : il redit ce que la
    // branche mergée apporte.
    let cote = etape.enRetard ? precedente : tete;
    if (etape.brouillon) {
      cote = commit(COTE, [cote], etape.brouillon);
      cote = commit(COTE, [cote], { ...Object.fromEntries(Object.keys(etape.brouillon).map((chemin) => [chemin, null])), ...etape.merge });
    } else cote = commit(COTE, [cote], etape.merge);
    tete = commit(REF, [tete, cote], etape.merge);
  }
  execFileSync("git", ["fast-import", "--quiet", "--force"], { cwd: clone, env: ENV_GIT, input: flux.join(""), stdio: ["pipe", "ignore", "pipe"] });
}
