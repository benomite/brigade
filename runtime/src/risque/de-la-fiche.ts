// The risk ranking as the project sheet holds it on the base, as last fetched (#4230): read again at each merge of the
// pass, so a rank the chef changes applies from the next ticket, with no restart. Apart from `risque.ts`, which the
// sheet's own reader (`reglages-projet/reglages.ts`) imports.
import { reglagesALaBase } from "../reglages-projet/en-vigueur.ts";
import type { ClassementDesRisques } from "./risque.ts";

// What reads the ranking of the project's clone, at each call. It gives null when the sheet ranks nothing — or when
// the station has no clone: the defaults then hold —, and throws when the sheet cannot be read: unreadable is not
// absent.
export function risquesDuClone(clone: string | undefined, base: string): () => ClassementDesRisques | null {
  if (clone === undefined) return () => null;
  return () => reglagesALaBase({ clone, base })?.risks ?? null;
}
