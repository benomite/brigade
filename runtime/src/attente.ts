// WAITING : un ticket qui attend un tiers — la réponse d'un client, une
// décision externe, une réunion —, et non le chef. Le chef l'y met, en disant
// ce qu'il attend, de qui, et quand y revenir ; il l'en sort de deux façons :
// « reprendre », il revient devant lui (TODO) ; « c'est arrivé », il repart en
// cuisine sans repasser par TODO.
//
// Le socle est le 86 sans heure de retour, que le rail connaît déjà (#422) :
// la cuisine ne le prend pas, rien ne le fait repartir seul, et il survit au
// redémarrage puisqu'il est au journal. WAITING l'étend d'un motif à lui
// (`third-party`), de ce qu'il attend, et de l'état d'avant l'attente — celui
// où « reprendre » le remet. Ce qui attend un tiers sort de la file du chef :
// il n'a rien à trancher tant que rien n'est arrivé.
//
// Ce qui attend un tiers reste lisible sur l'issue, l'app fermée : le label
// `waiting` tant qu'il attend, et un commentaire à chaque changement — qui,
// quoi, jusqu'à quand ; puis qu'il n'attend plus, et pourquoi.
import { NOUVEAU_SUR_L_ISSUE, PAR_LE_CHEF, REVENU_D_ATTENTE } from "./events/rail.ts";
import { geste } from "./geste.ts";
import type { GitHub } from "./github.ts";
import { dateLocale, direInstant, direInstantEn, dureeTapee } from "./grant.ts";
import type { Journal } from "./journal.ts";
import { DE_LA_BRIGADE } from "./reviewer.ts";
import { commentairesEntendus, direALArrivee, direALArriveeEn, lireRail, marquesDAttente, texteDeMarque, ticketDuRail, type AttenteDeTiers, type TicketRail } from "./projections/rail.ts";
import { GesteRefuse, nomEtat, nomEtatEn } from "./rail.ts";

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

// WAITING → TODO : le ticket revient devant le chef, tout de suite — dans
// l'état où il était avant d'attendre s'il était mis de côté, sinon mis de
// côté pour lui.
export function reprendre(journal: Journal, projet: string, ticket: number): TicketRail {
  return journal.base.transaction(() => {
    exigerWaiting(journal, ticket);
    journal.ajouter({ project: projet, ticket, author: AUTEUR, type: "ticket.resumed", payload: { to: "todo", why: PAR_LE_CHEF } });
    return ticketDuRail(journal.base, ticket) as TicketRail;
  });
}

