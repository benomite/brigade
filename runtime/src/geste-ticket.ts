// Les gestes du chef sur un ticket du rail, depuis la fiche de l'app : le
// retirer du rail, changer sa priorité. Ni l'un ni l'autre ne s'écrit d'abord
// au journal : le rail se lit de GitHub (label `fire`, label `prio:<n>`), et un
// fait posé sans le label serait défait au sondage suivant. Le geste pose donc
// le label, puis écrit au journal le fait que le sondage y aurait écrit — la
// fiche relit le ticket sans attendre le tick.
//
// Un geste dit toujours son prix (`price`), refusé comme accompli : le chef le
// lit avant d'agir, et l'app l'affiche après.
import type { GitHub } from "./github.ts";
import { LABEL } from "./github.ts";
import type { Journal } from "./journal.ts";
import { nomEtat } from "./rail.ts";
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

export const PRIORITE_MIN = 1;
export const PRIORITE_MAX = 9;

// Retire un ticket en attente — retenu ou non — du rail : son label `fire` est
// retiré de l'issue, il ne repart pas. Un ticket pris, en pass, servi ou 86 est
// refusé, et rien n'est modifié.
export async function retirerDuRail(journal: Journal, github: GitHub, projet: string, ticket: number): Promise<Resultat> {
  const courant = ticketDuRail(journal.base, ticket);
  if (!courant) return refuse(`#${ticket} is not on the rail`);
  if (courant.state !== "waiting") return refuse(dansLEtat(ticket, nomEtat(courant.state), courant.state === "taken" || courant.state === "pass"));
  await github.delabelliser(ticket, LABEL);
  // Pris entre-temps : le label est retiré, et le sondage en rendra compte.
  if (ticketDuRail(journal.base, ticket)?.state === "waiting") {
    journal.ajouter({ project: projet, ticket, author: AUTEUR, type: "ticket.left", payload: { reason: "unfired" } });
  }
  return { done: true, price: `the ticket leaves the rail and is not cooked; its issue stays open and loses its \`${LABEL}\` label — put it back to bring the ticket back on the rail. Nothing is lost, nothing is spent` };
}

// Change la priorité d'un ticket, quel que soit son état : le label `prio:<n>`
// de l'issue est remplacé. `priorite` : un entier de 1 à 9, ou null pour retirer
// la priorité — le ticket passe alors après les autres.
export async function changerPriorite(journal: Journal, github: GitHub, projet: string, ticket: number, priorite: unknown): Promise<Resultat> {
  if (priorite !== null && !(Number.isInteger(priorite) && (priorite as number) >= PRIORITE_MIN && (priorite as number) <= PRIORITE_MAX)) {
    return refuse(`priority ${JSON.stringify(priorite) ?? String(priorite)} is not valid: expected a whole number from ${PRIORITE_MIN} to ${PRIORITE_MAX} (1 is served first), or null for none`);
  }
  const niveau = priorite as number | null;
  const courant = ticketDuRail(journal.base, ticket);
  if (!courant) return refuse(`#${ticket} is not on the rail`);
  const issue = await github.issue(ticket);
  if (!issue) return refuse(`the issue of #${ticket} is gone from GitHub`);
  const voulu = niveau === null ? null : `prio:${niveau}`;
  const anciens = issue.labels.filter((label) => /^prio:[0-9]$/.test(label) && label !== voulu);
  if (voulu !== null && !issue.labels.includes(voulu)) await github.labelliser(ticket, [voulu]);
  for (const ancien of anciens) await github.delabelliser(ticket, ancien);
  const apres = ticketDuRail(journal.base, ticket);
  if (apres && apres.priority !== niveau) {
    journal.ajouter({
      project: projet,
      ticket,
      author: AUTEUR,
      type: "ticket.changed",
      payload: { title: apres.title, priority: niveau, model: apres.model, effort: apres.effort, card: apres.card },
    });
  }
  return { done: true, price: "none: only the order of service changes; no cook is launched or interrupted, and nothing is spent" };
}
