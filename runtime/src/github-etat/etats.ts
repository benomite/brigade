// L'état d'un ticket, lu sur GitHub seul (épique #2053) :
// deux stations
// qui lisent la même issue, la même PR et le même statut de la base disent le
// même état, sans boîte, sans relais, sans journal.
//
// D'où vient chaque état :
//
// | État       | Lu sur                                                         |
// |------------|----------------------------------------------------------------|
// | `parked`   | le label `parked` (ou un label d'attente d'avant parked) — il  |
// |            | l'emporte sur tout autre : aucune station ne prend un ticket   |
// |            | parqué                                                         |
// | `base-red` | le label `in-pass`, sa PR ouverte, le dernier commit de la     |
// |            | base rouge                                                     |
// | `pass`     | le label `in-pass` et sa PR ouverte, la base n'étant pas rouge |
// | `taken`    | le label `taken`                                               |
//
// La base rouge n'a pas de label : c'est le statut des checks du dernier
// commit de la branche d'intégration. Elle ne touche que ce qui est en pass —
// une livraison qui attend la base pour être jugée et mergée.
//
// Rien ne se devine : une issue fermée, une issue sans aucun de ces labels, ou
// un `in-pass` sans PR ouverte à juger n'ont pas d'état (null).
import type { Check } from "../events/pass.ts";
import type { Issue, PR } from "../github.ts";
import { LABEL_PARKED } from "../attente-github/marque.ts";

// Les labels qui portent un état sur l'issue.
export const LABEL_TAKEN = "taken";
export const LABEL_IN_PASS = "in-pass";
// Le label d'une carte de TODO : le ticket est parqué pour le chef (#4129). Il vaut `parked`.
export const CHEF_TODO = "chef-todo";
export { LABEL_PARKED };

// Les labels d'attente d'avant parked (#4260, règle 13 de docs/superpowers/specs/2026-11-24-simplified-process.md) :
// WAITING, la mise de côté pour échecs, `blocked-on-human`, `decision`, `question` et `product-question`. Plus rien ne
// les pose, et c'est la seule liste qui les nomme : une issue qui en porte encore un est parquée — rien ne la prend —
// jusqu'à ce qu'on le lui retire. `waiting` se renomme `parked` à l'installation des labels (etiquettes.ts).
// Ceux d'entre eux qui attendaient le chef : leur pose, dans l'histoire d'une issue, est une question qu'il a eue.
export const LABELS_D_AVANT_PARKED_POUR_LE_CHEF: readonly string[] = ["blocked-on-human", "decision", "question", "product-question"];
export const LABELS_D_AVANT_PARKED: readonly string[] = ["waiting", "set-aside:failures", ...LABELS_D_AVANT_PARKED_POUR_LE_CHEF];
// Ceux que le TODO de l'app liste chacun par son label (app/src/board/wait-of-chef.ts) : `product-question` venait avec
// la carte de sa question, et l'app ne l'a jamais lu ainsi — une liste de plus à chaque lecture coûte au budget GitHub de
// l'app (app/test/budget-github.test.ts).
export const LABELS_D_AVANT_PARKED_SANS_CARTE: readonly string[] = LABELS_D_AVANT_PARKED_POUR_LE_CHEF.filter((label) => label !== "product-question");

// Le ticket est-il parqué ? Le label `parked`, une carte du chef (`chef-todo`, parqué pour lui), ou un label d'avant.
export const estParque = (labels: readonly string[]): boolean => [LABEL_PARKED, CHEF_TODO, ...LABELS_D_AVANT_PARKED].some((label) => labels.includes(label));

export type EtatDuTicket = "taken" | "pass" | "parked" | "base-red";

// Le statut du dernier commit de la base, d'après ses checks. `pending` : un
// check court encore, aucun n'est rouge.
export type EtatDeLaBase = "green" | "red" | "pending";

// Ce que l'état lit d'une issue : ses labels, et la PR qui livre son ticket,
// ou null s'il n'en a pas.
export type IssueLue = Pick<Issue, "state" | "labels"> & { pr: Pick<PR, "state" | "merged"> | null };

// Rouge dès qu'un check l'est ; en cours dès qu'un court encore ; vert si tous
// le sont ; null sans aucun check — rien ne dit alors qu'elle soit rouge.
export function etatDeLaBase(checks: Pick<Check, "outcome">[]): EtatDeLaBase | null {
  if (checks.length === 0) return null;
  if (checks.some(({ outcome }) => outcome === "red")) return "red";
  if (checks.some(({ outcome }) => outcome === "pending")) return "pending";
  return "green";
}

// `base` : le statut du dernier commit de la base, null s'il n'est pas connu —
// une base inconnue n'est pas rouge.
export function etatDuTicket(issue: IssueLue, base: EtatDeLaBase | null = null): EtatDuTicket | null {
  if (issue.state !== "open") return null;
  const labels = new Set(issue.labels);
  // Parqué pour le chef (`chef-todo`), il garde son état : la pass lit sa réponse sur une carte de validation (#3184).
  if (labels.has(LABEL_PARKED) || LABELS_D_AVANT_PARKED.some((label) => labels.has(label))) return "parked";
  if (labels.has(LABEL_IN_PASS)) {
    const aJuger = issue.pr !== null && issue.pr.state === "open" && !issue.pr.merged;
    if (!aJuger) return null;
    return base === "red" ? "base-red" : "pass";
  }
  if (labels.has(LABEL_TAKEN)) return "taken";
  return null;
}
