// WAITING : un ticket qui attend un tiers — la réponse d'un client, une
// décision externe, une réunion —, et non le chef. Le chef (ou le second) l'y
// met, en disant ce qu'il attend, de qui, et quand relancer ce tiers ; il l'en
// sort de deux façons, et rien d'autre ne l'en sort (#1834) : « reprendre »,
// il reprend l'état qu'il avait avant d'attendre ; « c'est arrivé », il repart
// en cuisine. Ni l'un ni l'autre ne passe par TODO : aucune carte ne demande
// au chef de remettre le ticket sur le rail. Sa date de relance atteinte, il
// reste en WAITING.
//
// Le socle est le 86 sans heure de retour, que le rail connaît déjà (#422) :
// la cuisine ne le prend pas, et il survit au redémarrage puisqu'il est au
// journal. WAITING l'étend d'un motif à lui (`third-party`), de ce qu'il
// attend, et de l'état d'avant l'attente — celui où « reprendre » le remet. Ce
// qui attend un tiers n'est pas dans la file du chef : il n'a rien à trancher
// tant que rien n'est arrivé.
//
// Ce qui attend un tiers reste lisible sur l'issue, l'app fermée : le label
// `waiting` tant qu'il attend, et un commentaire à chaque changement — qui,
// quoi, jusqu'à quand ; puis qu'il n'attend plus, et pourquoi.
import { PAR_LE_CHEF } from "./events/rail.ts";
import { geste } from "./geste.ts";
import type { Resultat } from "./geste-ticket.ts";
import type { GitHub } from "./github.ts";
import { dateLocale, direInstant, direInstantEn, dureeTapee } from "./instants.ts";
import type { Journal } from "./journal.ts";
import { direALArrivee, direALArriveeEn, marquesDAttente, texteDeMarque, ticketDuRail, type AttenteDeTiers, type TicketRail } from "./projections/rail.ts";
import { GesteRefuse, nomEtatEn } from "./rail.ts";

// Le label qu'une issue porte tant que son ticket attend un tiers.
export const LABEL_WAITING = "waiting";

// La relance proposée quand le chef n'en donne pas : dans sept jours.
export const RELANCE_PAR_DEFAUT_MS = 7 * 24 * 3_600_000;

const AUTEUR = "chef";

// Ce que le chef dit en mettant un ticket en attente. `relance` : quand y
// revenir — dans sept jours, sans elle.
export type MiseEnAttente = { quoi: string; qui: string; relance?: Date };

// Pourquoi un ticket ne peut pas attendre un tiers, d'après son état : seul un
// ticket que la cuisine ne tient pas le peut — en attente sur le rail, ou mis
// de côté.
const TENUS: Record<string, string> = {
  taken: "taken: a cook is working on it — set the wait before it leaves, or after it returns",
  pass: "in pass: its delivery is being judged, then merged or escalated — set the wait after",
  served: "served: it has nothing left to wait for",
};

// Lit `--remind` : une date (2026-10-21, ce jour-là à minuit, heure de la
// box), une date et une heure (2026-10-21T09:00), ou une durée à partir de
// maintenant (7j, 36h). Elle doit être à venir.
export function lireRelance(valeur: string, maintenant: Date): Date {
  const duree = dureeTapee(valeur);
  const complet = /^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:T([0-9]{2}):([0-9]{2}))?$/.exec(valeur);
  const instant =
    duree !== null
      ? new Date(maintenant.getTime() + duree)
      : complet
        ? dateLocale(Number(complet[1]), Number(complet[2]), Number(complet[3]), Number(complet[4] ?? 0), Number(complet[5] ?? 0))
        : null;
  if (instant === null || Number.isNaN(instant.getTime())) {
    throw new GesteRefuse(`--remind: “${valeur}” cannot be read — expected a date (2026-10-21), a date and a time (2026-10-21T09:00) or a duration (7j, 36h)`);
  }
  if (instant.getTime() <= maintenant.getTime()) throw new GesteRefuse(`--remind: ${valeur} has already passed — a follow-up is in the future`);
  return instant;
}

