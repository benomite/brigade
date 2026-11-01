// Quand la base se révèle rouge, quels merges l'ont précédée : ceux faits
// depuis la dernière base verte, dans l'ordre où ils ont eu lieu, avec le début
// et la fin du jugement de chacun. Deux livraisons jugées en même temps ont pu
// casser la base ensemble sans qu'aucune des deux ne l'ait vu : cette ligne
// dit si les jugements se recouvrent. Elle ne décide de rien.
import type { Evenement } from "../evenements.ts";

export type MergeAvantRouge = {
  ticket: number;
  // Rang du merge parmi ceux faits depuis la dernière base verte, depuis 1.
  ordre: number;
  merge: string;
  // Début du jugement (le dernier `pass.started` avant le merge) et sa fin (le
  // dernier `pass.judged`) ; nuls si le journal n'en dit rien, comme d'un merge
  // fait hors du runtime.
  debut: string | null;
  fin: string | null;
};

// Les merges d'après `evenements` (ceux qui suivent la dernière base verte),
// avec, pour chaque ticket, ses propres faits — `duTicket`.
export function mergesAvantRouge(evenements: Evenement[], duTicket: (ticket: number) => Evenement[]): MergeAvantRouge[] {
  const merges: MergeAvantRouge[] = [];
  for (const evenement of evenements) {
    if (evenement.type !== "merge.done" || evenement.ticket === null) continue;
    const ticket = evenement.ticket;
    let debut: string | null = null;
    let fin: string | null = null;
    for (const fait of duTicket(ticket)) {
      if (fait.seq >= evenement.seq) break;
      if (fait.type === "pass.started") debut = fait.at;
      else if (fait.type === "pass.judged") fin = fait.at;
    }
    merges.push({ ticket, ordre: merges.length + 1, merge: evenement.at, debut, fin });
  }
  return merges;
}

const instant = (valeur: string | null) => (valeur === null ? Number.NaN : Date.parse(valeur));

// Vrai si les jugements de deux merges, de leur début à leur fin, se recouvrent.
export function seRecouvrent(a: MergeAvantRouge, b: MergeAvantRouge): boolean {
  const [debutA, debutB, finA, finB] = [instant(a.debut), instant(b.debut), instant(a.fin), instant(b.fin)];
  return debutA < finB && debutB < finA;
}

// La ligne du journal, ou null quand aucun merge n'a précédé le rouge.
export function direMergesAvantRouge(base: string, merges: MergeAvantRouge[]): string | null {
  if (merges.length === 0) return null;
  const decrire = ({ ticket, ordre, debut, fin, merge }: MergeAvantRouge) => `#${ticket} (merge n°${ordre} à ${merge}, jugement ${debut ?? "?"} → ${fin ?? "?"})`;
  const [seul] = merges;
  if (merges.length === 1 && seul) return `brigade : ${base} rouge après un seul merge, sans jugement en parallèle : ${decrire(seul)}`;
  const enParallele = merges.filter((merge) => merges.some((autre) => autre !== merge && seRecouvrent(merge, autre)));
  const liste = merges.map(decrire).join(" ; ");
  if (enParallele.length === 0) return `brigade : ${base} rouge après ${merges.length} merges faits l'un après l'autre, sans jugement en parallèle : ${liste}`;
  return `brigade : ${base} rouge après des merges dont les jugements se recouvrent (${enParallele.map(({ ticket }) => `#${ticket}`).join(", ")}) — merges depuis la dernière base verte : ${liste}`;
}
