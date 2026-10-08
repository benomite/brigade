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
  // L'issue est fermée (`closed`), a perdu son label (`unfired`) ou n'existe
  // plus (`gone`) : le ticket quitte le rail, quel que soit son état.
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
  // quand elle est connue.
  | { type: "ticket.86"; payload: { reason: string; until: string | null } }
  // Le ticket attend `by`, qui a quitté le rail sans avoir été servi : personne
  // ne le prendra tant que ça dure. Ce fait ne change pas le rail — le blocage
  // s'y lit déjà —, il retient que le chef en a été averti.
  | { type: "ticket.blocked"; payload: { by: number; reason: string } }
  // Les chemins communs du projet : ceux qui n'appartiennent à aucun ticket.
  // Écrit au démarrage, quand la configuration change — le rail se relit du
  // journal seul, zones comprises. Ne concerne aucun ticket.
  | { type: "rail.commons"; payload: { paths: string[] } };

export type MotifDepart = "closed" | "unfired" | "gone";

// Motifs de retour en attente que le runtime écrit de lui-même.
export const BAIL_ECHU = "lease-expired";
export const FIN_DE_86 = "86-over";

// Le motif du 86 d'un ticket que le manager a redécoupé : ses sous-tickets
// portent désormais le travail, et lui ne tient plus de zone.
export const REDECOUPE = "manager:split";