// Met le ticket en WAITING — ou, s'il y est déjà, met à jour ce qu'il attend,
// sans changer depuis quand. Rend le ticket tel que le rail le relit.
export function mettreEnAttente(journal: Journal, projet: string, ticket: number, { quoi, qui, relance }: MiseEnAttente, maintenant = new Date()): TicketRail {
  const what = quoi.trim();
  const who = qui.trim();
  if (what === "") throw new GesteRefuse("a ticket does not wait without saying what: what it waits for, in your words");
  if (who === "") throw new GesteRefuse("a ticket does not wait without saying who: the client, a team, a person");
  const followUp = relance ?? new Date(maintenant.getTime() + RELANCE_PAR_DEFAUT_MS);
  if (Number.isNaN(followUp.getTime()) || followUp.getTime() <= maintenant.getTime()) throw new GesteRefuse("the follow-up has already passed — a follow-up is in the future");
  return journal.base.transaction(() => {
    const trouve = ticketDuRail(journal.base, ticket);
    if (trouve === null) throw new GesteRefuse(`ticket ${ticket} is not on the rail — only a ticket on the rail waits for a third party`);
    const tenu = TENUS[trouve.state];
    if (tenu !== undefined) throw new GesteRefuse(`ticket ${ticket} is ${tenu}`);
    journal.ajouter({ project: projet, ticket, author: AUTEUR, type: "ticket.waiting", payload: { what, who, followUp: followUp.toISOString() } });
    return ticketDuRail(journal.base, ticket) as TicketRail;
  });
}

// « Reprendre » : le ticket n'attend plus, et reprend l'état qu'il avait avant
// d'attendre — mis de côté pour son propre motif, qui le rend seul au rail une
// fois levé ; sinon en attente sur le rail, où un cook le prend à son tour. Il
// ne passe pas par TODO (#1834) : le chef qui le reprend sait ce qu'il en fait.
export function reprendre(journal: Journal, projet: string, ticket: number): TicketRail {
  return journal.base.transaction(() => {
    exigerWaiting(journal, ticket);
    journal.ajouter({ project: projet, ticket, author: AUTEUR, type: "ticket.resumed", payload: { to: "todo", why: PAR_LE_CHEF } });
    return ticketDuRail(journal.base, ticket) as TicketRail;
  });
}

// « C'est arrivé, on repart » : le ticket repart en cuisine sans repasser par
// TODO, de WAITING. Depuis l'ordinateur comme depuis le téléphone, l'app
// retire le label `waiting` de l'issue (app/src/gestes-github.ts, #2061).
export function cestArrive(journal: Journal, projet: string, ticket: number): TicketRail {
  return journal.base.transaction(() => {
    exigerWaiting(journal, ticket);
    journal.ajouter({ project: projet, ticket, author: AUTEUR, type: "ticket.resumed", payload: { to: "kitchen", why: PAR_LE_CHEF } });
    return ticketDuRail(journal.base, ticket) as TicketRail;
  });
}

// Le prix de « c'est arrivé », dit comme celui des gestes du rail (geste-ticket.ts).
export const PRIX_DE_L_ARRIVEE = "it goes back on the rail and leaves WAITING: a cook takes it in turn and spends what a cook spends";

// « C'est arrivé », joué comme un geste du rail : fait, avec son prix, ou
// refusé — un ticket qui n'est pas sur le rail, ou qui n'attend pas un tiers —,
// et rien n'est changé.
export function renvoyerEnCuisine(journal: Journal, projet: string, ticket: number): Resultat {
  try {
    cestArrive(journal, projet, ticket);
  } catch (erreur) {
    if (erreur instanceof GesteRefuse) return { done: false, reason: erreur.message, price: "none: nothing was changed" };
    throw erreur;
  }
  return { done: true, price: PRIX_DE_L_ARRIVEE };
}

function exigerWaiting(journal: Journal, ticket: number): void {
  const trouve = ticketDuRail(journal.base, ticket);
  if (trouve === null) throw new GesteRefuse(`ticket ${ticket} is not on the rail`);
  if (trouve.waitingFor === null) throw new GesteRefuse(`ticket ${ticket} is not waiting for a third party — it is ${trouve.state === "86" ? "set aside (86)" : nomEtatEn(trouve.state)}`);
}

// Ce qu'un ticket en WAITING attend, sur une ligne : de qui, quoi, depuis
// quand, la relance, et ce qui se passera à l'arrivée.
export function direAttenteDeTiers(attente: AttenteDeTiers, depuis: (instant: string) => string): string {
  return `attend ${attente.who} : « ${attente.what} » — depuis ${depuis(attente.since)}, relance le ${direInstant(attente.followUp)} — à l'arrivée, ${attente.onArrival}`;
}

