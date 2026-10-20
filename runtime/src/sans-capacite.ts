// Un ticket qui demande une capacité qu'aucune station ne fournit n'arrive pas
// au chef tel quel. La station le met de côté (86 `no-station: …`), et le
// manager le reprend avant lui : il le réécrit ou le redécoupe pour qu'il
// n'ait plus besoin de cette capacité — le découpage a souvent mal posé le
// ticket. Les sous-tickets naissent ensuite comme ceux d'une épique, et le
// ticket sort du rail (86 `manager:split`). Ce n'est que si la réécriture est
// impossible que le chef est sollicité, par une carte `gesture` qui nomme
// l'accès à donner et pourquoi.
//
// Rien n'est gardé en mémoire : l'issue de chaque ticket est au journal
// (`manager.capability-resplit`, `manager.capability-gestured`), et ce qui
// échoue se reprend au tour suivant sans rejuger. Un ticket né d'une telle
// réécriture ne se réécrit pas une seconde fois : s'il demande encore ce qui
// manque, il va droit à la carte.
import { DE_CONFIANCE } from "./alimenter.ts";
import { direManqueEn, gesteDeCapaciteEn, manqueDuMotif, type Manque } from "./capacites.ts";
import { cartesEnTodo, entrerDansTodo, sortirDeTodo } from "./carte-todo.ts";
import type { FaitManager } from "./events/manager.ts";
import { REDECOUPE } from "./events/rail.ts";
import type { GitHub, IssueOuverte } from "./github.ts";
import type { Journal } from "./journal.ts";
import { MARQUEUR_MANAGER } from "./juger.ts";
import { ticketDEpique } from "./projections/splits.ts";
import type { Rail } from "./rail.ts";

export const AUTEUR_DE_CARTE = "manager";

// Le motif du retour en attente d'un ticket que le manager reprend : il est
// rendu au rail le temps d'être mis de côté pour le redécoupage.
export const CAPACITE_REPRISE = "manager:capability-resplit";

