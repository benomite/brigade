// The "Ticket time" line of `brigade <projet> status`: median and p75 against the
// max, and the slowest phase. Reads the `resume` object of the measure's
// `.claude/brigade/temps-tickets.json` and nothing else — the time is never
// computed here. A missing file or `resume` reads as "no measure yet".
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const SANS_MESURE = "Ticket time: no measure yet";

const nombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const minutes = (v: number) => `${Math.round(v * 10) / 10} min`;

export function direLeTempsDesTickets(brut: unknown): string {
  const resume = typeof brut === "object" && brut !== null && !Array.isArray(brut) ? (brut as { resume?: unknown }).resume : undefined;
  if (typeof resume !== "object" || resume === null) return SANS_MESURE;
  const r = resume as Record<string, unknown>;
  if (!nombre(r.n) || r.n === 0 || !nombre(r.medianMin) || !nombre(r.p75Min) || !nombre(r.maxMin)) return SANS_MESURE;
  const ligne = `Ticket time: median ${minutes(r.medianMin)}, p75 ${minutes(r.p75Min)} (max ${minutes(r.maxMin)})`;
  const phase = r.phaseLaPlusLongue;
  if (typeof phase === "string" && phase !== "") return `${ligne}, slowest phase ${phase}`;
  if (typeof phase === "object" && phase !== null) {
    const { phase: nom, medianMin } = phase as { phase?: unknown; medianMin?: unknown };
    if (typeof nom === "string" && nom !== "") return `${ligne}, slowest phase ${nom}${nombre(medianMin) ? ` (median ${minutes(medianMin)})` : ""}`;
  }
  return ligne;
}

export function ligneDuTempsDesTickets(repertoireDepot: string | undefined): string {
  if (!repertoireDepot) return SANS_MESURE;
  try {
    return direLeTempsDesTickets(JSON.parse(readFileSync(join(repertoireDepot, ".claude", "brigade", "temps-tickets.json"), "utf8")));
  } catch {
    return SANS_MESURE;
  }
}
