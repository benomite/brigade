// Un ticket tué deux fois par le même garde-fou (ticket 3650) : ce que la box en dit (`gardeRepetee` d'un ticket du rail,
// runtime/src/gardes-historique/) et la ligne que sa carte en tire. Rien n'est calculé ici que des mots.
import { hourHM } from "../../format.ts";

export type StopRead = { run: string; at: string; activity: string | null };
export type GuardRepeatedRead = { guard: string; kills: StopRead[] };

// Un garde-fou, dans ses mots (docs/glossary.md : `tokens`, `duration`, `idle`, `lease`, `removals` gardent leur nom).
const GUARDS: Record<string, string> = {
  idle: "idle guard",
  duration: "duration guard",
  tokens: "tokens guard",
  lease: "lease guard",
  removals: "removals guard",
};

// `survol` : le run de l'arrêt, au survol de sa ligne.
export type LineOfGuard = { ligne: string; details: { dit: string; survol: string }[] };

// Le champ `gardeRepetee` d'un ticket du rail : un garde-fou et au moins deux arrêts, chacun avec son run et son heure.
// Nul quand il n'a pas cette forme — c'est à celui qui lit de dire que le ticket est illisible (facts.ts).
export function guardRepeatedRead(raw: unknown): GuardRepeatedRead | null {
  const readOne = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const { guard, kills } = readOne;
  if (typeof guard !== "string" || !Array.isArray(kills) || kills.length < 2) return null;
  const stops: StopRead[] = [];
  for (const stop of kills as unknown[]) {
    const { run, at, activity } = (typeof stop === "object" && stop !== null ? stop : {}) as Record<string, unknown>;
    if (typeof run !== "string" || typeof at !== "string" || Number.isNaN(Date.parse(at)) || !(activity === null || typeof activity === "string")) return null;
    stops.push({ run, at, activity });
  }
  return { guard, kills: stops };
}

// « Stopped 2 times by the idle guard » ; dessous, un arrêt par ligne : l'heure, et l'activité où le cook en était.
export function lineOfGuard({ guard, kills }: GuardRepeatedRead): LineOfGuard {
  const name = GUARDS[guard] ?? `${guard} guard`;
  return {
    ligne: `Stopped ${kills.length} times by the ${name}`,
    details: kills.map(({ run, at, activity }) => ({ dit: `${hourHM(at)} — ${activity === null ? "no activity read" : `was ${activity}`}`, survol: `run ${run}` })),
  };
}
