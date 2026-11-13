// Les tickets `fire` qu'aucun manager n'a pris, lus sur GitHub (#3358) : la
// même lecture pour l'app (vue/rail/github.ts, qui lui passe les issues qu'elle
// a déjà lues) et pour `brigade <project> status` (`status.ts`).
//
// Pour chaque issue ouverte au label `fire` — ni PR, ni épique dont le corps
// liste les tickets, ni le tableau de la cuisine — dont les labels ne disent pas
// déjà qu'un manager l'a prise (`rail-bloque.ts`) : ses commentaires, pour une
// prise ou un jugement du manager ; puis ses événements, pour l'instant où
// `fire` lui a été posé — à défaut, son ouverture.
//
// `lire` rend la réponse de GitHub à un chemin, ou lève : une lecture qui
// échoue fait échouer le tout, jamais un rail dit calme à sa place.
import { porteListe } from "../epique.ts";
import { prisDApresSesLabels, prisParUnManager, type TicketNonPris } from "./rail-bloque.ts";

const LABEL_FIRE = "fire";
// Le tableau de la cuisine : une issue `fire` qui n'est pas un ticket (app/src/tableau/mise-de-cote-github.ts).
const LABEL_DU_TABLEAU = "kitchen-board";
const PAR_PAGE = 100;
const PAGES_AU_PLUS = 10;

type Brut = Record<string, unknown>;
const objet = (valeur: unknown): Brut | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null);
const listeDe = (valeur: unknown): Brut[] => (Array.isArray(valeur) ? valeur.flatMap((un: unknown) => { const o = objet(un); return o === null ? [] : [o]; }) : []);
const texte = (valeur: unknown): string => (typeof valeur === "string" ? valeur : "");

export type Lire = (chemin: string) => Promise<unknown>;

// Le chemin des issues `fire`, page par page — celui que l'app lit déjà (vue/rail/github.ts) : une relecture
// conditionnelle ne coûte rien.
const cheminDesFeux = (depot: string, page: number) => `/repos/${depot}/issues?state=open&labels=${LABEL_FIRE}&sort=created&direction=asc&per_page=${PAR_PAGE}&page=${page}`;

export async function lesFeux(depot: string, lire: Lire): Promise<Brut[]> {
  const issues: Brut[] = [];
  for (let page = 1; page <= PAGES_AU_PLUS; page++) {
    const brute = await lire(cheminDesFeux(depot, page));
    if (!Array.isArray(brute)) throw new Error("GitHub did not answer the list of `fire` issues with a list");
    const lues = listeDe(brute);
    issues.push(...lues);
    if (brute.length < PAR_PAGE) break;
  }
  return issues;
}

// L'instant du dernier `fire` posé, d'après les événements de l'issue ; null s'ils ne le disent pas.
export function feuPoseLe(evenements: readonly Brut[]): string | null {
  const poses = evenements.filter((evenement) => evenement.event === "labeled" && objet(evenement.label)?.name === LABEL_FIRE).map((evenement) => texte(evenement.created_at));
  return poses.filter((instant) => !Number.isNaN(Date.parse(instant))).at(-1) ?? null;
}

// Les tickets non pris, dans l'ordre des issues. `issues` : les issues `fire` déjà lues ; absentes, elles se lisent.
export async function lireLesNonPris(options: { depot: string; lire: Lire; issues?: readonly unknown[] }): Promise<TicketNonPris[]> {
  const { depot, lire } = options;
  const issues = options.issues === undefined ? await lesFeux(depot, lire) : listeDe(options.issues);
  const nonPris: TicketNonPris[] = [];
  for (const issue of issues) {
    if (issue.pull_request !== undefined || typeof issue.number !== "number") continue;
    const labels = listeDe(issue.labels).flatMap(({ name }) => (typeof name === "string" ? [name] : []));
    if (!labels.includes(LABEL_FIRE) || labels.includes(LABEL_DU_TABLEAU) || porteListe(texte(issue.body)) || prisDApresSesLabels(labels)) continue;
    const brutes = await lire(`/repos/${depot}/issues/${issue.number}/comments?per_page=${PAR_PAGE}`);
    if (!Array.isArray(brutes)) throw new Error(`GitHub did not answer the comments of #${issue.number} with a list`);
    const commentaires = listeDe(brutes).map((commentaire) => ({ body: texte(commentaire.body), association: texte(commentaire.author_association) }));
    if (prisParUnManager(labels, commentaires)) continue;
    const evenements = await lire(`/repos/${depot}/issues/${issue.number}/events?per_page=${PAR_PAGE}`);
    if (!Array.isArray(evenements)) throw new Error(`GitHub did not answer the events of #${issue.number} with a list`);
    const depuis = feuPoseLe(listeDe(evenements)) ?? texte(issue.created_at);
    if (Number.isNaN(Date.parse(depuis))) throw new Error(`GitHub did not say when #${issue.number} was put on the rail`);
    nonPris.push({ ticket: issue.number, depuis });
  }
  return nonPris;
}