// `onArrival` se lit en français sur le rail (et dans `facts`) : sa forme
// anglaise est recalculée, pour `status` comme pour l'issue.
function alArriveeEn(attente: AttenteDeTiers): string {
  const livraison = ["open", null].find((delivery) => direALArrivee(delivery) === attente.onArrival);
  return livraison === undefined ? attente.onArrival : direALArriveeEn(livraison);
}

// La même, en anglais : la ligne du ticket dans `status`.
export function direAttenteDeTiersEn(attente: AttenteDeTiers, depuis: (instant: string) => string): string {
  const alArrivee = alArriveeEn(attente);
  return `awaiting ${attente.who}: “${attente.what}” — since ${depuis(attente.since)}, follow-up on ${direInstantEn(attente.followUp)} — on arrival, ${alArrivee}`;
}

// Le commentaire posé sur l'issue quand le ticket entre en WAITING, ou que ce
// qu'il attend change. En anglais : `what` et `who` sont les mots du chef.
export function direMarque(ticket: number, attente: AttenteDeTiers, miseAJour: boolean): string {
  return [
    `**WAITING${miseAJour ? " — updated" : ""}: awaiting ${attente.who}.** ${attente.what}`,
    "",
    `- **from whom**: ${attente.who}`,
    `- **since**: ${direInstantEn(attente.since)}`,
    `- **follow-up**: ${direInstantEn(attente.followUp)}`,
    `- **on arrival**: ${alArriveeEn(attente)}`,
    "",
    `As long as it has the \`${LABEL_WAITING}\` label, the kitchen does not take it, and its follow-up does not take it out. Removing this label sends it back to the kitchen; \`${geste(`waiting resume ${ticket}`)}\` gives it back the state it had before waiting.`,
  ].join("\n");
}

// Le commentaire posé quand le ticket quitte WAITING : où il est allé.
export function direLevee(ticket: TicketRail | null, marque: { what: string; who: string }): string {
  const ou =
    ticket === null
      ? "it left the rail"
      : ticket.state === "86"
        ? `resumed: it is set aside again for its own reason (${ticket.reason ?? "no reason"}), and starts again on its own once that is lifted`
        : ticket.state === "waiting"
          ? "it goes back to the kitchen"
          : `it is ${nomEtatEn(ticket.state)}`;
  return `**WAITING lifted** — no longer awaiting ${marque.who} (“${marque.what}”): ${ou}. The \`${LABEL_WAITING}\` label is removed.`;
}

// Met l'issue de chaque ticket à jour de son attente : le label `waiting` et un
// commentaire à l'entrée en WAITING et à chaque changement de ce qu'il attend,
// le label retiré et un commentaire à la sortie. Ce qui est posé s'écrit au
// journal (`waiting.marked`) : rien n'est redit. Un échec de GitHub se
// rattrape au réveil suivant. Rend le nombre d'issues mises à jour.
export async function marquerAttentes(journal: Journal, github: GitHub, projet: string): Promise<number> {
  let faites = 0;
  for (const { ticket, marked, waiting } of marquesDAttente(journal.base)) {
    if (texteDeMarque(marked) === texteDeMarque(waiting)) continue;
    try {
      if (waiting !== null) {
        if (marked === null) await github.labelliser(ticket, [LABEL_WAITING]);
        await github.commenter(ticket, direMarque(ticket, waiting, marked !== null));
      } else if (marked !== null) {
        await github.delabelliser(ticket, LABEL_WAITING);
        const surLeRail = ticketDuRail(journal.base, ticket);
        // Parti du rail, l'issue est fermée, n'a plus `fire` ou n'existe plus :
        // le label suffit, rien ne se commente.
        if (surLeRail !== null) await github.commenter(ticket, direLevee(surLeRail, marked));
      }
      journal.ajouter({
        project: projet,
        ticket,
        author: "runtime",
        type: "waiting.marked",
        payload: { waiting: waiting === null ? null : { what: waiting.what, who: waiting.who, followUp: waiting.followUp } },
      });
      faites++;
    } catch (erreur) {
      console.error(`brigade : attente non marquée sur le ticket #${ticket} — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }
  return faites;
}
