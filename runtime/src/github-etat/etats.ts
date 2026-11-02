// L'état d'un ticket, lu sur GitHub seul (spec
// `docs/superpowers/specs/2026-11-02-github-only-state.md`) : deux stations
// qui lisent la même issue, la même PR et le même statut de la base disent le
// même état, sans boîte, sans relais, sans journal.
//
// D'où vient chaque état :
//
// | État       | Lu sur                                                         |
// |------------|----------------------------------------------------------------|
// | `waiting`  | le label `waiting` — il l'emporte sur tout autre               |
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

// Les labels qui portent un état sur l'issue.
export const LABEL_TAKEN = "taken";
export const LABEL_IN_PASS = "in-pass";
export const LABEL_WAITING = "waiting";

export type EtatDuTicket = "taken" | "pass" | "waiting" | "base-red";

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
  if (labels.has(LABEL_WAITING)) return "waiting";
  if (labels.has(LABEL_IN_PASS)) {
    const aJuger = issue.pr !== null && issue.pr.state === "open" && !issue.pr.merged;
    if (!aJuger) return null;
    return base === "red" ? "base-red" : "pass";
  }
  if (labels.has(LABEL_TAKEN)) return "taken";
  return null;
}