// « C'est arrivé, on repart » : le ticket repart en cuisine sans repasser par
// TODO — de WAITING, ou revenu de WAITING devant le chef.
export function cestArrive(journal: Journal, projet: string, ticket: number): TicketRail {
  return journal.base.transaction(() => {
    const trouve = ticketDuRail(journal.base, ticket);
    if (!(trouve?.state === "86" && trouve.reason === REVENU_D_ATTENTE)) exigerWaiting(journal, ticket);
    journal.ajouter({ project: projet, ticket, author: AUTEUR, type: "ticket.resumed", payload: { to: "kitchen", why: PAR_LE_CHEF } });
    return ticketDuRail(journal.base, ticket) as TicketRail;
  });
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

// La même, en anglais : la ligne du ticket dans `status`.
export function direAttenteDeTiersEn(attente: AttenteDeTiers, depuis: (instant: string) => string): string {
  // `onArrival` se lit en français sur le rail (et dans `facts`) : sa forme anglaise est recalculée.
  const livraison = ["open", null].find((delivery) => direALArrivee(delivery) === attente.onArrival);
  const alArrivee = livraison === undefined ? attente.onArrival : direALArriveeEn(livraison);
  return `awaiting ${attente.who}: “${attente.what}” — since ${depuis(attente.since)}, follow-up on ${direInstantEn(attente.followUp)} — on arrival, ${alArrivee}`;
}

// Le commentaire posé sur l'issue quand le ticket entre en WAITING, ou que ce
// qu'il attend change.
export function direMarque(ticket: number, attente: AttenteDeTiers, miseAJour: boolean): string {
  return [
    `**WAITING${miseAJour ? " — mis à jour" : ""} : en attente de ${attente.who}.** ${attente.what}`,
    "",
    `- **de qui** : ${attente.who}`,
    `- **depuis** : ${direInstant(attente.since)}`,
    `- **relance** : ${direInstant(attente.followUp)}`,
    `- **à l'arrivée** : ${attente.onArrival}`,
    "",
    `Tant qu'il porte le label \`${LABEL_WAITING}\`, la cuisine ne le prend pas. \`${geste(`waiting resume ${ticket}`)}\` le ramène dans TODO ; \`${geste(`waiting arrived ${ticket}`)}\` le renvoie en cuisine.`,
  ].join("\n");
}

// Le commentaire posé quand le ticket quitte WAITING : où il est allé.
export function direLevee(ticket: TicketRail | null, marque: { what: string; who: string }): string {
  const ou =
    ticket === null
      ? "il a quitté le rail"
      : ticket.state === "86"
        ? "repris : il revient dans TODO, devant le chef"
        : ticket.state === "waiting"
          ? "c'est arrivé : il repart en cuisine"
          : `il est ${nomEtat(ticket.state)}`;
  return `**WAITING levé** — n'attend plus ${marque.who} (« ${marque.what} ») : ${ou}. Le label \`${LABEL_WAITING}\` est retiré.`;
}

// Ce que la brigade écrit sur une issue : ses commentaires ne ramènent jamais
// un ticket de WAITING. Reconnus à leur début, comme partout — un commentaire
// du chef qui colle une réponse n'en porte aucun.
const DE_LA_BRIGADE_SUR_L_ISSUE = /^(<!-- brigade:|\*\*(WAITING|Rail|Cook|Station|Pass|Reviewer|Manager)\b)/;
export const deLaBrigade = (corps: string): boolean => DE_LA_BRIGADE_SUR_L_ISSUE.test(corps) || DE_LA_BRIGADE.test(corps);

// WAITING → TODO sur un nouveau commentaire : un ticket marqué (sa trace est
// sur l'issue, avec le décompte des commentaires hors brigade qu'elle portait)
// dont l'issue en porte davantage revient devant le chef, motif « nouveau sur
// l'issue ». Un échec de GitHub se rattrape au réveil suivant. Rend le nombre
// de tickets ramenés.
export async function ramenerSurNouveau(journal: Journal, github: GitHub, projet: string): Promise<number> {
  const entendus = commentairesEntendus(journal.base);
  let ramenes = 0;
  for (const lu of lireRail(journal.base)) {
    const vus = entendus.get(lu.ticket);
    if (lu.waitingFor === null || vus === undefined) continue;
    try {
      const autres = (await github.commentaires(lu.ticket)).filter((commentaire) => !deLaBrigade(commentaire.body));
      if (autres.length <= vus) continue;
      // De qui : les auteurs de ce qui est arrivé depuis la mise en attente.
      const auteurs = [...new Set(autres.slice(vus).map((commentaire) => commentaire.author).filter((auteur) => auteur !== ""))];
      const motif = auteurs.length === 0 ? NOUVEAU_SUR_L_ISSUE : `${NOUVEAU_SUR_L_ISSUE} — de ${auteurs.join(", ")}`;
      journal.base.transaction(() => {
        // Relu : le chef a pu le reprendre pendant que GitHub répondait.
        if (ticketDuRail(journal.base, lu.ticket)?.waitingFor == null) return;
        journal.ajouter({ project: projet, ticket: lu.ticket, author: "runtime", type: "ticket.resumed", payload: { to: "todo", why: motif } });
        ramenes++;
      });
    } catch (erreur) {
      console.error(`brigade : commentaires non lus sur le ticket #${lu.ticket} — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }
  return ramenes;
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
      // Ce que l'issue porte de hors brigade à cette pose — trace comprise,
      // qui n'en est pas — est ce que le ticket a déjà entendu.
      const heard = waiting !== null && marked === null ? (await github.commentaires(ticket)).filter((commentaire) => !deLaBrigade(commentaire.body)).length : undefined;
      journal.ajouter({
        project: projet,
        ticket,
        author: "runtime",
        type: "waiting.marked",
        payload: { waiting: waiting === null ? null : { what: waiting.what, who: waiting.who, followUp: waiting.followUp }, ...(heard === undefined ? {} : { heard }) },
      });
      faites++;
    } catch (erreur) {
      console.error(`brigade : attente non marquée sur le ticket #${ticket} — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }
  return faites;
}
