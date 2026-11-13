// Un besoin n'est pas un ticket (#3459, #3479) : une épique, une idée, une
// décision à prendre, qui se découpe en tickets. Une fois découpé, ce sont ses
// tickets qui portent le travail, et le besoin suit leur avancement. Seen on
// benomite/secondes : le second avait lancé des besoins, le manager avait écrit
// leurs tickets, et besoins comme tickets restaient sur le rail — un cook
// pouvait prendre un besoin déjà couvert.
//
// Le contrat, dans les deux sens :
//   - chaque ticket né d'un besoin porte la ligne `Part of #<besoin>` ;
//   - le corps du besoin porte une liste de tâches, une ligne `- [ ] #<ticket>`
//     par ticket, cochée quand ce ticket est servi.
// Le besoin découpé quitte le rail (`fire` retiré), et le rail ne montre jamais
// un besoin avec un ticket qui en est né. Il se ferme quand tous ses tickets
// sont fermés (`decoupage.ts`, `fermerTerminee`).
import { epiqueDe, FIN, lignesHorsCode, type LigneDeListe } from "../epique.ts";
import { LABEL, type GitHub, type Issue } from "../github.ts";

export function partDe(besoin: number): string {
  return `Part of #${besoin}`;
}

const PART_OF = /^[ \t]*[*_]{0,2}Part of[ \t]*:?[ \t]*[*_]{0,2}[ \t]*#([1-9]\d*)\b/i;

// Le besoin dont le corps d'un ticket se dit né : `Part of #N`, sinon la ligne
// d'épique (`Epic: #N`) qu'un ticket écrit à la main porte. Null s'il n'en dit
// aucun. Hors des blocs de code : la citer n'est pas la porter.
export function besoinDe(corps: string): number | null {
  for (const { texte } of lignesHorsCode(corps)) {
    const numero = Number(PART_OF.exec(texte)?.[1]);
    if (Number.isSafeInteger(numero)) return numero;
  }
  return epiqueDe(corps);
}

// Ce que la lecture d'un ticket du rail retient de son corps : le besoin dont
// il est né, s'il en dit un autre que lui-même.
export function lienDuCorps(numero: number, corps: string): { besoin?: number } {
  const besoin = besoinDe(corps);
  return besoin === null || besoin === numero ? {} : { besoin };
}

// La ligne de tâche d'un ticket du besoin : cochée quand il est servi.
function tache(ligne: Pick<LigneDeListe, "ticket" | "served">): string {
  return `- [${ligne.served ? "x" : " "}] #${ligne.ticket}`;
}

// Le bloc de la liste d'une épique (`rendreListe`), avec, avant son marqueur de
// fin, la liste de tâches de ses tickets : GitHub en fait l'avancement du
// besoin, et chaque ticket y renvoie par sa ligne `Part of`.
export function avecTaches(bloc: string, lignes: ReadonlyArray<Pick<LigneDeListe, "ticket" | "served">>): string {
  const fin = bloc.lastIndexOf(FIN);
  if (fin === -1 || lignes.length === 0) return bloc;
  return `${bloc.slice(0, fin)}${lignes.map(tache).join("\n")}\n${bloc.slice(fin)}`;
}

// Ce qui, d'une liste d'issues lancées, est sur le rail : ni une épique dont le
// corps liste les tickets (#2618), ni un besoin dont un ticket lancé est né.
// Le rail ne porte jamais un besoin et son ticket à la fois : c'est le ticket
// qui se prend.
export function horsDesBesoins<T extends Pick<Issue, "number" | "epique" | "besoin">>(tickets: readonly T[]): T[] {
  const couverts = new Set(tickets.flatMap((ticket) => (ticket.besoin === undefined ? [] : [ticket.besoin])));
  return tickets.filter((ticket) => ticket.epique !== true && !couverts.has(ticket.number));
}

// Le besoin découpé quitte le rail : son `fire` se retire, relu juste avant
// d'écrire — le chef a pu le retirer, ou fermer l'issue. Lève si GitHub ne
// répond pas : le découpage reprend au tour suivant, et le retire alors.
export async function sortirDuRail(github: Pick<GitHub, "issue" | "delabelliser">, besoin: number): Promise<boolean> {
  const frais = await github.issue(besoin);
  if (frais?.state !== "open" || !frais.labels.includes(LABEL)) return false;
  await github.delabelliser(besoin, LABEL);
  return true;
}
