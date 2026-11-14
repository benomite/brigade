// Ce qu'un garde-fou a arrêté entre deux instants, pour le récapitulatif
// (#3581) : les faits que le runtime écrit déjà au journal (events/guardrails.ts)
// — un cook arrêté par le plafond de durée ou de tokens, ou par le `stop` du
// chef (`guard.tripped`) ; la cuisine arrêtée par le `stop` (`kitchen.stopped`)
// ou par le disjoncteur (`breaker.opened`). Une ligne par arrêt : ce qui a été
// arrêté, et par quel garde-fou.
import type { Base } from "../base.ts";

type GardeFou = "stop" | "breaker" | "duration" | "tokens";
export type Arret = { at: string; ticket: number | null; guardrail: GardeFou; line: string };

const PAR_LE: Record<GardeFou, string> = { stop: "the chef's stop", breaker: "the breaker", duration: "the duration cap", tokens: "the tokens cap" };
const leCook = (ticket: number | null) => (ticket === null ? "A cook with no ticket" : `The cook of #${ticket}`);

type Ligne = { at: string; ticket: number | null; type: string; payload: string };

// Les arrêts de `debut` (inclus) à `fin` (exclue), dans l'ordre du journal.
export function arretsEntre(base: Base, debut: string, fin: string): Arret[] {
  const lignes = base.lire<Ligne>(
    `SELECT at, ticket, type, payload FROM events
     WHERE type IN ('guard.tripped', 'kitchen.stopped', 'breaker.opened') AND at >= ? AND at < ? ORDER BY seq`,
    new Date(debut).toISOString(),
    new Date(fin).toISOString(),
  );
  return lignes.flatMap(({ at, ticket, type, payload }): Arret[] => {
    const lu = JSON.parse(payload) as { reason?: unknown; failures?: unknown };
    if (type === "kitchen.stopped") return [{ at, ticket: null, guardrail: "stop", line: `The kitchen was stopped by ${PAR_LE.stop}.` }];
    if (type === "breaker.opened") {
      const echecs = typeof lu.failures === "number" ? `, after ${lu.failures} failures in a row` : "";
      return [{ at, ticket: null, guardrail: "breaker", line: `The kitchen was stopped by ${PAR_LE.breaker}${echecs}.` }];
    }
    const garde = lu.reason;
    if (garde !== "stop" && garde !== "duration" && garde !== "tokens") return [];
    return [{ at, ticket, guardrail: garde, line: `${leCook(ticket)} was stopped by ${PAR_LE[garde]}.` }];
  });
}
