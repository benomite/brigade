// Deux tickets qui s'attendent l'un l'autre — ou une chaîne plus longue qui se
// referme — ne bougent plus jamais (#18 attendait #28, qui attendait #18). La
// cuisine défait la boucle seule, sans le chef : dans le cycle, le ticket posé
// en dernier (le numéro le plus haut) lâche son attente du suivant, et le plus
// ancien garde sa place. Une seule attente est levée par boucle, dite sur
// l'issue du ticket qui la lâche en une ligne. Les attentes hors boucle ne sont
// pas touchées. Les conflits avec la base ne passent pas ici.
import type { GitHubDuTour, TicketLu } from "../brigade-github.ts";
import { attendusOuverts } from "../attente-ticket/attente-ticket.ts";
import { MARQUE_D_ATTENTE_LEVEE } from "./levee.ts";

type Lecteur = Pick<GitHubDuTour, "commentaires" | "dependancesOuvertes" | "issue" | "commenter">;

// Un cycle d'attentes sous `depart`, dans l'ordre où chacun attend le suivant
// (le dernier attend le premier), ou null. `attendusDe` est lu une fois par ticket.
export function cycleDAttentes(depart: number, attendusDe: (ticket: number) => readonly number[]): number[] | null {
  const pile: number[] = [];
  const finis = new Set<number>();
  const descendre = (ticket: number): number[] | null => {
    const rang = pile.indexOf(ticket);
    if (rang >= 0) return pile.slice(rang);
    if (finis.has(ticket)) return null;
    pile.push(ticket);
    for (const attendu of attendusDe(ticket)) {
      const cycle = descendre(attendu);
      if (cycle !== null) return cycle;
    }
    pile.pop();
    finis.add(ticket);
    return null;
  };
  return descendre(depart);
}

// Le ticket qui lâche, et celui qu'il cesse d'attendre : le plus récent du cycle et son suivant.
export function attenteALever(cycle: readonly number[]): { ticket: number; attendu: number } {
  const recent = Math.max(...cycle);
  const rang = cycle.indexOf(recent);
  return { ticket: recent, attendu: cycle[(rang + 1) % cycle.length] as number };
}

export function direLevee(cycle: readonly number[], { ticket, attendu }: { ticket: number; attendu: number }): string {
  const boucle = [...cycle, cycle[0] as number].map((n) => `#${n}`).join(" → ");
  const seul = cycle.length === 2;
  return `${MARQUE_D_ATTENTE_LEVEE} #${attendu} -->\nThe kitchen removed the wait of #${ticket} on #${attendu}: ${seul ? `#${ticket} and #${attendu} waited for each other` : `the tickets waited in a loop (${boucle})`} and none of them could move. #${ticket} is the most recent of the loop, so it drops its wait and the older tickets keep theirs.`;
}

// Défait les boucles d'attentes où passe `ticket`, ou que ses attentes atteignent, puis dit
// ce qu'il attend encore. Une lecture qui échoue sur un autre ticket que lui
// ne lui prête aucune attente : aucune boucle n'est décidée sur ce qu'on n'a pas lu.
// Une attente que `commenter` n'a pas pu poser n'est pas levée : l'erreur remonte.
export async function defaireLesBoucles(github: Lecteur, ticket: number, lus: readonly TicketLu[]): Promise<number[]> {
  const connus = new Map<number, number[]>();
  const lire = async (numero: number): Promise<void> => {
    if (connus.has(numero)) return;
    if (numero === ticket) {
      connus.set(numero, await attendusOuverts(github, numero, lus));
    } else {
      connus.set(numero, await attendusOuverts(github, numero, lus).catch(() => []));
    }
    for (const attendu of connus.get(numero) ?? []) await lire(attendu);
  };
  await lire(ticket);
  for (;;) {
    const cycle = cycleDAttentes(ticket, (numero) => connus.get(numero) ?? []);
    if (cycle === null) return connus.get(ticket) ?? [];
    const levee = attenteALever(cycle);
    await github.commenter(levee.ticket, direLevee(cycle, levee));
    connus.set(levee.ticket, (connus.get(levee.ticket) ?? []).filter((n) => n !== levee.attendu));
  }
}
