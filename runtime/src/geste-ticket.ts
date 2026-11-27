// Le geste du chef sur un ticket du rail : le retirer du rail. Merger une
// livraison se fait sur sa PR, sur GitHub : plus aucun geste de la box ne le fait.
// Le retrait ne s'écrit pas d'abord au journal : le rail se lit de GitHub
// (label `fire`), et un fait posé sans le label serait défait au sondage
// suivant. Le geste retire donc le label, puis écrit au journal le fait que le
// sondage y aurait écrit — la fiche relit le ticket sans attendre le tick. Changer la priorité n'est pas un geste de la box :
// l'app change elle-même le label `prio:` de l'issue sur GitHub
// (app/src/priorite.ts), et le sondage le lit comme tout label.
//
// Un geste dit toujours son prix (`price`), refusé comme accompli : le chef le
// lit avant d'agir, et l'app l'affiche après.
import type { GitHub } from "./github.ts";
import { LABEL } from "./github.ts";
import type { Journal } from "./journal.ts";
import { nomEtatEn } from "./rail.ts";
import { ticketDuRail } from "./projections/rail.ts";

const AUTEUR = "chef";

export type Resultat = { done: true; price: string } | { done: false; reason: string; price: string };

const RIEN_TOUCHE = "none: nothing was changed";

const refuse = (reason: string): Resultat => ({ done: false, reason, price: RIEN_TOUCHE });

// Ce qu'un geste refuse sur un ticket qui n'est pas en attente : on ne touche
// pas à un ticket en cours.
const dansLEtat = (ticket: number, etat: string, enCours: boolean): string =>
  enCours
    ? `#${ticket} is ${etat}: a ticket in progress is not touched — wait for its cook or its review to end`
    : `#${ticket} is ${etat}: the gesture does not apply`;

// Retire du rail un ticket en attente — retenu ou non — ou mis de côté (86) :
// son label `fire` est retiré de l'issue, il ne repart pas. Un ticket pris, en
// pass ou servi est refusé, et rien n'est modifié : la pass ne s'écrit plus au
// journal, la box n'y lit plus d'attente du chef.
export async function retirerDuRail(journal: Journal, github: GitHub, projet: string, ticket: number): Promise<Resultat> {
  const courant = ticketDuRail(journal.base, ticket);
  if (!courant) return refuse(`#${ticket} is not on the rail`);
  const retirable = courant.state === "waiting" || courant.state === "86";
  if (!retirable) return refuse(dansLEtat(ticket, nomEtatEn(courant.state), courant.state === "taken" || courant.state === "pass"));
  await github.delabelliser(ticket, LABEL);
  // Pris entre-temps : le label est retiré, et le sondage en rendra compte.
  if (ticketDuRail(journal.base, ticket)?.state === courant.state) {
    journal.ajouter({ project: projet, ticket, author: AUTEUR, type: "ticket.left", payload: { reason: "unfired" } });
  }
  return { done: true, price: `the ticket leaves the rail and is not cooked; its issue stays open and loses its \`${LABEL}\` label — put it back to bring the ticket back on the rail. Nothing is lost, nothing is spent` };
}
