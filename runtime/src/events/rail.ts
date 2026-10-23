// Les faits du rail : ce qui arrive à un ticket, de son entrée à son service.
// Chacun porte le numéro du ticket dans son enveloppe.
import type { Fiche } from "../fiche.ts";

export type FaitRail =
  // GitHub : une issue ouverte porte le label `fire`. `model` et `effort` : son
  // calibrage, nul tant qu'il n'est pas posé. `card` : sa fiche, nulle si
  // l'issue n'en porte pas. Les trois sont absents d'un fait écrit avant que le
  // rail ne les lise.
  | {
      type: "ticket.arrived";
      payload: { title: string; priority: number | null; createdAt: string; url: string; model?: string | null; effort?: string | null; card?: Fiche | null };
    }
  | { type: "ticket.changed"; payload: { title: string; priority: number | null; model?: string | null; effort?: string | null; card?: Fiche | null } }
  // L'issue est fermée (`closed`), a perdu son label (`unfired`), porte `hors-cuisine`
  // ou n'existe plus (`gone`) : le ticket quitte le rail, quel que soit son état.
  // S'écrit aussi d'une issue qui n'y est jamais entrée, quand un ticket du
  // rail l'attend et qu'elle est fermée : c'est par ce fait que le journal sait,
  // seul, qu'un ticket attendu est abandonné.
  | { type: "ticket.left"; payload: { reason: MotifDepart } }
  // Prêté à une station, sous bail : sans renouvellement avant `leaseUntil`,
  // le ticket sera rendu.
  | { type: "ticket.taken"; payload: { station: string; leaseUntil: string } }
  | { type: "ticket.renewed"; payload: { station: string; leaseUntil: string } }
  // Retour en attente. `station` : celle qui le tenait, s'il y en avait une.
  | { type: "ticket.released"; payload: { reason: string; station: string | null } }
  // Le cook a fini : le ticket part en pass.
  | { type: "ticket.passing"; payload: { station: string } }
  | { type: "ticket.served"; payload: Record<string, never> }
  // Pas servable pour l'instant. `until` : l'heure à laquelle il le redevient,
  // quand elle est connue. `why` : ce qui l'a fait échouer, dans les mots de
  // l'outil — l'erreur de git d'un worktree impossible à préparer ; `access` :
  // l'accès de la station au dépôt, quand il est refusé (`projets/acces.ts`),
  // et le geste qui le lève. Absents pour tout autre motif.
  | { type: "ticket.86"; payload: { reason: string; until: string | null; why?: string; access?: AccesRefuse } }
  // Le ticket attend `by`, qui a quitté le rail sans avoir été servi : personne
  // ne le prendra tant que ça dure. Ce fait ne change pas le rail — le blocage
  // s'y lit déjà —, il retient que le chef en a été averti.
  | { type: "ticket.blocked"; payload: { by: number; reason: string } }
  // Le chef met le ticket en attente d'un tiers (WAITING) : ce qu'il attend,
  // dans ses mots, de qui, et la date à laquelle y revenir (`followUp`, un
  // instant ISO). Le ticket est mis de côté sans heure de retour : la cuisine ne
  // le prend pas. Redit d'un ticket qui attend déjà, il met à jour l'attente
  // sans en changer le début.
  | { type: "ticket.waiting"; payload: { what: string; who: string; followUp: string } }
  // Le ticket sort de WAITING. `to` : `todo`, il revient devant le chef — dans
  // l'état où il était avant d'attendre s'il était mis de côté, sinon mis de
  // côté pour lui (motif `third-party:resumed`) ; `kitchen`, il repart en
  // cuisine sans repasser devant le chef. `why` : ce qui l'a fait sortir
  // (`chef`, le geste du chef ; ou, écrit par le runtime, le motif lisible :
  // « relance du 21/10 : pas de réponse », « nouveau sur l'issue »).
  | { type: "ticket.resumed"; payload: { to: "todo" | "kitchen"; why: string } }
  // L'issue du ticket dit ce que le rail sait de son attente : la marque posée
  // (label `waiting` et commentaire) pour cette attente-ci, ou retirée (`null`).
  // Ce fait retient seulement ce qui est déjà sur GitHub. `heard` : le nombre
  // de commentaires hors brigade que l'issue portait alors — ce qui s'y ajoute
  // ensuite ramène le ticket.
  | { type: "waiting.marked"; payload: { waiting: { what: string; who: string; followUp: string } | null; heard?: number } }
  // Le chef a retiré `fire` de l'issue puis l'a reposé, et la cuisine ne l'a
  // pas compté : le retrait précède la retenue du ticket (`removedAt`, l'instant
  // que GitHub date). Le ticket reste retenu ; sa ligne de file le dit.
  | { type: "ticket.fire-unseen"; payload: { removedAt: string } }
  // Le chef a déplacé le ticket (`rail move`) : `order`, l'ordre manuel des
  // tickets de la priorité `priority` qui en résulte, du premier servi au
  // dernier. Il prime sur l'âge dans cette priorité ; un ticket qui n'y figure
  // pas passe après, le plus ancien d'abord.
  | { type: "ticket.moved"; payload: { priority: number | null; order: number[] } }
  // Les chemins communs du projet : ceux qui n'appartiennent à aucun ticket.
  // Écrit au démarrage, quand la configuration change — le rail se relit du
  // journal seul, zones comprises. Ne concerne aucun ticket.
  | { type: "rail.commons"; payload: { paths: string[] } };

