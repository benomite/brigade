// The product role's line in `status`: on or off, the issues it filed today
// against the daily cap, and when it last ran. Read from the project's state
// alone — no network, nothing written.
import type { Base } from "../../base.ts";
import { deposeesLe, jourDe, lireLaCadence } from "./etat.ts";

// `2026-11-01T14:02:09.123Z` → `2026-11-01 14:02 UTC`.
const dater = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

export function direCadence(base: Base, maintenant: Date): string {
  const etat = lireLaCadence(base);
  const jour = jourDe(maintenant);
  const deposees = deposeesLe(etat, jour);
  const plafond = deposees >= etat.plafond ? " (cap reached)" : "";
  return `product role: ${etat.allume ? "ON" : "OFF"} — ${deposees}/${etat.plafond} issues filed today${plafond} — last run: ${etat.dernierPassage === null ? "never" : dater(etat.dernierPassage)}`;
}
