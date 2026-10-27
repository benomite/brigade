// Depuis quand un ticket est dans sa colonne de Taken ou de Pass, et combien d'essais il y a faits (#1839). Le rail
// ne tient que la dernière prise (`since`), qui repart à zéro quand le cook s'arrête sur un garde-fou et qu'on le
// relance : la carte du chef, elle, compte depuis la première. Tout se relit du journal, comme la cadence : aucune
// table de plus.
import type { Base } from "./base.ts";
import { FINS_SANS_SUITE, type TicketRail } from "./projections/rail.ts";

// Un essai : sa prise (`at`) et ce qui l'a arrêté, en anglais (`stop`) — nul tant qu'il tourne.
export type Essai = { at: string; stop: string | null };
export type SejourEnColonne = { depuis: string; essais: Essai[] };

type Ligne = { ticket: number; at: string; type: string; payload: string };
type Ouvert = { etat: "taken" | "pass"; depuis: string; essais: Essai[]; rendu: boolean };

const MOTIFS: Record<string, (limite: number | null) => string> = {
  turns: (limite) => `stopped at the turn limit${limite === null ? "" : ` (${limite})`}`,
  duration: () => "stopped at the time limit",
  tokens: () => "stopped at the token limit",
  idle: () => "stopped: no activity for too long",
  lease: () => "stopped: its lease ran out",
  removals: () => "stopped: it removed too many lines",
  stop: () => "stopped by the chef",
};

// Pourquoi un cook s'est arrêté, d'après son `guard.tripped` s'il en a un, sinon sa fin.
function motif(garde: { reason?: unknown; limit?: unknown } | undefined, fin: Record<string, unknown>, interrompu: boolean): string {
  if (interrompu) return "interrupted: the runtime stopped while it cooked";
  const dit = typeof garde?.reason === "string" ? MOTIFS[garde.reason] : undefined;
  if (dit !== undefined) return dit(typeof garde?.limit === "number" ? garde.limit : null);
  if (fin.cause === "move") return "stopped: the kitchen moved to another station";
  if (fin.cause === "stop" || fin.cause === "update") return "stopped by the chef";
  return fin.outcome === "failed" ? "the cook failed" : "the cook stopped";
}

// Le séjour en cours de chaque ticket pris ou en pass du rail. Un ticket repris après l'arrêt de son cook reste dans
// sa colonne : le séjour commence à la première prise de la suite, et chaque prise est un essai. Tout autre
// changement d'état — pass, livraison, 86, départ — le referme.
export function sejoursEnColonne(base: Base, rail: TicketRail[]): Map<number, SejourEnColonne> {
  const tickets = rail.filter(({ state }) => state === "taken" || state === "pass").map(({ ticket }) => ticket);
  if (tickets.length === 0) return new Map();
  const lignes = base.lire<Ligne>(
    `SELECT ticket, at, type, payload FROM events
     WHERE ticket IN (SELECT value FROM json_each(?1))
       AND type IN ('ticket.arrived', 'ticket.taken', 'ticket.passing', 'ticket.released', 'ticket.served', 'ticket.86', 'ticket.left', 'guard.tripped', 'cook.exited', 'cook.interrupted')
     ORDER BY seq`,
    JSON.stringify(tickets),
  );
  const ouverts = new Map<number, Ouvert>();
  const gardes = new Map<string, { reason?: unknown; limit?: unknown }>();
  for (const { ticket, at, type, payload } of lignes) {
    const lu = JSON.parse(payload) as Record<string, unknown>;
    const ouvert = ouverts.get(ticket);
    switch (type) {
      case "ticket.taken":
        if (ouvert?.etat === "taken" && ouvert.rendu) {
          ouvert.essais.push({ at, stop: null });
          ouvert.rendu = false;
        } else ouverts.set(ticket, { etat: "taken", depuis: at, essais: [{ at, stop: null }], rendu: false });
        break;
      case "ticket.passing":
        ouverts.set(ticket, { etat: "pass", depuis: at, essais: [], rendu: false });
        break;
      case "guard.tripped":
        if (typeof lu.run === "string") gardes.set(lu.run, lu);
        break;
      case "cook.exited":
      case "cook.interrupted": {
        // Seul un ticket pris retourne sur le rail à la fin de son cook : la relecture d'un ticket en pass n'y change rien.
        const interrompu = type === "cook.interrupted";
        const dernier = ouvert?.essais.at(-1);
        if (ouvert?.etat === "taken" && dernier !== undefined && !ouvert.rendu && (interrompu || FINS_SANS_SUITE.includes(lu.outcome))) {
          dernier.stop = motif(typeof lu.run === "string" ? gardes.get(lu.run) : undefined, lu, interrompu);
          ouvert.rendu = true;
        }
        break;
      }
      default:
        ouverts.delete(ticket);
    }
  }
  return new Map([...ouverts].map(([ticket, { depuis, essais }]) => [ticket, { depuis, essais }]));
}