export type AtelierSansCapacite = {
  journal: Journal;
  projet: string;
  rail: Rail;
  github: GitHub;
  noter: (ticket: number | null, fait: FaitManager) => unknown;
  // Le découpage du manager : rien n'est écrit avant `retenir`.
  redecouper: (ticket: IssueOuverte, commentaires: string[], echec: string) => Promise<{ retenir: () => void } | { impossible: string } | null>;
  peutJuger: () => boolean;
  arrete: () => boolean;
  eteint: () => boolean;
  avertir: (message: string) => void;
  signature: (run: string | null, verbe: string) => string;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const sur1Ligne = (texte: string) => texte.replace(/\s+/g, " ").trim();
const noms = (manque: Manque) => manque.capacites.map((nom) => `\`${nom}\``).join(manque.ensemble ? " + " : ", ");

// La carte que le chef lit : l'accès à donner, et pourquoi le ticket ne s'en
// passe pas. Une seule ligne.
export function enonceDeGeste(manque: Manque, pourquoi: string): string {
  return sur1Ligne(`${direManqueEn(manque)} — to provide: ${gesteDeCapaciteEn(manque)}. The ticket cannot be rewritten without it: ${pourquoi}`);
}

export function ouvrirSansCapacite(atelier: AtelierSansCapacite) {
  const { journal, projet, rail, github, noter, avertir, arrete } = atelier;
  const { base } = journal;

  const commenter = async (ticket: number, corps: string[]) => {
    try {
      await github.commenter(ticket, [MARQUEUR_MANAGER, ...corps].join("\n"));
    } catch (erreur) {
      if (!arrete()) avertir(`brigade : commentaire non posé sur le ticket #${ticket} — ${message(erreur)}`);
    }
  };

  // Un ticket né d'une telle réécriture ne se réécrit pas une seconde fois.
  const neDUneReprise = (ticket: number): boolean => {
    const ne = ticketDEpique(base, ticket);
    return ne !== null && journal.duTicket(ne.epic).some((evenement) => evenement.type === "manager.capability-resplit");
  };

  const dejaTraite = (ticket: number) => journal.duTicket(ticket).some((evenement) => evenement.type === "manager.capability-resplit" || evenement.type === "manager.capability-gestured");

  const poserLaCarte = async (ticket: number, manque: Manque, pourquoi: string, run: string | null) => {
    const enonce = enonceDeGeste(manque, pourquoi);
    const retenue = base.transaction(() => {
      const jugement = entrerDansTodo(journal, projet, ticket, { type: "gesture", enonce }, AUTEUR_DE_CARTE);
      noter(ticket, { type: "manager.capability-gestured", payload: { missing: manque.capacites, reason: pourquoi } });
      return jugement.admise;
    });
    if (!retenue) return;
    await commenter(ticket, [
      `**Manager — ${direManqueEn(manque)} : une carte est posée devant le chef.**`,
      "",
      `Ce ticket ne peut pas se passer de ${noms(manque)} : ${pourquoi}`,
      "",
      `Geste attendu : ${gesteDeCapaciteEn(manque)}.`,
      "",
      atelier.signature(run, "Lu"),
    ]);
  };

  const reprendre = async (ticket: number, manque: Manque): Promise<boolean> => {
    const issue = await github.issue(ticket);
    if (arrete() || !issue) return false;
    // Le ticket est sur le rail : son auteur a déjà la confiance du projet.
    const ouverte: IssueOuverte = { ...issue, body: issue.body ?? "", association: "OWNER" };
    if (neDUneReprise(ticket)) {
      await poserLaCarte(ticket, manque, "this ticket already comes from a rewrite and still asks for it", null);
      return true;
    }
    if (!atelier.peutJuger()) return false;
    const commentaires = (await github.commentaires(ticket))
      .filter((commentaire) => DE_CONFIANCE.includes(commentaire.association) && !commentaire.body.includes(MARQUEUR_MANAGER))
      .map((commentaire) => commentaire.body);
    if (arrete()) return false;
    const echec = [
      `Ce ticket demande ${noms(manque)} (ligne \`requiert\` de sa fiche), et ${direManqueEn(manque).replace(/^no station/, "aucune station ne le")} : il ne peut pas partir, et ne doit pas aller au chef tel quel.`,
      "",
      "Réécris-le ou redécoupe-le pour qu'aucun ticket n'ait plus besoin de cette capacité. Si c'est impossible parce que le travail est infaisable sans elle, dis-le avec la raison précise.",
    ].join("\n");
    const redecoupe = await atelier.redecouper(ouverte, commentaires, echec);
    if (redecoupe === null || arrete() || atelier.eteint()) return false;
    if ("impossible" in redecoupe) {
      await poserLaCarte(ticket, manque, sur1Ligne(redecoupe.impossible), null);
      return true;
    }
    // Le découpage, le fait et le 86 s'écrivent ensemble : le ticket ne tient
    // plus la zone de ses propres sous-tickets.
    const fait = base.transaction(() => {
      const sur = rail.tickets().find((autre) => autre.ticket === ticket);
      if (!sur || sur.state !== "86" || manqueDuMotif(sur.reason) === null) return false;
      redecoupe.retenir();
      noter(ticket, { type: "manager.capability-resplit", payload: { missing: manque.capacites, run: null } });
      rail.rendre(ticket, CAPACITE_REPRISE);
      rail.quatreVingtSix(ticket, { motif: REDECOUPE });
      return true;
    });
    if (fait) {
      await commenter(ticket, [
        `**Manager — ${direManqueEn(manque).replace(/^no station/, "aucune station ne")} : ticket redécoupé.**`,
        "",
        `Il demandait ${noms(manque)} et le chef n'a pas à le débloquer : ses sous-tickets naissent sans cette dépendance, et celui-ci sort du rail.`,
        "",
        atelier.signature(null, "Redécoupé"),
      ]);
    }
    return true;
  };

  return {
    // Reprend chaque ticket 86 `no-station` que le manager n'a pas encore vu,
    // et sort de TODO la carte d'un ticket qui n'est plus dans ce cas.
    async traiter(): Promise<void> {
      for (const carte of cartesEnTodo(base)) {
        if (carte.type !== "gesture" || !journal.duTicket(carte.ticket).some((evenement) => evenement.type === "manager.capability-gestured")) continue;
        const sur = rail.tickets().find((ticket) => ticket.ticket === carte.ticket);
        if (sur && sur.state === "86" && manqueDuMotif(sur.reason) !== null) continue;
        sortirDeTodo(journal, projet, carte.ticket, "the capability is provided, or the ticket left the rail", AUTEUR_DE_CARTE);
      }
      for (const ticket of rail.tickets()) {
        if (arrete() || atelier.eteint()) return;
        const manque = ticket.state === "86" && ticket.until === null ? manqueDuMotif(ticket.reason) : null;
        if (manque === null || dejaTraite(ticket.ticket)) continue;
        try {
          await reprendre(ticket.ticket, manque);
        } catch (erreur) {
          if (!arrete()) avertir(`brigade : ticket #${ticket.ticket} sans station, repris au tour suivant — ${message(erreur)}`);
        }
      }
    },
  };
}
