// Les gestes du chef sur un ticket du rail, depuis la fiche de l'app : le
// retirer du rail, changer sa priorité, le déplacer avant ou après un autre
// ticket (l'ordre manuel, qui prime sur l'âge dans une priorité), merger la livraison que la file lui
// demande de merger à la main, la renvoyer à un cook, ou dire pourquoi il a
// corrigé une livraison — ces deux-là font de sa raison une leçon candidate
// (`apprentissage/renvoi.ts`). Les deux premiers ne s'écrivent pas d'abord
// au journal : le rail se lit de GitHub (label `fire`, label `prio:<n>`), et un
// fait posé sans le label serait défait au sondage suivant. Le geste pose donc
// le label, puis écrit au journal le fait que le sondage y aurait écrit — la
// fiche relit le ticket sans attendre le tick. Le merge non plus : la pass le
// constate à son tour suivant, comme tout merge à la main, et sert le ticket.
//
// Un geste dit toujours son prix (`price`), refusé comme accompli : le chef le
// lit avant d'agir, et l'app l'affiche après.
import { noterLeRenvoi } from "./apprentissage/renvoi.ts";
import { LECON_MAX_CARACTERES } from "./apprentissage/retro.ts";
import { attentesDuChef } from "./attend.ts";
import type { GitHub } from "./github.ts";
import { LABEL } from "./github.ts";
import type { Journal } from "./journal.ts";
import { EN_PAUSE_POUR_LE_RENOMMAGE, mergeRetenu } from "./pause/pause.ts";
import { nomEtatEn } from "./rail.ts";
import { passDuTicket } from "./projections/pass.ts";
import { lireRail, ticketDuRail } from "./projections/rail.ts";

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

// Ce que la file dit que ce ticket attend du chef, s'il l'attend (attend.ts).
const attenteDuTicket = (journal: Journal, ticket: number) => attentesDuChef(journal.base, lireRail(journal.base)).find((attente) => attente.ticket === ticket);

