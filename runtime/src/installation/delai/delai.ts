// Le temps qu'un projet met à servir son premier ticket (#1401, épique #1393) :
// de son ajout à la station au premier ticket servi du chef — le ticket qui
// prépare le dépôt (`preparation-depot/`) n'est pas le sien, comme dans
// l'onboarding (`onboarding/lire.ts`).
//
// L'ajout s'écrit au journal du projet, une fois (`project.added`, clé
// d'unicité) : l'instant est celui de l'événement. Le premier ticket servi se
// lit du journal — le premier `ticket.served` après lui — donc un deuxième
// ticket servi ne change rien. La durée, une fois le premier ticket servi, est
// figée : c'est l'écart exact entre les deux instants. Tant qu'aucun n'est
// servi, la station ne donne que l'instant d'ajout ; c'est l'app qui compte le
// temps qui court. Un projet d'avant cet événement n'a pas de délai.
import { mkdirSync } from "node:fs";
import type { Base } from "../../base.ts";
import { ouvrirJournal, type Journal } from "../../journal.ts";
import { lirePreparation } from "../../preparation-depot/ouvrir.ts";

// Ce que la station publie d'un projet : `ajouteLe` (instant ISO), `serviLe`
// (l'instant du premier ticket servi, ou null) et `duree` (millisecondes, null
// tant qu'aucun ticket n'est servi).
export type Delai = { ajouteLe: string; serviLe: string | null; duree: number | null };

const CLE = "project.added";

// Note l'ajout du projet, une fois. Rend vrai s'il vient d'être écrit ; un projet déjà servi n'est pas neuf, rien ne s'écrit.
export function noterLAjout(repertoireEtat: string, projet: string, auteur: string, maintenant?: () => Date): boolean {
  mkdirSync(repertoireEtat, { recursive: true });
  const journal: Journal = ouvrirJournal(repertoireEtat, maintenant === undefined ? {} : { maintenant });
  try {
    // Un projet déjà servi avant que l'ajout se note n'est plus neuf : il n'a pas de délai à compter.
    const dejaServi = journal.base.lire<{ combien: number }>("SELECT count(*) AS combien FROM events WHERE type = 'ticket.served' AND ticket IS NOT NULL AND ticket IS NOT ?", lirePreparation(repertoireEtat)?.ticket ?? null)[0]?.combien ?? 0;
    if (dejaServi > 0) return false;
    return journal.ajouter({ project: projet, ticket: null, author: auteur, type: "project.added", payload: {}, dedupKey: CLE }) !== null;
  } finally {
    journal.fermer();
  }
}

// Le délai d'après un journal ouvert. `preparation` : le ticket qui prépare le dépôt, qui ne compte pas.
export function delaiDuJournal(base: Base, preparation: number | null): Delai | null {
  const ajout = base.lire<{ at: string }>("SELECT at FROM events WHERE type = 'project.added' ORDER BY seq LIMIT 1")[0];
  if (ajout === undefined) return null;
  const servi = base.lire<{ at: string }>(
    "SELECT at FROM events WHERE type = 'ticket.served' AND ticket IS NOT NULL AND ticket IS NOT ? AND seq > (SELECT seq FROM events WHERE type = 'project.added' ORDER BY seq LIMIT 1) ORDER BY seq LIMIT 1",
    preparation,
  )[0];
  if (servi === undefined) return { ajouteLe: ajout.at, serviLe: null, duree: null };
  return { ajouteLe: ajout.at, serviLe: servi.at, duree: Math.max(0, Date.parse(servi.at) - Date.parse(ajout.at)) };
}

// Le délai d'un projet, lu dans son répertoire d'état en lecture seule : la
// cuisine qui y écrit n'est pas dérangée. Sans journal, ou illisible, aucun.
export function lireDelai(repertoireEtat: string): Delai | null {
  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch {
    return null;
  }
  try {
    return delaiDuJournal(journal.base, lirePreparation(repertoireEtat)?.ticket ?? null);
  } catch {
    return null;
  } finally {
    journal.fermer();
  }
}