export type MotifDepart = "closed" | "unfired" | "gone" | "hors-cuisine";

// Un accès refusé au dépôt, tel que le journal le porte : ce qui est refusé
// (`fetch` ou `push`), pourquoi en une phrase, et le geste du chef.
export type AccesRefuse = { blocked: "fetch" | "push"; reason: string; gesture: string };

// Motifs de retour en attente que le runtime écrit de lui-même.
export const BAIL_ECHU = "lease-expired";
export const FIN_DE_86 = "86-over";

// Le motif du 86 d'un ticket que le manager a redécoupé : ses sous-tickets
// portent désormais le travail, et lui ne tient plus de zone.
export const REDECOUPE = "manager:split";

// Le début du motif du 86 d'un ticket qui demande une capacité qu'aucune
// station déclarée ne fournit ; ce qui manque le suit (`capacites.ts`). Il
// n'est jamais parti : il ne tient aucune zone.
export const SANS_STATION = "no-station";

// Le début du motif du 86 d'un ticket que seules des stations distantes
// absentes peuvent cuisiner ; leurs noms le suivent (`capacites.ts`). Ce n'est
// pas une panne : il repart seul quand l'une d'elles se manifeste.
export const STATION_ABSENTE = "station-absent";

// Le motif du 86 d'un ticket en attente d'un tiers (WAITING). Sans heure de
// retour : seul un geste l'en sort. Jamais parti pour cette attente, il ne
// tient de zone que s'il porte une livraison ouverte.
export const ATTEND_UN_TIERS = "third-party";
// Le motif du 86 d'un ticket sorti de WAITING vers le chef, quand il n'était
// pas mis de côté avant d'attendre : il revient devant le chef, pas en cuisine.
export const REVENU_D_ATTENTE = "third-party:resumed";
// Ce qui fait sortir un ticket de WAITING, quand c'est le chef.
export const PAR_LE_CHEF = "chef";
// Ce qui le fait sortir seul : un commentaire qui n'est pas de la brigade…
export const NOUVEAU_SUR_L_ISSUE = "nouveau sur l'issue";
// … ou la date de relance atteinte, que le motif dit en JJ/MM (heure de la
// box, comme la relance qu'on y a tapée).
export function motifDeRelance(followUp: string): string {
  const date = new Date(followUp);
  const deux = (n: number) => String(n).padStart(2, "0");
  return `relance du ${deux(date.getDate())}/${deux(date.getMonth() + 1)} : pas de réponse`;
}
