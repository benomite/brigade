// Les gestes de la vue du rail d'un projet, écrits sur son tableau de la cuisine (#1694) : ceux que la grammaire des
// gestes du tableau connaît (docs/tableau-gestes.md, #1584) partent en commentaire sur l'issue du tableau, par l'accès
// GitHub de l'app (gestes.ts) — ni `ssh`, ni second, ni box jointe. La box les joue à son tick suivant et répond sous
// eux ; le rail, relu du tableau, montre ce qu'elle en a fait.
//   - la fiche d'un ticket : « merge the PR » (`merger`) → `/brigade merge #<n>`, « remove from the rail » (`retirer`)
//     → `/brigade set-aside #<n>`, « back to the kitchen » (`cuisine`, un ticket revenu de WAITING) → `/brigade arrived
//     #<n>` (#1740) ;
//   - la carte de WAITING : « it arrived, back to the kitchen » → `/brigade arrived #<n>`, le même geste ;
//   - la carte de TODO : un choix → `/brigade choose #<n> <rang>`, un texte → `/brigade answer #<n> <texte>` ;
//   - la carte d'une correction proposée, de la file : « yes » ou « no » → `/brigade correction yes|no <proposition>` ;
//     celle d'un profil proposé, de même → `/brigade profile yes|no <proposition>` (#1741).
// Ce que la grammaire ne connaît pas n'est pas d'ici : `gesteDeFiche` le dit (`horsDuTableau`), et l'appelant le joue
// comme avant. Changer la priorité ne passe pas par le tableau : l'app change le label `prio:` de l'issue elle-même
// (../priorite.ts).
//
// Rien ne part pour un ticket que la dernière lecture du tableau ne porte pas — ni sur son rail, ni dans sa file —, ni
// pour une proposition qu'elle ne porte pas, ni sans tableau lu : chaque fois une phrase, et rien n'est posté.
import type { Rendu as RenduDeProposition } from "../correction.ts";
import type { TableauLu } from "../tableau/lecture.ts";
import { gestesDuTableau, jusquALaBox, type Attente, type ClientDesGestes, type DecisionDuChef, type EtatDuGeste } from "./gestes.ts";

// Les gestes de la fiche que le tableau porte, et celui de sa grammaire que chacun écrit.
export const GESTES_DE_FICHE = { merger: "merge", retirer: "set-aside", cuisine: "arrived" } as const satisfies Readonly<Record<string, DecisionDuChef["geste"]>>;
export type GesteDeFicheDuTableau = keyof typeof GESTES_DE_FICHE;
export const duTableau = (id: unknown): id is GesteDeFicheDuTableau => typeof id === "string" && Object.hasOwn(GESTES_DE_FICHE, id);

// Ce que la fiche reçoit (vue.js, `jouerGesteDeFiche`) : le geste posté, son commentaire au survol — ou pourquoi rien
// n'est parti. Ce que la carte de TODO reçoit (carte-todo.ts, `Rendu`) : la réponse écrite, ou le refus.
export type RenduDeFiche = { fait: string; detail: string } | { refus: string; detail: string };
// `commentaire` : celui que la réponse a posté sur le tableau, que la carte suit jusqu'à la réponse de la box (#1841).
export type RenduDeCarte = { repondue: true; dit: string; commentaire: number } | { refus: string; detail: string };
// Une réponse de carte déjà lue (carte-todo.ts, `reponseLue`) : le rang d'un choix, ou le texte du chef.
export type ReponseLue = { ticket: number; choix: number } | { ticket: number; texte: string };

export const POSTE = "posted on the Kitchen board — the box plays it at its next tick and answers under it";
const PAS_LU = "nothing was posted: the Kitchen board of this project has not been read yet — read it again";

// Les tickets que la dernière lecture du tableau porte : ceux de son rail (`faits.rail`), de sa file, et ceux qui
// attendent le chef (`faits.attend`).
export function ticketsDuTableau(lu: Pick<TableauLu, "file" | "faits">): Set<number> {
  const tickets = (liste: unknown): number[] =>
    Array.isArray(liste) ? liste.flatMap((entree: unknown) => (typeof entree === "object" && entree !== null && typeof (entree as { ticket?: unknown }).ticket === "number" ? [(entree as { ticket: number }).ticket] : [])) : [];
  return new Set([...tickets(lu.faits?.rail), ...tickets(lu.faits?.attend), ...lu.file.flatMap(({ ticket }) => (ticket === null ? [] : [ticket]))]);
}

// L'état d'un geste posté, dit dans les mots de la fiche : posté, pris, refusé — ou pas parti. Posté, son commentaire.
type Dit = { fait: string; detail: string; commentaire: number } | { refus: string; detail: string };
function ditDe(etat: EtatDuGeste): Dit {
  if (etat.etat === "failed") return { refus: etat.raison, detail: "" };
  if (etat.etat === "pending") return { fait: POSTE, detail: etat.commentaire.url ?? "", commentaire: etat.commentaire.id };
  if (etat.etat === "taken") return { fait: `taken into account by the box: ${etat.reponse}`, detail: etat.commentaire.url ?? "", commentaire: etat.commentaire.id };
  return { refus: `refused by the box: ${etat.reponse}`, detail: etat.commentaire.url ?? "" };
}

