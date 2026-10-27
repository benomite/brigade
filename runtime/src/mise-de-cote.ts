// Pourquoi un ticket est mis de côté (86), dit en clair : la raison que le chef
// lit, et celle que l'app montre sous le ticket. Une cause qui se répète d'un
// ticket à l'autre n'est pas celle d'un ticket : elle bloque le projet.
import { manqueDuMotif } from "./capacites.ts";
import { ATTEND_UN_TIERS, REDECOUPE, STATION_ABSENTE, SANS_STATION } from "./events/rail.ts";

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
  refused: "attend : le modèle l'a refusé trois fois — un cook le reprend un jour plus tard",
  "setup-failed": "attend : setup du projet impossible",
  "worktree-failed": "attend : worktree impossible à préparer",
  "ticket-unreadable": "attend : ticket illisible sur GitHub",
  "secrets-unavailable": "attend : secrets du projet indisponibles",
  "unreadable-card": "attend : fiche du ticket illisible — il repart seul dès qu'elle se lit",
  "no-calibration": "attend : calibrage (modèle, effort) absent de l'issue — il repart seul dès qu'il y est",
  "pass:unjudged": "attend : la pass n'a pas pu le juger",
  "pass:still-red": "attend : la pass le trouve encore rouge",
  [ATTEND_UN_TIERS]: "attend : un tiers (WAITING)",
};

// La raison d'un ticket 86, en clair, à partir du motif écrit au rail.
export function direMiseDeCote(motif: string | null): string {
  if (motif === null || motif === "") return "attend : mis de côté, sans motif";
  const connue = RAISONS[motif];
  if (connue !== undefined) return connue;
  if (motif.startsWith(`${SANS_STATION}: `)) return `attend : un humain — aucune station ne fournit ${motif.slice(SANS_STATION.length + 2)} ; brancher une station qui le fournit, le ticket repart alors tout seul`;
  if (motif.startsWith(`${STATION_ABSENTE}: `)) return `attend : station absente (${motif.slice(STATION_ABSENTE.length + 2)}) — il repart seul dès qu'elle se manifeste`;
  return `attend : mis de côté (${motif})`;
}

// Un ticket mis de côté faute de station attend une action que le chef ne fait pas par un bouton : brancher une
// station au projet. Il se lit donc en WAITING (1752), avec ce qu'il attend dit en toutes lettres. Ce n'est pas
// un WAITING que le chef a posé : le ticket reste 86 au rail, sans relance ni geste, et repart seul quand une
// station fournit la capacité. Nul pour tout autre motif.
export type AttenteDUneStation = { quoi: string; qui: string; aLArrivee: string };
export function attenteDUneStation(motif: string | null): AttenteDUneStation | null {
  const manque = manqueDuMotif(motif);
  if (manque === null) return null;
  const noms = manque.capacites.join(manque.ensemble ? " + " : ", ");
  return {
    quoi: `a station that provides ${noms}${manque.ensemble ? " together" : ""} — attach one to the project`,
    qui: "a human, the chef",
    aLArrivee: "the ticket goes back on the rail by itself once a station provides it",
  };
}

