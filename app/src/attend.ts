// Ce qui attend le chef, mis à part : le bloc `attend` de `status`, pris par son
// bord et par lui seul — de la seule ligne de la sortie qui commence par
// `attend` à la seule qui vaut `fin attend`, bornes comprises (docs/runtime.md,
// « Ce qui attend le chef »). Rien de ce qu'il porte n'est compté ni redit :
// quand rien n'attend, c'est lui qui le dit. Le reste de la sortie reste mot
// pour mot, à sa place. Une seule chose y est lue, pour le rail : le numéro en
// tête d'une ligne (`ticketsDe`).
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

// Un ticket que le bloc nomme en tête d'une de ses lignes, et ce que la ligne
// en dit ensuite, mot pour mot.
export type Attendu = { ticket: number; ligne: string };

// Deux espaces, `#`, des chiffres, puis deux espaces ou la fin de la ligne :
// la tête qu'écrit `status` pour un ticket (runtime/src/attend.ts,
// `decrireAttentes`). C'est la seule forme lue dans le bloc.
const TETE_DE_TICKET = /^ {2}#(\d+)(?: {2}(.*))?$/;

// Les tickets du bloc, dans son ordre — le plus ancien d'abord. Une ligne sans
// numéro en tête n'en donne aucun : la station sans connexion Max, le bilan des
// arrêts faute de grant, la tête du bloc. Elle reste dans le bloc, et nulle
// part ailleurs.
export function ticketsDe(bloc: string): Attendu[] {
  return bloc.split("\n").flatMap((ligne) => {
    const [, numero, suite] = TETE_DE_TICKET.exec(ligne) ?? [];
    const ticket = Number(numero);
    return numero !== undefined && Number.isSafeInteger(ticket) ? [{ ticket, ligne: suite ?? "" }] : [];
  });
}