// Une décision postée sur le tableau de la dernière lecture, pour un ticket qu'il porte.
async function poster(lu: TableauLu | undefined, decision: Extract<DecisionDuChef, { ticket: number }>, client: ClientDesGestes): Promise<Dit> {
  if (lu === undefined) return { refus: PAS_LU, detail: "" };
  if (!ticketsDuTableau(lu).has(decision.ticket)) return { refus: `nothing was posted: #${decision.ticket} is not on the latest Kitchen board read — read it again`, detail: "" };
  return ditDe(await gestesDuTableau({ depot: lu.depot, tableau: lu.numero, client }).envoyer(decision));
}

// Les propositions de la file que la dernière lecture du tableau porte, par leur numéro : `faits.corrections` pour une
// correction, `faits.profils` pour un profil.
export function propositionsDuTableau(lu: Pick<TableauLu, "faits">, geste: "correction" | "profile"): Set<number> {
  const liste: unknown = lu.faits?.[geste === "correction" ? "corrections" : "profils"];
  return new Set(
    Array.isArray(liste)
      ? liste.flatMap((entree: unknown) => (typeof entree === "object" && entree !== null && typeof (entree as { proposition?: unknown }).proposition === "number" ? [(entree as { proposition: number }).proposition] : []))
      : [],
  );
}

export const PAS_COMPRIS = "nothing was posted: the app only knows “yes” and “no”";

// Le « yes » ou le « no » du chef sur une correction ou un profil proposés de la file (correction.ts, profil.ts),
// posté sur le tableau pour une proposition que sa dernière lecture porte. Posté, la carte le dit, son commentaire au
// survol ; la box le tranche à son tick suivant (runtime/src/correctif/decision.ts, runtime/src/profils/decision.ts), et
// la carte quitte la file à la lecture du tableau qui ne la porte plus.
export async function reponseALaFile(lu: TableauLu | undefined, geste: "correction" | "profile", proposition: unknown, reponse: unknown, client: ClientDesGestes): Promise<RenduDeProposition> {
  if (reponse !== "yes" && reponse !== "no") return { refus: PAS_COMPRIS, detail: "" };
  if (lu === undefined) return { refus: PAS_LU, detail: "" };
  const nom = geste === "correction" ? "correction" : "profile";
  if (typeof proposition !== "number" || !propositionsDuTableau(lu, geste).has(proposition)) {
    return { refus: `nothing was posted: this ${nom} is not on the latest Kitchen board read — it was answered elsewhere, or set aside`, detail: "" };
  }
  const dit = ditDe(await gestesDuTableau({ depot: lu.depot, tableau: lu.numero, client }).envoyer({ geste, proposition, reponse }));
  return "fait" in dit ? { postee: reponse, dit: dit.fait, detail: dit.detail } : dit;
}

// Un geste de la fiche que le tableau porte, posté pour ce ticket.
async function decider(lu: TableauLu | undefined, id: GesteDeFicheDuTableau, ticket: unknown, client: ClientDesGestes): Promise<RenduDeFiche> {
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket < 1) return { refus: "nothing was posted: the action names no ticket", detail: "" };
  const dit = await poster(lu, { geste: GESTES_DE_FICHE[id], ticket }, client);
  return "fait" in dit ? { fait: dit.fait, detail: dit.detail } : dit;
}

// Un geste de la fiche d'un ticket : posté sur le tableau s'il est de sa grammaire ; `horsDuTableau` sinon — l'appelant
// le joue comme avant.
export async function gesteDeFiche(lu: TableauLu | undefined, id: unknown, ticket: unknown, client: ClientDesGestes): Promise<RenduDeFiche | { horsDuTableau: true }> {
  return duTableau(id) ? decider(lu, id, ticket, client) : { horsDuTableau: true };
}

// « It arrived, back to the kitchen », sur une carte de WAITING : le geste `cuisine` de la fiche, posté de même.
export const arriveeDeCarte = (lu: TableauLu | undefined, ticket: unknown, client: ClientDesGestes): Promise<RenduDeFiche> => decider(lu, "cuisine", ticket, client);

// La réponse du chef à une carte de TODO, déjà lue (carte-todo.ts, `reponseLue`) : son choix ou son texte, posté sur
// le tableau. Postée, la carte quitte TODO ; la box l'écrit sur l'issue à son tick suivant.
export async function reponseDeCarte(lu: TableauLu | undefined, reponse: ReponseLue, client: ClientDesGestes): Promise<RenduDeCarte> {
  const decision: DecisionDuChef = "choix" in reponse ? { geste: "choose", ticket: reponse.ticket, choix: reponse.choix } : { geste: "answer", ticket: reponse.ticket, reponse: reponse.texte };
  const dit = await poster(lu, decision, client);
  return "fait" in dit ? { repondue: true, dit: dit.fait, commentaire: dit.commentaire } : dit;
}

// Un geste qui partait par `ssh` sur la box (#1845) — le plafond, la cuisine d'une station, le commentaire d'une carte,
// la demande au second —, posté sur le dernier tableau lu du projet et suivi jusqu'à ce que la box l'ait joué ou
// refusé, le temps de l'attente. Rien ne part sans tableau lu. Les écrans le disent dans leurs mots (plafond.ts,
// cuisson.ts, discussion.ts).
export async function jouerAuTableau(lu: TableauLu | undefined, decision: DecisionDuChef, client: ClientDesGestes, attente: Attente): Promise<EtatDuGeste> {
  if (lu === undefined) return { etat: "failed", raison: "The Kitchen board of this project has not been read yet — read it again." };
  const gestes = gestesDuTableau({ depot: lu.depot, tableau: lu.numero, client });
  return jusquALaBox(gestes, await gestes.envoyer(decision), attente);
}
