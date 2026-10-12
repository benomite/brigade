// Ce qui attend le chef, mis à part : le bloc `attend` de `status`, pris par son
// bord et par lui seul — de la seule ligne de la sortie qui commence par
// `attend` à la seule qui vaut `fin attend`, bornes comprises (docs/runtime.md,
// « Ce qui attend le chef »). Rien de ce qu'il porte n'est lu, compté ni redit :
// quand rien n'attend, c'est lui qui le dit. Le reste de la sortie reste mot
// pour mot, à sa place.
import type { Echec, Lecture, Sortie } from "./box.ts";

// `attend` : le bloc, tel que `status` l'a écrit ; les `sorties` sont alors
// celles de la lecture, celle de `status` sans lui. Absent : la sortie de
// `status` n'a pas ce bord, et elle est restée entière — ce n'est pas « rien
// n'attend ».
export type Montree = { projet: string; demande: number; a: string } & ({ attend: string | undefined; sorties: Sortie[] } | Echec);

// Où le bloc commence et où il finit dans le texte, saut de ligne final compris.
function bord(texte: string): { debut: number; fin: number } | undefined {
  const debuts: number[] = [];
  const fins: number[] = [];
  for (let depart = 0; depart < texte.length; ) {
    const saut = texte.indexOf("\n", depart);
    const suivante = saut === -1 ? texte.length : saut + 1;
    const ligne = texte.slice(depart, saut === -1 ? texte.length : saut);
    if (ligne === "fin attend") fins.push(suivante);
    else if (ligne.startsWith("attend")) debuts.push(depart);
    depart = suivante;
  }
  const [debut, fin] = [debuts[0], fins[0]];
  if (debuts.length !== 1 || fins.length !== 1 || debut === undefined || fin === undefined || fin <= debut) return undefined;
  return { debut, fin };
}

export function mettreAPart(lecture: Lecture): Montree {
  if ("erreur" in lecture) return lecture;
  let attend: string | undefined;
  const sorties = lecture.sorties.map((sortie) => {
    const trouve = sortie.commande === "status" ? bord(sortie.texte) : undefined;
    if (trouve === undefined) return sortie;
    attend = sortie.texte.slice(trouve.debut, trouve.fin);
    return { commande: sortie.commande, texte: sortie.texte.slice(0, trouve.debut) + sortie.texte.slice(trouve.fin) };
  });
  return { ...lecture, attend, sorties };
}
