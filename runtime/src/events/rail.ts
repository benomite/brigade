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
  // Le ticket attendait `by`, qui a quitté le rail sans avoir été servi.
  // Écrit avant #1834, quand un tel départ le bloquait : il ne change rien au
  // rail, et ne s'écrit plus.
  | { type: "ticket.blocked"; payload: { by: number; reason: string } }
  // Le ticket attendait `by`, fermé sans avoir été servi (ou disparu) : la
  // cuisine ne l'attend plus, d'elle-même (#1834). Ce fait ne change pas le
  // rail — l'attente levée s'y lit déjà —, il retient que l'issue en a été
  // avertie.
  | { type: "ticket.wait-dropped"; payload: { by: number; reason: string } }
  // Le chef met le ticket en attente d'un tiers (WAITING) : ce qu'il attend,
  // dans ses mots, de qui, et la date à laquelle y revenir (`followUp`, un
  // instant ISO). Le ticket est mis de côté sans heure de retour : la cuisine ne
  // le prend pas. Redit d'un ticket qui attend déjà, il met à jour l'attente
  // sans en changer le début.
  | { type: "ticket.waiting"; payload: { what: string; who: string; followUp: string } }
  // Le ticket sort de WAITING, sur un geste. `to` : `todo` (« resume »), il
  // reprend l'état qu'il avait avant d'attendre — mis de côté pour son propre
  // motif, ou en attente sur le rail ; `kitchen` (« arrived »), il repart en
  // cuisine. Aucun des deux ne passe par TODO (#1834). `why` : ce qui l'a fait
  // sortir — `chef`, le geste. Un `todo` que le runtime écrivait seul avant
  // #1834 (« relance du 21/10 : pas de réponse », « nouveau sur l'issue »)
  // n'est pas un geste : le rail le lit sans effet, le ticket attend toujours.
  | { type: "ticket.resumed"; payload: { to: "todo" | "kitchen"; why: string } }
  // L'issue du ticket dit ce que le rail sait de son attente : la marque posée
  // (label `waiting` et commentaire) pour cette attente-ci, ou retirée (`null`).
  // Ce fait retient seulement ce qui est déjà sur GitHub. `heard` : le nombre
  // de commentaires hors brigade que l'issue portait alors, écrit avant #1834,
  // quand un commentaire de plus ramenait le ticket ; il ne s'écrit plus.
  | { type: "waiting.marked"; payload: { waiting: { what: string; who: string; followUp: string } | null; heard?: number } }
  // Le chef a retiré `fire` de l'issue puis l'a reposé, et la cuisine ne l'a
  // pas compté : le retrait précède la retenue du ticket (`removedAt`, l'instant
  // que GitHub date). Le ticket reste retenu ; sa ligne de file le dit.
  | { type: "ticket.fire-unseen"; payload: { removedAt: string } }
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
// Ce qui fait sortir un ticket de WAITING : le geste du chef — « resume »,
// « arrived ». Rien ne l'en sort seul : ni sa date de relance, ni un
// commentaire sur son issue (#1834).
export const PAR_LE_CHEF = "chef";
