// Un worktree que la station n'a pas pu préparer, tel que le journal du projet
// le porte : la raison, dans les mots de git, l'heure du prochain essai, et
// l'accès au dépôt refusé, quand c'est lui — avec le geste qui le lève. C'est
// ce que la station publie du projet à l'app (`projets/tenir.ts`, `worktree`) :
// le terminal de lancement n'est plus le seul à le dire (#1115).
//
// L'échec tient jusqu'à ce qu'un worktree se prépare de nouveau
// (`worktree.prepared`) ; chaque essai raté le remplace par le sien, avec sa
// nouvelle heure.
import type { Base } from "./base.ts";
import type { AccesRefuse } from "./events/rail.ts";
import { ouvrirJournal } from "./journal.ts";
import type { AccesBloque } from "./projets/acces.ts";

export const WORKTREE_IMPOSSIBLE = "worktree-failed";

// En français, comme le reste du suivi ; `acces` est celui de `projets/acces.ts`.
export type EchecDuWorktree = {
  // Le ticket dont le worktree n'a pas pu être préparé.
  ticket: number;
  raison: string;
  // L'heure du prochain essai, ISO ; null si le journal ne la dit pas.
  prochainEssai: string | null;
  acces?: AccesBloque;
};

const enSuivi = (acces: AccesRefuse): AccesBloque => ({ bloque: acces.blocked, raison: acces.reason, geste: acces.gesture });

// L'échec en cours, ou null : aucun, ou un worktree s'est préparé depuis.
export function echecDuWorktree(base: Base): EchecDuWorktree | null {
  const dernier = base.lire<{ type: string; ticket: number | null; payload: string }>(
    "SELECT type, ticket, payload FROM events WHERE type = 'worktree.prepared' OR (type = 'ticket.86' AND json_extract(payload, '$.reason') = ?) ORDER BY seq DESC LIMIT 1",
    WORKTREE_IMPOSSIBLE,
  )[0];
  if (dernier === undefined || dernier.type !== "ticket.86" || dernier.ticket === null) return null;
  const { until, why, access } = JSON.parse(dernier.payload) as { until?: string | null; why?: string; access?: AccesRefuse };
  return {
    ticket: dernier.ticket,
    // Un fait d'avant la raison : il ne dit que le motif.
    raison: typeof why === "string" && why !== "" ? why : "the worktree could not be prepared",
    prochainEssai: until ?? null,
    ...(access === undefined ? {} : { acces: enSuivi(access) }),
  };
}

// Le même, lu dans le répertoire d'état d'un projet, en lecture seule : la
// cuisine qui y écrit n'est pas dérangée. Sans journal, ou illisible, rien.
export function lireEchecDuWorktree(repertoireEtat: string): EchecDuWorktree | null {
  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch {
    return null;
  }
  try {
    return echecDuWorktree(journal.base);
  } catch {
    return null;
  } finally {
    journal.fermer();
  }
}
