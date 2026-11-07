// Les temps des derniers tickets de « parade » (#2346, épique #2336) : les enregistrements de
// `.claude/brigade/temps-tickets.json`, en secondes, tels que la station les publie sous `temps` du projet vu.
import { donnees, SUR_LA_BOX } from "./cuisine-demenagee.ts";

const MIN = 60;
const enregistrement = (ticket: number, minutes: number) => ({
  ticket,
  claimedAt: "2026-10-01T00:00:00.000Z",
  mergedAt: `2026-10-${String(ticket - 2330).padStart(2, "0")}T10:00:00.000Z`,
  cuisson: Math.round(minutes * MIN * 0.4),
  cuissonTests: Math.round(minutes * MIN * 0.1),
  attentePasse: Math.round(minutes * MIN * 0.1),
  revue: Math.round(minutes * MIN * 0.2),
  ci: Math.round(minutes * MIN * 0.1),
  merge: Math.round(minutes * MIN * 0.1),
});

export const NORMAL = [9, 11, 8, 12, 10, 14, 9, 13, 11, 18].map((m, i) => enregistrement(2331 + i, m));
export const LENT = [19, 22, 17, 25, 21, 30, 18, 24, 20, 28].map((m, i) => enregistrement(2331 + i, m));

export const avec = (enregistrements: ReturnType<typeof enregistrement>[]) => () => donnees({ ...SUR_LA_BOX, temps: { enregistrements, lostTimeMaxMin: 2 } });
