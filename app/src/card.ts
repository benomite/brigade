// L'en-tête de la fiche d'un ticket — ce qui s'ouvre par-dessus le rail quand le chef clique
// sa carte, quelle que soit sa colonne : son titre entier, sa priorité, son issue et sa PR.
// Rien n'y est deviné : chaque ligne est ce que la box a donné, ou, dans les mots de l'app,
// pourquoi elle ne l'a pas donné — jamais une valeur mise à la place, jamais une ligne vide.
// Son numéro, la carte le porte : la box le donne toujours.
import { priority } from "./slip.ts";

// Ce que la box en dit — `exact` : ce qui se recopie tel quel —, ou pourquoi elle n'en dit rien.
export type Line = { valeur: string; exact?: true } | { sans: string };
// `issue`, `pr` : `true`, la box en a donné une adresse qui s'ouvre d'un clic — c'est le process
// principal qui la tient, la vue nomme le ticket. `attendu` : pour un ticket qui attend le chef,
// ce qu'on attend de lui, en une phrase — posée en tête de la fiche.
export type Header = { titre: Line; priorite: Line; issue: true | Line; pr?: true | Line; attendu?: string };

// D'où se compose l'en-tête d'un ticket. `titre` : celui que la box donne — absent ou vide, elle
// n'en donne pas. `url` : l'adresse de son issue — nulle ou absente, elle n'en a rendu aucune.
// `pr` : sa PR mergée, d'après `livres` — nulle, il a été servi sans merge ; absente, la box ne
// la donne pas pour ce ticket, et la fiche n'a pas de ligne PR. `rail` : son état et son titre sur le rail de `faits`, qui bornent
// sa ligne de `status` — absents, il n'y est pas. `lignes` : les siennes sous la ligne `rail` de
// `status` — absentes, cette ligne n'a pas été lue. `prio` : la priorité que la box donne elle-même,
// d'une issue qui n'est pas sur le rail (upstream.ts) — nulle, son issue n'en porte pas ; absente, elle
// se lit dans la ligne du ticket.
export type Source = { titre?: string; url?: string | null; pr?: string | null; rail?: { etat: string; titre: string }; lignes?: readonly string[]; prio?: number | null };

const NOT_HTTPS = "the address the station returned is not https: the app does not open it";
const WITHOUT_TITLE: Line = { sans: "not given — the station returns no title for this ticket" };
const WITHOUT_ISSUE: Line = { sans: "not given — the station returns no address for this issue" };
const NO_PR: Line = { valeur: "none — served without a merge" };
const NO_PRIORITY: Line = { valeur: "none — its issue carries no `prio:` label" };
const PRIORITY_NOT_READ: Line = { sans: "not given — `facts` does not give it, and the `rail` line of `status` was not read" };
const PRIORITY_WITHOUT_LINE: Line = { sans: "not given — `facts` does not give it, and `status` writes no line for this ticket under `rail`" };
const PRIORITY_UNREADABLE: Line = { sans: "not given — `facts` does not give it, and the app does not read it in what `status` writes about this ticket" };

// Seule une adresse https s'ouvre, comme sur la carte.
const address = (url: string): true | Line => (URL.parse(url)?.protocol === "https:" ? true : { sans: NOT_HTTPS });

// La priorité, telle que la box la donne — ou que la ligne du ticket l'écrit : `faits` ne la donne pas.
function priorityOf({ rail, lignes: lines, prio }: Source): Line {
  if (prio !== undefined) return prio === null ? NO_PRIORITY : { valeur: `prio:${prio}`, exact: true };
  if (lines === undefined) return PRIORITY_NOT_READ;
  if (rail === undefined || lines.length === 0) return PRIORITY_WITHOUT_LINE;
  // Un ticket n'a qu'une ligne sur le rail : deux ne disent pas laquelle croire.
  const [line] = lines;
  const readEntry = lines.length === 1 && line !== undefined ? priority(line, rail.etat, rail.titre) : undefined;
  if (readEntry === undefined) return PRIORITY_UNREADABLE;
  return readEntry === "-" ? NO_PRIORITY : { valeur: readEntry, exact: true };
}

export function header(source: Source): Header {
  const { titre: title, url, pr } = source;
  return {
    titre: title === undefined || title === "" ? WITHOUT_TITLE : { valeur: title },
    priorite: priorityOf(source),
    issue: url == null ? WITHOUT_ISSUE : address(url),
    // Pas de PR donnée : la ligne n'existe pas, rien n'est affiché à sa place.
    ...(pr === undefined ? {} : { pr: pr === null ? NO_PR : address(pr) }),
  };
}
