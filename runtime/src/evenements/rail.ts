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
  | { type: "ticket.left"; payload: { reason: "closed" | "unfired" | "gone" } }
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
  | { type: "ticket.86"; payload: { reason: string; until: string | null } };

// Motifs de retour en attente que le runtime écrit de lui-même.
export const BAIL_ECHU = "lease-expired";
export const FIN_DE_86 = "86-over";