// Ce qui met un ticket de côté (86), qui le fait, et ce qui l'en sort seul
// (#1834). Le chef n'a rien mis de côté : il ne sait pas mieux que la cuisine
// quand la raison est tombée. Aucune de ces raisons ne fait donc entrer le
// ticket dans TODO, et aucune carte ne demande de le remettre sur le rail ou de
// l'en sortir : il reste sur le rail, avec sa raison (`direMiseDeCote`), et y
// revient seul. `par` : qui le met de côté ; `retour` : ce qui le remet sur le
// rail, sans personne ; `heure` : la mise de côté porte une heure de retour,
// que le rail tient (`relever`). Les motifs qu'un préfixe ouvre
// (`no-station: …`, `station-absent: …`) y sont par leur préfixe. Un test
// confronte cette liste aux motifs que le runtime écrit.
export type MiseDeCote = { par: string; retour: string; heure?: true };
export const MISES_DE_COTE: Readonly<Record<string, MiseDeCote>> = {
  "no-calibration": {
    par: "the station, when the issue carries no `model:` and `effort:`",
    retour: "the calibration on the issue — the manager sets it on what it puts on the rail: the station rereads the labels at every service and puts the ticket back",
  },
  "unreadable-card": { par: "the station, when the ticket's card cannot be read", retour: "the card read again: the station rereads it at every service and puts the ticket back" },
  refused: { par: "the station, after three refusals in a row by the model", retour: "its return time, a day later: a new cook tries again — sooner if `fire` is removed and set again", heure: true },
  [SANS_STATION]: {
    par: "the station, when no declared station provides what the card requires",
    retour: "a station that provides it — declared, or the card no longer requiring it: the station rereads both at every service; the manager tries first to rewrite the ticket without it",
  },
  [STATION_ABSENTE]: { par: "the station, when only remote stations that have not shown up lately can cook it", retour: "one of those stations showing up: the station puts the ticket back at once" },
  [ATTEND_UN_TIERS]: {
    par: "the chef or the second (WAITING), never the kitchen",
    retour: "`arrived`, on the Kitchen board, once what it waits for is there; its follow-up date leaves it in WAITING",
  },
  quota: { par: "the station, when the account's quota is used up", retour: "its return time: when the quota comes back, or an hour later", heure: true },
  "setup-failed": { par: "the station, when the project's setup fails", retour: "its return time, or the integration branch moving", heure: true },
  "worktree-failed": { par: "the station, when the worktree cannot be prepared", retour: "its return time, ten minutes later", heure: true },
  "ticket-unreadable": { par: "the station, when the ticket cannot be read on GitHub", retour: "its return time, ten minutes later", heure: true },
  "secrets-unavailable": { par: "the station, when the secrets the repository declares cannot be given", retour: "its return time, ten minutes later", heure: true },
  "pass:unjudged": {
    par: "the pass, when it could not judge the delivery",
    retour:
      "the kitchen taking it over (remontee-a-la-cuisine.ts): sent back to a cook, or waiting for its `fix` ticket, then sent back — but for secrets the repository declares and the machine does not have, which only the chef sets (`CAUSES_DU_CHEF`)",
  },
  "pass:still-red": { par: "the pass, when the delivery is still red after its returns", retour: "the kitchen taking it over (remontee-a-la-cuisine.ts): waiting for its `fix` ticket, then sent back to a cook" },
  "manager:escalated": { par: "the manager, when the delivery is still red after its returns", retour: "the kitchen taking it over, like the pass's: its `fix` ticket served, it goes back to a cook" },
  [REDECOUPE]: { par: "the manager, when it splits the ticket again", retour: "nothing: its sub-tickets carry the work, and it leaves the rail once they are served" },
};

// La mise de côté d'un motif, par le motif lui-même ou par son préfixe. Nulle
// pour un motif que la liste ne connaît pas.
export function miseDeCoteDu(motif: string | null): MiseDeCote | null {
  if (motif === null) return null;
  const cle = Object.hasOwn(MISES_DE_COTE, motif) ? motif : (motif.split(": ")[0] ?? "");
  return Object.hasOwn(MISES_DE_COTE, cle) ? (MISES_DE_COTE[cle] ?? null) : null;
}

// Ce qui retient un ticket sur le rail sans le mettre de côté : un ticket que
// sa fiche attend (`attend : #12`). Il ne va pas non plus dans TODO, quoi qu'il
// arrive à l'autre (#1834) — `projections/rail.ts`, `attendus`.
export const ATTENTE_D_UN_TICKET: MiseDeCote = {
  par: "the ticket's card (`attend : #12`), never the chef",
  retour:
    "the awaited ticket served; still open, even off the rail, it is awaited on the rail; closed without being served, or deleted, the kitchen drops that wait on its own, and says so on the rail and on the issue",
};
