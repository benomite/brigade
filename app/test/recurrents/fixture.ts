// Les tickets récurrents d'un projet, de la forme que le runtime rend (`recurring`, runtime/src/recurrents/, #3230) :
// {id, title, body, rhythm: {kind, weekday?, dayOfMonth?}, paused, nextDate}. Un de chaque rythme, et un suspendu.
import type { Recurrent } from "../../src/vue/recurrents/recurrents-box.ts";

export const RECURRENTS: Recurrent[] = [
  { id: "a1b2c3d4", title: "Check the error dashboard", body: "", rhythm: { kind: "daily" }, paused: false, nextDate: "2026-10-13" },
  { id: "b2c3d4e5", title: "Update the dependencies", body: "Bump what is outdated.", rhythm: { kind: "weekly", weekday: 1 }, paused: false, nextDate: "2026-10-19" },
  { id: "c3d4e5f6", title: "Write the monthly cost report", body: "", rhythm: { kind: "monthly", dayOfMonth: 15 }, paused: false, nextDate: "2026-10-15" },
  { id: "d4e5f6a7", title: "Rotate the deploy keys", body: "", rhythm: { kind: "monthly", dayOfMonth: 1 }, paused: true, nextDate: "2026-11-01" },
];
