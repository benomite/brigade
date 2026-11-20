import { DE_CONFIANCE } from "../alimenter.ts";
import { MARQUEUR_MANAGER } from "../juger.ts";

// Un geste que le manager demande au cook n'est jamais un point bloquant (#3962, docs/runtime/pass.md).
// Pour un test gelé que la livraison change : la demande est tenue à la lettre quand un commentaire du manager nomme
// le fichier, que le diff depuis le gel ne retire aucune ligne, et que chaque ligne qu'il ajoute est un extrait que
// ce commentaire cite entre accents graves. Tout autre changement reste jugé.

// Le diff depuis le gel, découpé par fichier (`diff --git a/<chemin> b/<chemin>`).
export function diffParFichier(diff: string): Map<string, string> {
  const blocs = new Map<string, string>();
  for (const bloc of diff.split(/^(?=diff --git )/m)) {
    const nom = /^diff --git a\/(.+?) b\//.exec(bloc)?.[1];
    if (nom !== undefined) blocs.set(nom, bloc);
  }
  return blocs;
}

export function demandeTenue(fichier: string, diffDuFichier: string, demandes: readonly string[]): boolean {
  const lignes = diffDuFichier.split("\n").filter((ligne) => /^[+-]/.test(ligne) && !/^(\+\+\+|---) /.test(ligne));
  if (lignes.length === 0 || lignes.some((ligne) => ligne.startsWith("-"))) return false;
  return demandes.some((demande) => {
    if (!demande.includes(fichier)) return false;
    const extraits = new Set([...demande.matchAll(/`([^`\n]+)`/g)].map(([, extrait]) => (extrait ?? "").trim()));
    return lignes.every((ligne) => extraits.has(ligne.slice(1).trim()));
  });
}

// Les demandes du manager dans le fil : ses commentaires, posés par un compte qui a la main sur le dépôt.
export const demandesDuManagerDans = (commentaires: readonly { body: string; association: string }[]): string[] =>
  commentaires.filter(({ body, association }) => DE_CONFIANCE.includes(association) && body.includes(MARQUEUR_MANAGER)).map(({ body }) => body);
