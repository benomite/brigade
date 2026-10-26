// Pourquoi un ticket est mis de côté (86), dit en clair : la raison que le chef
// lit, et celle que l'app montre sous le ticket. Une cause qui se répète d'un
// ticket à l'autre n'est pas celle d'un ticket : elle bloque le projet.
import { ATTEND_UN_TIERS, REVENU_D_ATTENTE, STATION_ABSENTE, SANS_STATION } from "./events/rail.ts";

// Les causes qui, répétées à l'identique sur le projet, le bloquent : aucune
// ne dépend du ticket, donc les autres tickets échoueraient de la même façon.
// `geste` : ce que le chef y fait. Le setup a son propre blocage (il porte
// aussi des hôtes refusés) ; le quota, la connexion et le refus ont les leurs.
// `text` et `action` : les mêmes, en anglais, pour le bloc `awaiting` de `status`.
export const CAUSES_DU_PROJET: Record<string, { texte: string; geste: string; text: string; action: string }> = {
  "worktree-failed": {
    texte: "le worktree ne se prépare pas",
    geste: "regarder le dépôt de la box (disque, droits, remote, branche d'intégration)",
    text: "the worktree cannot be prepared",
    action: "look at the box's repository (disk, permissions, remote, integration branch)",
  },
  "ticket-unreadable": {
    texte: "les tickets ne se lisent pas sur GitHub",
    geste: "vérifier l'accès de la box à GitHub (jeton, réseau, droits sur le dépôt)",
    text: "the tickets cannot be read on GitHub",
    action: "check the box's access to GitHub (token, network, rights on the repository)",
  },
  "secrets-unavailable": {
    texte: "les secrets que le dépôt déclare ne peuvent pas être donnés au cook",
    geste: "poser les valeurs manquantes (le détail est sur l'issue du ticket)",
    text: "the secrets the repository declares cannot be given to the cook",
    action: "set the missing values (the details are on the ticket's issue)",
  },
};

const RAISONS: Record<string, string> = {
  quota: "attend : quota du compte épuisé",
  disconnected: "attend : connexion Max expirée",
  refused: "attend : le modèle a refusé de répondre",
  "setup-failed": "attend : setup du projet impossible",
  "worktree-failed": "attend : worktree impossible à préparer",
  "ticket-unreadable": "attend : ticket illisible sur GitHub",
  "secrets-unavailable": "attend : secrets du projet indisponibles",
  "unreadable-card": "attend : fiche du ticket illisible",
  "no-calibration": "attend : calibrage (modèle, effort) absent de l'issue",
  "pass:unjudged": "attend : la pass n'a pas pu le juger",
  "pass:still-red": "attend : la pass le trouve encore rouge",
  [ATTEND_UN_TIERS]: "attend : un tiers (WAITING)",
  [REVENU_D_ATTENTE]: "attend : le chef — revenu de WAITING",
};

// La raison d'un ticket 86, en clair, à partir du motif écrit au rail.
export function direMiseDeCote(motif: string | null): string {
  if (motif === null || motif === "") return "attend : mis de côté, sans motif";
  const connue = RAISONS[motif];
  if (connue !== undefined) return connue;
  if (motif.startsWith(`${SANS_STATION}: `)) return `attend : un humain — aucune station ne fournit ${motif.slice(SANS_STATION.length + 2)}, il ne repartira pas seul`;
  if (motif.startsWith(`${STATION_ABSENTE}: `)) return `attend : station absente (${motif.slice(STATION_ABSENTE.length + 2)})`;
  return `attend : mis de côté (${motif})`;
}
