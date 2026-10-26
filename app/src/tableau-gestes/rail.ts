// Les gestes de la vue du rail d'un projet, écrits sur son tableau de la cuisine (#1694) : ceux que la grammaire des
// gestes du tableau connaît (docs/tableau-gestes.md, #1584) partent en commentaire sur l'issue du tableau, par l'accès
// GitHub de l'app (gestes.ts) — ni `ssh`, ni second, ni box jointe. La box les joue à son tick suivant et répond sous
// eux ; le rail, relu du tableau, montre ce qu'elle en a fait.
//   - la fiche d'un ticket : « merge the PR » (`merger`) → `/brigade merge #<n>`, « remove from the rail » (`retirer`)
//     → `/brigade set-aside #<n>` ;
//   - la carte de TODO : un choix → `/brigade choose #<n> <rang>`, un texte → `/brigade answer #<n> <texte>`.
// Ce que la grammaire ne connaît pas (changer la priorité, renvoyer en cuisine un ticket revenu de WAITING) n'est pas
// d'ici : `gesteDeFiche` le dit (`horsDuTableau`), et l'appelant le joue comme avant.
//
// Rien ne part pour un ticket que la dernière lecture du tableau ne porte pas — ni sur son rail, ni dans sa file —, ni
// sans tableau lu : chaque fois une phrase, et rien n'est posté.
import type { TableauLu } from "../tableau/lecture.ts";
import { gestesDuTableau, type ClientDesGestes, type DecisionDuChef, type EtatDuGeste } from "./gestes.ts";

// Les gestes de la fiche que le tableau porte, et celui de sa grammaire que chacun écrit.
export const GESTES_DE_FICHE = { merger: "merge", retirer: "set-aside" } as const satisfies Readonly<Record<string, DecisionDuChef["geste"]>>;
export type GesteDeFicheDuTableau = keyof typeof GESTES_DE_FICHE;
export const duTableau = (id: unknown): id is GesteDeFicheDuTableau => typeof id === "string" && Object.hasOwn(GESTES_DE_FICHE, id);

// Ce que la fiche reçoit (vue.js, `jouerGesteDeFiche`) : le geste posté, son commentaire au survol — ou pourquoi rien
// n'est parti. Ce que la carte de TODO reçoit (carte-todo.ts, `Rendu`) : la réponse écrite, ou le refus.
export type RenduDeFiche = { fait: string; detail: string } | { refus: string; detail: string };
export type RenduDeCarte = { repondue: true; dit: string } | { refus: string; detail: string };
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

// L'état d'un geste posté, dit dans les mots de la fiche : posté, pris, refusé — ou pas parti.
function ditDe(etat: EtatDuGeste): { fait: string; detail: string } | { refus: string; detail: string } {
  if (etat.etat === "failed") return { refus: etat.raison, detail: "" };
  if (etat.etat === "pending") return { fait: POSTE, detail: etat.commentaire.url ?? "" };
  if (etat.etat === "taken") return { fait: `taken into account by the box: ${etat.reponse}`, detail: etat.commentaire.url ?? "" };
  return { refus: `refused by the box: ${etat.reponse}`, detail: etat.commentaire.url ?? "" };
}

// Une décision postée sur le tableau de la dernière lecture, pour un ticket qu'il porte.
async function poster(lu: TableauLu | undefined, decision: DecisionDuChef, client: ClientDesGestes): Promise<{ fait: string; detail: string } | { refus: string; detail: string }> {
  if (lu === undefined) return { refus: PAS_LU, detail: "" };
  if (!ticketsDuTableau(lu).has(decision.ticket)) return { refus: `nothing was posted: #${decision.ticket} is not on the latest Kitchen board read — read it again`, detail: "" };
  return ditDe(await gestesDuTableau({ depot: lu.depot, tableau: lu.numero, client }).envoyer(decision));
}

// Un geste de la fiche d'un ticket : posté sur le tableau s'il est de sa grammaire ; `horsDuTableau` sinon — l'appelant
// le joue comme avant.
export async function gesteDeFiche(lu: TableauLu | undefined, id: unknown, ticket: unknown, client: ClientDesGestes): Promise<RenduDeFiche | { horsDuTableau: true }> {
  if (!duTableau(id)) return { horsDuTableau: true };
  if (typeof ticket !== "number" || !Number.isSafeInteger(ticket) || ticket < 1) return { refus: "nothing was posted: the action names no ticket", detail: "" };
  return poster(lu, { geste: GESTES_DE_FICHE[id], ticket }, client);
}

// La réponse du chef à une carte de TODO, déjà lue (carte-todo.ts, `reponseLue`) : son choix ou son texte, posté sur
// le tableau. Postée, la carte quitte TODO ; la box l'écrit sur l'issue à son tick suivant.
export async function reponseDeCarte(lu: TableauLu | undefined, reponse: ReponseLue, client: ClientDesGestes): Promise<RenduDeCarte> {
  const decision: DecisionDuChef = "choix" in reponse ? { geste: "choose", ticket: reponse.ticket, choix: reponse.choix } : { geste: "answer", ticket: reponse.ticket, reponse: reponse.texte };
  const dit = await poster(lu, decision, client);
  return "fait" in dit ? { repondue: true, dit: dit.fait } : dit;
}