// Retire du rail un ticket en attente — retenu ou non —, mis de côté (86), ou
// que la file dit attendre le chef — une livraison verte non mergée, une PR
// fermée sans merge : son label `fire` est retiré de l'issue, il ne repart pas.
// Un ticket pris, en pass sans attendre le chef, ou servi est refusé, et rien
// n'est modifié.
export async function retirerDuRail(journal: Journal, github: GitHub, projet: string, ticket: number): Promise<Resultat> {
  const courant = ticketDuRail(journal.base, ticket);
  if (!courant) return refuse(`#${ticket} is not on the rail`);
  const retirable = courant.state === "waiting" || courant.state === "86" || (courant.state === "pass" && attenteDuTicket(journal, ticket) !== undefined);
  if (!retirable) return refuse(dansLEtat(ticket, nomEtatEn(courant.state), courant.state === "taken" || courant.state === "pass"));
  await github.delabelliser(ticket, LABEL);
  // Pris entre-temps : le label est retiré, et le sondage en rendra compte.
  if (ticketDuRail(journal.base, ticket)?.state === courant.state) {
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

// Où le chef place un ticket : juste avant un autre, ou juste après.
export type Place = { before: number } | { after: number };

// Le chemin par lequel `de` attend `vers` — `de`, les tickets intermédiaires,
// `vers` —, de proche en proche parmi ce que les tickets du rail attendent
// encore ; null s'il ne l'attend pas.
function cheminDAttente(attentes: Map<number, number[]>, de: number, vers: number): number[] | null {
  const chemins: number[][] = [[de]];
  const vus = new Set<number>([de]);
  for (const chemin of chemins) {
    for (const suivant of attentes.get(chemin.at(-1) ?? de) ?? []) {
      if (suivant === vers) return [...chemin, vers];
      if (vus.has(suivant)) continue;
      vus.add(suivant);
      chemins.push([...chemin, suivant]);
    }
  }
  return null;
}

// Ce qui refuse un déplacement : il ferait passer un ticket devant un ticket
// qu'il attend, directement ou par une chaîne. Une phrase, qui nomme
// l'attendu ; null si rien ne s'y oppose. Seul ce que le déplacement inverse
// compte : un ticket déjà servi avant ce qu'il attend — par sa priorité — le
// reste sans refus, le rail ne le prête de toute façon qu'après.
function attenteContrariee(attentes: Map<number, number[]>, avant: number[], apres: number[], ticket: number): string | null {
  const devant = (ordre: number[], a: number, b: number) => ordre.indexOf(a) < ordre.indexOf(b);
  const par = (chemin: number[]) => (chemin.length > 2 ? ` through ${chemin.slice(1, -1).map((n) => `#${n}`).join(", ")}` : "");
  for (const autre of avant) {
    if (autre === ticket) continue;
    const attendu = cheminDAttente(attentes, ticket, autre);
    if (attendu && devant(avant, autre, ticket) && devant(apres, ticket, autre)) {
      return `#${ticket} awaits #${autre}${par(attendu)}, so it cannot be placed before it`;
    }
    const attendant = cheminDAttente(attentes, autre, ticket);
    if (attendant && devant(avant, ticket, autre) && devant(apres, autre, ticket)) {
      return `#${autre} awaits #${ticket}${par(attendant)}, so #${ticket} cannot be placed after it`;
    }
  }
  return null;
}

// L'ordre `ordre` où `ticket` est retiré puis remis juste avant ou juste
// après `place`.
function placer(ordre: number[], ticket: number, place: Place): number[] {
  const sans = ordre.filter((numero) => numero !== ticket);
  const repere = "before" in place ? place.before : place.after;
  const indice = sans.indexOf(repere) + ("before" in place ? 0 : 1);
  return [...sans.slice(0, indice), ticket, ...sans.slice(indice)];
}

// Déplace un ticket en attente juste avant ou juste après un autre ticket en
// attente : dans leur priorité, l'ordre du chef prime sur l'âge. Si l'autre a
// une autre priorité, le ticket prend la sienne — le label `prio:<n>` de son
// issue est remplacé, comme par `changerPriorite` — et se place à côté de
// lui. Un déplacement qui le ferait passer devant un ticket qu'il attend, ou
// derrière un ticket qui l'attend, est refusé, et rien n'est touché.
// L'ordre s'écrit au journal (`ticket.moved`) : il survit au redémarrage.
export async function deplacerSurLeRail(journal: Journal, github: GitHub, projet: string, ticket: number, place: Place): Promise<Resultat> {
  const repere = "before" in place ? place.before : place.after;
  if (repere === ticket) return refuse(`#${ticket} cannot be placed next to itself`);
  const rail = lireRail(journal.base);
  const courant = rail.find((t) => t.ticket === ticket);
  const voisin = rail.find((t) => t.ticket === repere);
  for (const [numero, present] of [[ticket, courant], [repere, voisin]] as const) {
    if (!present) return refuse(`#${numero} is not on the rail`);
    if (present.state !== "waiting") return refuse(`#${numero} is ${nomEtatEn(present.state)}: only a queued ticket is moved, or placed against`);
  }
  if (!courant || !voisin) return refuse(`#${ticket} is not on the rail`);
  const attentes = new Map(rail.map((t) => [t.ticket, t.awaits.map((a) => a.ticket)]));
  const avant = rail.map((t) => t.ticket);
  const contrariee = attenteContrariee(attentes, avant, placer(avant, ticket, place), ticket);
  if (contrariee !== null) return refuse(contrariee);

  const priorite = voisin.priority;
  const changee = courant.priority !== priorite;
  if (changee) {
    const resultat = await changerPriorite(journal, github, projet, ticket, priorite);
    if (!resultat.done) return resultat;
  }
  return journal.base.transaction((): Resultat => {
    const dansLaPriorite = lireRail(journal.base)
      .filter((t) => t.priority === priorite)
      .map((t) => t.ticket);
    if (!dansLaPriorite.includes(repere) || !dansLaPriorite.includes(ticket)) return refuse(`#${repere} left the rail or changed priority meanwhile: place #${ticket} again`);
    journal.ajouter({ project: projet, ticket, author: AUTEUR, type: "ticket.moved", payload: { priority: priorite, order: placer(dansLaPriorite, ticket, place) } });
    return {
      done: true,
      price: changee
        ? `its issue's label becomes ${priorite === null ? "no priority" : `prio:${priorite}`}, that of #${repere}; only the order of service changes otherwise: no cook is launched or interrupted, and nothing is spent`
        : "none: only the order of service changes; no cook is launched or interrupted, and nothing is spent",
    };
  });
}

// Merge la livraison d'un ticket que la file demande de merger à la main — une
// livraison verte que la pass ne merge pas elle-même, ou une remontée qui a sa
// PR (attend.ts, `merge` et `remontee`) —, à la tête que sa PR porte sur GitHub.
// Rien n'est écrit au journal : la pass constate le merge à son tour suivant et
// sert le ticket, comme pour tout merge à la main. Une livraison que la pass
// tient encore, une PR fermée ou déjà mergée, un refus de GitHub, la cuisine
// en pause pour le renommage du code : rien n'est mergé, et la raison est dite.
export async function mergerLaLivraison(journal: Journal, github: GitHub, ticket: number): Promise<Resultat> {
  const pause = mergeRetenu(journal.base, ticket);
  if (pause !== null) return refuse(`${EN_PAUSE_POUR_LE_RENOMMAGE} since ${pause.agreedAt}: no other merge until it ends — merge it once the pause is over`);
  const attente = attenteDuTicket(journal, ticket);
  const livraison = passDuTicket(journal.base, ticket);
  const aMerger = attente !== undefined && (attente.quoi === "merge" || attente.quoi === "remontee") && attente.pr !== null;
  if (!aMerger || livraison === null || livraison.branch === null) return refuse(`#${ticket} has no delivery waiting for you to merge it`);
  const pr = await github.prDeBranche(livraison.branch);
  if (pr === null) return refuse(`GitHub has no PR for the branch of #${ticket} (${livraison.branch})`);
  if (pr.merged) return refuse(`${pr.url} is already merged — the pass sees it at its next tick`);
  if (pr.state !== "open") return refuse(`${pr.url} is closed: reopen it on GitHub to merge it`);
  const merge = await github.merger(pr.number, pr.sha);
  if (!merge.fait) return refuse(`GitHub refused the merge of ${pr.url}: ${merge.motif}`);
  return { done: true, price: `${pr.url} is merged into ${pr.base}, under the box's GitHub account; the pass sees it at its next tick and serves the ticket. A merge is not undone from here` };
}

// Le motif du retour au rail d'une livraison que le chef renvoie.
export const RENVOI_DU_CHEF = "chef-sent-back";

// Ce que le cook renvoyé lit, quand le chef n'a pas dit pourquoi.
export const RENVOI_SANS_RAISON = "Le chef a renvoyé cette livraison sans dire pourquoi : relis l'issue du ticket et sa PR, il y dit ce qu'il attend.";

// La raison du chef, d'une ligne, ses blancs resserrés ; nulle si vide.
// Plus longue qu'une leçon, elle est refusée — elle n'est pas coupée : ce sont
// ses mots.
const raisonDuChef = (raison: string | null): { texte: string | null } | { refus: string } => {
  const texte = (raison ?? "").replace(/\s+/g, " ").trim();
  if (texte === "") return { texte: null };
  if (texte.length > LECON_MAX_CARACTERES) return { refus: `the reason is ${texte.length} characters long: a lesson holds at most ${LECON_MAX_CARACTERES} — say it shorter` };
  return { texte };
};

// Renvoie à un cook la livraison d'un ticket que la file dit attendre le chef
// — verte et non mergée, ou remontée avec sa PR (attend.ts, `merge` et
// `remontee`) —, comme la pass renvoie une livraison rouge : un cook repart sur
// sa branche, et lit la raison du chef à la place des findings. Ce renvoi
// compte parmi ceux du ticket. Avec une raison, elle devient une leçon
// candidate du projet, d'origine `chef-correction #<ticket>` ; sans raison,
// aucune. Rien ne part vers GitHub.
export function renvoyerLaLivraison(journal: Journal, projet: string, ticket: number, raison: string | null): Resultat {
  const lue = raisonDuChef(raison);
  if ("refus" in lue) return refuse(lue.refus);
  return journal.base.transaction((): Resultat => {
    const courant = ticketDuRail(journal.base, ticket);
    if (!courant) return refuse(`#${ticket} is not on the rail`);
    const attente = attenteDuTicket(journal, ticket);
    const livraison = passDuTicket(journal.base, ticket);
    const aRenvoyer = attente !== undefined && (attente.quoi === "merge" || attente.quoi === "remontee") && (courant.state === "pass" || courant.state === "86");
    if (!aRenvoyer || livraison === null || livraison.branch === null) return refuse(`#${ticket} has no delivery waiting for you: only a delivery the pass holds for you — green and not merged, or escalated — is sent back`);
    const commun = { project: projet, ticket, author: AUTEUR } as const;
    journal.ajouter({ ...commun, type: "pass.returned", payload: { n: livraison.returns + 1, findings: [lue.texte === null ? RENVOI_SANS_RAISON : `Le chef a renvoyé cette livraison : ${lue.texte}`] } });
    const lecons = noterLeRenvoi(journal, { projet, ticket, auteur: AUTEUR, origine: "chef-correction", raisons: lue.texte === null ? [] : [lue.texte] });
    journal.ajouter({ ...commun, type: "ticket.released", payload: { reason: RENVOI_DU_CHEF, station: courant.station } });
    return {
      done: true,
      price: `a cook is launched again on ${livraison.branch}, on the project's quota, and its delivery goes back through the pass${livraison.pr ? `; ${livraison.pr} stays open` : ""}. ${lecons === 0 ? "No reason given: no lesson is drawn from it" : "Your reason becomes a candidate lesson of the project"}`,
    };
  });
}

// Le chef a corrigé la livraison d'un ticket — à la main, sur sa branche ou
// après son merge — et dit pourquoi : sa raison devient une leçon candidate
// du projet, d'origine `chef-correction #<ticket>`. Le ticket doit avoir été
// livré au moins une fois ; rien d'autre ne change, rien ne part vers GitHub.
// Sans raison, il n'y a rien à apprendre : refusé.
export function corrigerLaLivraison(journal: Journal, projet: string, ticket: number, raison: string | null): Resultat {
  const lue = raisonDuChef(raison);
  if ("refus" in lue) return refuse(lue.refus);
  if (lue.texte === null) return refuse("a correction says what was wrong: give its reason — it is what the next cooks learn");
  const texte = lue.texte;
  return journal.base.transaction((): Resultat => {
    const livre = journal.duTicket(ticket).some((evenement) => evenement.project === projet && evenement.type === "ticket.passing");
    if (!livre) return refuse(`#${ticket} has never been delivered: there is no delivery to correct`);
    noterLeRenvoi(journal, { projet, ticket, auteur: AUTEUR, origine: "chef-correction", raisons: [texte] });
    return { done: true, price: "none: your reason becomes a candidate lesson of the project, given to the next cooks; no cook is launched, and nothing is spent" };
  });
}
