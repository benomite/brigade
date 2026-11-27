// La fraîcheur d'une station enregistrée sous le compte du chef, telle que son gist la dit — sans E/S : la lecture des
// stations du compte (stations-of-account.ts) et celle des stations d'un projet sur GitHub (vue/cooks/taken.ts) la lisent.

// La limite de GitHub qui retient une station (#2443) : laquelle, depuis quand, et jusqu'à quand (ISO).
export type HeldByGitHub = { limit: string; since: string; until: string };

// La règle de fraîcheur d'un enregistrement : 2 × refreshMs + 30 s sans signe de vie, ou arrêtée depuis, la station est
// indisponible — sauf quand la limite de GitHub la retient : elle est là, ses appels attendent.
type Freshness = { lastSeen: string; stoppedAt: string | null; refreshMs: number; heldBy?: HeldByGitHub | null };
const unavailableAfter = (refreshMs: number) => 2 * refreshMs + 30_000;
const stoppedSince = ({ stoppedAt, lastSeen }: Freshness) => stoppedAt !== null && Date.parse(stoppedAt) >= Date.parse(lastSeen);
export function heldUntil(station: Freshness, instant: number): string | null {
  const held = station.heldBy ?? null;
  if (held === null || stoppedSince(station)) return null;
  return instant - Date.parse(held.until) <= unavailableAfter(station.refreshMs) ? held.until : null;
}
export const available = (station: Freshness, instant: number): boolean => !stoppedSince(station) && (instant - Date.parse(station.lastSeen) <= unavailableAfter(station.refreshMs) || heldUntil(station, instant) !== null);
