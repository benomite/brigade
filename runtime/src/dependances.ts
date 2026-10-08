// Les dépendances entre tickets, pour ce qui ne tient pas dans un geste du
// rail : nommer un cycle au moment où une fiche le crée, et avertir le chef
// qu'un ticket est bloqué par l'abandon de celui qu'il attendait.
import type { GitHub } from "./github.ts";
import type { Journal } from "./journal.ts";
import { lireRail } from "./projections/rail.ts";
import { nomAbandon, retenue } from "./rail.ts";

// Les cycles d'un graphe « attend ». Pour chaque ticket pris dans un cycle :
// le plus court qui passe par lui, écrit à partir de son plus petit numéro —
// chacun attend le suivant, le dernier attend le premier. Un ticket qui
// s'attend lui-même n'en est pas un : sa fiche le dit déjà.
export function cycles(attentes: Map<number, number[]>): Map<number, number[]> {
  const trouves = new Map<number, number[]>();
  for (const depart of attentes.keys()) {
    // Parcours en largeur : le premier chemin qui revient au départ est le
    // plus court.
    const chemins: number[][] = [[depart]];
    const vus = new Set<number>([depart]);
    recherche: for (const chemin of chemins) {
      for (const suivant of attentes.get(chemin.at(-1) ?? depart) ?? []) {
        if (suivant === depart && chemin.length > 1) {
          const debut = chemin.indexOf(Math.min(...chemin));
          trouves.set(depart, [...chemin.slice(debut), ...chemin.slice(0, debut)]);
          break recherche;
        }
        if (vus.has(suivant) || !attentes.has(suivant)) continue;
        vus.add(suivant);
        chemins.push([...chemin, suivant]);
      }
    }
  }
  return trouves;
}

// Le cycle tel que la fiche de chacun de ses tickets le porte, en problème.
export function direCycle(cycle: number[]): string {
  const boucle = [...cycle, ...cycle.slice(0, 1)].map((ticket) => `#${ticket}`).join(" → ");
  return `attend : cycle de dépendances — ${boucle} (chacun attend le suivant) : aucun ne partirait jamais, retirer une de ces attentes`;
}

// Avertit le chef des tickets en attente qu'un abandon vient de bloquer : un
// fait au journal, puis un commentaire sur l'issue. Une fois par abandon — le
// même ticket attendu, revenu sur le rail puis reparti, en vaut un second.
// Rend le nombre de tickets signalés.
export async function signalerBlocages(journal: Journal, github: GitHub, projet: string): Promise<number> {
  const nouveaux = journal.base.transaction(() =>
    lireRail(journal.base).flatMap((ticket) => {
      if (retenue(ticket) !== "bloque") return [];
      const abandons = ticket.awaits.filter(
        ({ ticket: attendu, left }) =>
          left !== null &&
          journal.ajouter({
            project: projet,
            ticket: ticket.ticket,
            author: "runtime",
            type: "ticket.blocked",
            payload: { by: attendu, reason: left.reason },
            dedupKey: `rail:blocked:${ticket.ticket}:${attendu}:${left.seq}`,
          }) !== null,
      );
      return abandons.length === 0 ? [] : [{ ticket: ticket.ticket, abandons }];
    }),
  );
  for (const { ticket, abandons } of nouveaux) {
    const liste = abandons.map(({ ticket: attendu, left }) => `#${attendu} (${nomAbandon(left?.reason ?? "")})`).join(", ");
    const corps = [
      `**Rail — ticket bloqué.** Il attend ${liste}, qui a quitté le rail sans avoir été servi : aucune station ne le prendra tant que ça dure.`,
      "",
      "Pour le débloquer, au choix : remettre le ticket attendu sur le rail (issue ouverte, label `fire`) — celui-ci l'attendra de nouveau, et partira une fois l'autre servi ; ou retirer son numéro de la ligne `attend` de la fiche.",
    ].join("\n");
    try {
      await github.commenter(ticket, corps);
    } catch (erreur) {
      // Le journal et le rail le disent déjà : un commentaire qui ne part pas
      // ne retient rien.
      console.error(`brigade : commentaire non posté sur le ticket #${ticket} — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }
  return nouveaux.length;
}
