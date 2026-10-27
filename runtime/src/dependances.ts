// Les dépendances entre tickets, pour ce qui ne tient pas dans un geste du
// rail : nommer un cycle au moment où une fiche le crée, et dire sur l'issue
// d'un ticket que la cuisine n'attend plus celui que sa fiche nomme, fermé sans
// avoir été servi (#1834).
import type { GitHub } from "./github.ts";
import type { Journal } from "./journal.ts";
import { orphelines } from "./projections/pass.ts";
import { lireRail } from "./projections/rail.ts";
import { direAttentesLevees } from "./rail.ts";

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

// Un ticket qui en attend un autre ne va jamais dans TODO, quoi qu'il arrive à
// l'autre (#1834) : servi, l'attente tombe ; encore ouvert, même hors du rail,
// il l'attend sur le rail ; fermé sans avoir été servi — ou disparu —, la
// cuisine lève l'attente d'elle-même, le rail le dit, et l'issue du ticket
// aussi : un fait au journal, puis un commentaire. Une fois par départ — le
// même ticket attendu, revenu sur le rail puis reparti, en vaut un second. Un
// ticket parti en laissant une livraison que la pass n'a pas encore relue sur
// GitHub n'est pas encore dit : mergée à la main juste avant, elle le sert, et
// le sondage suivant le dira. Rend le nombre de tickets dont l'issue est avertie.
export async function signalerAttentesLevees(journal: Journal, github: GitHub, projet: string): Promise<number> {
  const nouveaux = journal.base.transaction(() => {
    const aRelire = new Set(orphelines(journal.base).map((orpheline) => orpheline.ticket));
    return lireRail(journal.base).flatMap((ticket) => {
      const levees = ticket.dropped.filter(
        ({ ticket: attendu, reason, seq }) =>
          !aRelire.has(attendu) &&
          journal.ajouter({
            project: projet,
            ticket: ticket.ticket,
            author: "runtime",
            type: "ticket.wait-dropped",
            payload: { by: attendu, reason },
            dedupKey: `rail:wait-dropped:${ticket.ticket}:${attendu}:${seq}`,
          }) !== null,
      );
      return levees.length === 0 ? [] : [{ ticket: ticket.ticket, dit: direAttentesLevees({ ...ticket, dropped: levees }) }];
    });
  });
  for (const { ticket, dit } of nouveaux) {
    const corps = [
      `**Rail — attente levée.** ${dit}.`,
      "",
      "La cuisine l'a retiré d'elle-même de ce que ce ticket attend : rien n'est demandé au chef. Le ticket part à son tour, s'il n'attend rien d'autre.",
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
