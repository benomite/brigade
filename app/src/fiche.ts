// L'en-tête de la fiche d'un ticket — ce qui s'ouvre par-dessus le rail quand le chef clique
// sa carte, quelle que soit sa colonne : son titre entier, sa priorité, son issue et sa PR.
// Rien n'y est deviné : chaque ligne est ce que la box a donné, ou, dans les mots de l'app,
// pourquoi elle ne l'a pas donné — jamais une valeur mise à la place, jamais une ligne vide.
// Son numéro, la carte le porte : la box le donne toujours.
import { priorite } from "./bon.ts";

// Ce que la box en dit — `exact` : ce qui se recopie tel quel —, ou pourquoi elle n'en dit rien.
export type Ligne = { valeur: string; exact?: true } | { sans: string };
// `issue`, `pr` : `true`, la box en a donné une adresse qui s'ouvre d'un clic — c'est le process
// principal qui la tient, la vue nomme le ticket.
export type Entete = { titre: Ligne; priorite: Ligne; issue: true | Ligne; pr: true | Ligne };

// D'où se compose l'en-tête d'un ticket. `titre` : celui que la box donne — absent ou vide, elle
// n'en donne pas. `url` : l'adresse de son issue — nulle ou absente, elle n'en a rendu aucune.
// `pr` : sa PR mergée, d'après `livres` — nulle, il a été servi sans merge ; absente, la box ne
// la donne pas pour ce ticket. `rail` : son état et son titre sur le rail de `faits`, qui bornent
// sa ligne de `status` — absents, il n'y est pas. `lignes` : les siennes sous la ligne `rail` de
// `status` — absentes, cette ligne n'a pas été lue.
export type Source = { titre?: string; url?: string | null; pr?: string | null; rail?: { etat: string; titre: string }; lignes?: readonly string[] };

const PAS_HTTPS = "the address the box returned is not https: the app does not open it";
const SANS_TITRE: Ligne = { sans: "not given — the box returns no title for this ticket" };
const SANS_ISSUE: Ligne = { sans: "not given — the box returns no address for this issue" };
const SANS_PR: Ligne = { sans: "not given — the box only gives the PR of a served ticket" };
const AUCUNE_PR: Ligne = { valeur: "none — served without a merge" };
const AUCUNE_PRIORITE: Ligne = { valeur: "none — its issue carries no `prio:` label" };
const PRIORITE_PAS_LUE: Ligne = { sans: "not given — `facts` does not give it, and the `rail` line of `status` was not read" };
const PRIORITE_SANS_LIGNE: Ligne = { sans: "not given — `facts` does not give it, and `status` writes no line for this ticket under `rail`" };
const PRIORITE_ILLISIBLE: Ligne = { sans: "not given — `facts` does not give it, and the app does not read it in what `status` writes about this ticket" };

// Seule une adresse https s'ouvre, comme sur la carte.
const adresse = (url: string): true | Ligne => (URL.parse(url)?.protocol === "https:" ? true : { sans: PAS_HTTPS });

// La priorité, telle que la ligne du ticket l'écrit : `faits` ne la donne pas.
function prioriteDe({ rail, lignes }: Source): Ligne {
  if (lignes === undefined) return PRIORITE_PAS_LUE;
  if (rail === undefined || lignes.length === 0) return PRIORITE_SANS_LIGNE;
  // Un ticket n'a qu'une ligne sur le rail : deux ne disent pas laquelle croire.
  const [ligne] = lignes;
  const lue = lignes.length === 1 && ligne !== undefined ? priorite(ligne, rail.etat, rail.titre) : undefined;
  if (lue === undefined) return PRIORITE_ILLISIBLE;
  return lue === "-" ? AUCUNE_PRIORITE : { valeur: lue, exact: true };
}

export function entete(source: Source): Entete {
  const { titre, url, pr } = source;
  return {
    titre: titre === undefined || titre === "" ? SANS_TITRE : { valeur: titre },
    priorite: prioriteDe(source),
    issue: url == null ? SANS_ISSUE : adresse(url),
    pr: pr === undefined ? SANS_PR : pr === null ? AUCUNE_PR : adresse(pr),
  };
}
