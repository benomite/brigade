// Où mène un chemin, comme le noyau le suit : composant après composant, chaque
// lien résolu là où il se trouve, et `..` pris depuis où l'on est vraiment —
// `lien/../x` remonte depuis la cible du lien, pas depuis le dossier qui le
// porte. Ce qui n'existe pas encore se compare par le dossier qui existe.
//
// Seul, sans le runtime : `cloison.ts` sait aussi résoudre un chemin, mais
// l'importer charge le journal à chaque appel d'outil du cook — la garde se
// joue avant chacun (même choix que `bac-a-sable/crochet-brigade.ts`).
import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

// Au-delà, un lien qui mène à un lien… est tenu pour une boucle.
const LIENS_MAX = 40;

function lien(chemin: string): string | null {
  try {
    return lstatSync(chemin).isSymbolicLink() ? readlinkSync(chemin) : null;
  } catch {
    return null;
  }
}

// `chemin`, absolu ou relatif à `depuis`, résolu.
export function reel(chemin: string, depuis: string): string {
  // Mis bout à bout, pas joints : `join` lirait `..` sur le texte.
  const absolu = isAbsolute(chemin) ? chemin : `${depuis}${sep}${chemin}`;
  const { root } = parse(absolu);
  let ou = root;
  const reste = absolu.slice(root.length).split(/[\\/]+/).filter(Boolean);
  let sauts = 0;
  while (reste.length > 0) {
    const morceau = reste.shift() as string;
    if (morceau === ".") continue;
    if (morceau === "..") {
      ou = dirname(ou);
      continue;
    }
    const suivant = join(ou, morceau);
    const cible = lien(suivant);
    if (cible === null) {
      ou = suivant;
      continue;
    }
    sauts += 1;
    if (sauts > LIENS_MAX) return resolve(suivant, ...reste);
    // La cible se lit depuis le dossier du lien ; ce qui la suit vient après.
    const vers = isAbsolute(cible) ? cible : `${ou}${sep}${cible}`;
    const racine = parse(vers).root;
    ou = racine;
    reste.unshift(...vers.slice(racine.length).split(/[\\/]+/).filter(Boolean));
  }
  return ou;
}

// Un lieu tel que la garde le compare : résolu, ses liens suivis.
export function lieu(chemin: string): string {
  try {
    return realpathSync(chemin);
  } catch {
    return reel(chemin, sep);
  }
}

// Vrai si `chemin` est `racine` ou se trouve sous elle — les deux résolus.
export function sous(racine: string, chemin: string): boolean {
  const vers = relative(racine, chemin);
  return vers === "" || (vers !== ".." && !vers.startsWith(`..${sep}`) && !isAbsolute(vers));
}
