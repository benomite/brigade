// Un ticket tué deux fois par le même garde-fou (ticket 3650) : ce que la box en dit (`gardeRepetee` d'un ticket du rail,
// runtime/src/gardes-historique/) et la ligne que sa carte en tire. Rien n'est calculé ici que des mots.
import { heureHM } from "../../format.ts";

export type StopLu = { run: string; at: string; activity: string | null };
export type GuardRepeteeLue = { guard: string; kills: StopLu[] };

// Un garde-fou, dans ses mots (docs/glossary.md : `tokens`, `duration`, `idle`, `lease`, `removals` gardent leur nom).
const GARDES: Record<string, string> = {
  idle: "idle guard",
  duration: "duration guard",
  tokens: "tokens guard",
  lease: "lease guard",
  removals: "removals guard",
};

// `survol` : le run de l'arrêt, au survol de sa ligne.
export type LineDeGuard = { ligne: string; details: { dit: string; survol: string }[] };

// Le champ `gardeRepetee` d'un ticket du rail : un garde-fou et au moins deux arrêts, chacun avec son run et son heure.
// Nul quand il n'a pas cette forme — c'est à celui qui lit de dire que le ticket est illisible (facts.ts).
export function guardRepeteeLue(brut: unknown): GuardRepeteeLue | null {
  const lu = (typeof brut === "object" && brut !== null ? brut : {}) as Record<string, unknown>;
  const { guard, kills } = lu;
  if (typeof guard !== "string" || !Array.isArray(kills) || kills.length < 2) return null;
  const arrets: StopLu[] = [];
  for (const stop of kills as unknown[]) {
    const { run, at, activity } = (typeof stop === "object" && stop !== null ? stop : {}) as Record<string, unknown>;
    if (typeof run !== "string" || typeof at !== "string" || Number.isNaN(Date.parse(at)) || !(activity === null || typeof activity === "string")) return null;
    arrets.push({ run, at, activity });
  }
  return { guard, kills: arrets };
}

// « Stopped 2 times by the idle guard » ; dessous, un arrêt par ligne : l'heure, et l'activité où le cook en était.
export function lineDeGuard({ guard, kills }: GuardRepeteeLue): LineDeGuard {
  const name = GARDES[guard] ?? `${guard} guard`;
  return {
    ligne: `Stopped ${kills.length} times by the ${name}`,
    details: kills.map(({ run, at, activity }) => ({ dit: `${heureHM(at)} — ${activity === null ? "no activity read" : `was ${activity}`}`, survol: `run ${run}` })),
  };
}
