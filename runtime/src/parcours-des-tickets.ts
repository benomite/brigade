// Le parcours de chaque ticket servi, lu du journal en lecture seule : ses
// essais, de sa prise par une station à son merge. Ce que `renvois.ts` mesure.
//
// Un parcours s'ouvre à la première prise d'un ticket qui n'en a pas d'ouvert,
// et se ferme sur son merge — ou son service sans diff. Rendu à l'attente puis
// repris, le ticket reste dans le même parcours : ses essais s'y ajoutent. Pris
// de nouveau après son merge, il en ouvre un autre. Un merge d'un ticket
// qu'aucune station n'a pris n'ouvre rien : aucun essai n'est à compter.
import type { Base } from "./base.ts";
import type { Essai, Parcours } from "./renvois.ts";

// Les stations que la pass et le manager lancent : ni une relecture ni un
// jugement ne cuisine un ticket.
const HORS_TICKET = ["reviewer", "manager"];

type Ligne = { ticket: number; at: string; type: string; payload: string };

// Les parcours, dans l'ordre de leur prise.
export function parcoursDesTickets(base: Base): Parcours[] {
  const lignes = base.lire<Ligne>(
    "SELECT ticket, at, type, payload FROM events WHERE ticket IS NOT NULL AND type IN ('ticket.taken', 'cook.launched', 'cook.exited', 'pass.judged', 'merge.done', 'pass.served') ORDER BY seq",
  );
  const parcours: Parcours[] = [];
  const ouverts = new Map<number, Parcours>();
  // Par run, l'essai qu'il est : sa fin et son jugement s'y écrivent.
  const essais = new Map<string, Essai>();

  for (const { ticket, at, type, payload } of lignes) {
    const p = JSON.parse(payload) as Record<string, unknown>;
    const ouvert = ouverts.get(ticket);
    switch (type) {
      case "ticket.taken":
        if (ouvert === undefined) {
          const nouveau: Parcours = { ticket, takenAt: at, end: null, attempts: [] };
          parcours.push(nouveau);
          ouverts.set(ticket, nouveau);
        }
        break;
      case "cook.launched": {
        if (ouvert === undefined || typeof p.run !== "string" || (typeof p.station === "string" && HORS_TICKET.includes(p.station))) break;
        const essai: Essai = { run: p.run, at, outcome: null, verdict: null };
        ouvert.attempts.push(essai);
        essais.set(p.run, essai);
        break;
      }
      case "cook.exited": {
        const essai = typeof p.run === "string" ? essais.get(p.run) : undefined;
        if (essai !== undefined) essai.outcome = typeof p.outcome === "string" ? p.outcome : null;
        break;
      }
      case "pass.judged": {
        const essai = typeof p.run === "string" ? essais.get(p.run) : undefined;
        if (essai !== undefined && (p.verdict === "green" || p.verdict === "red")) essai.verdict = p.verdict;
        break;
      }
      case "merge.done":
      case "pass.served":
        if (ouvert === undefined) break;
        ouvert.end = { kind: type === "merge.done" ? "merged" : "served", at };
        ouverts.delete(ticket);
        break;
    }
  }
  return parcours;
}
