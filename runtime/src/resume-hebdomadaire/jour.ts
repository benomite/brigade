// Le jour du résumé hebdomadaire de la cuisine (#3261) : le réglage
// `weeklySummaryDay` du projet (`.claude/brigade/projet.json`), lundi s'il est
// absent. Les jours sont ceux d'UTC, comme la semaine du rapport de qualité
// (`rapport-hebdo-qualite.ts`).
//
// Le résumé d'un jour couvre les sept jours qui le précèdent : lundi, la
// semaine du lundi au dimanche d'avant ; jeudi, du jeudi au mercredi d'avant.
export const JOURS_DU_RESUME = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type JourDuResume = (typeof JOURS_DU_RESUME)[number];
export const JOUR_PAR_DEFAUT: JourDuResume = "monday";

const JOUR_MS = 24 * 3600 * 1000;

// Le jour réglé dans la configuration du projet. Absent : lundi. Un réglage
// qui n'est pas un jour lève : il ne vaut pas lundi à la place du chef.
export function jourDuResume(projet: unknown): JourDuResume {
  const pose = typeof projet === "object" && projet !== null ? (projet as { weeklySummaryDay?: unknown }).weeklySummaryDay : undefined;
  if (pose === undefined) return JOUR_PAR_DEFAUT;
  if (typeof pose !== "string" || !(JOURS_DU_RESUME as readonly string[]).includes(pose)) throw new Error(`weeklySummaryDay is ${JSON.stringify(pose)}, not a day of the week (${JOURS_DU_RESUME.join(", ")})`);
  return pose as JourDuResume;
}

// Le jour d'un instant, en UTC.
export function jourDe(instant: Date): JourDuResume {
  return JOURS_DU_RESUME[(instant.getUTCDay() + 6) % 7] as JourDuResume;
}

const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// La semaine que le résumé de ce jour couvre — `weekStart` et `weekEnd`, deux
// dates incluses —, et ses bornes en instants (`debut` inclus, `fin` exclue :
// minuit du jour du résumé). Null si ce n'est pas le jour du résumé.
export function semaineAResumer(maintenant: Date, jour: JourDuResume): { weekStart: string; weekEnd: string; debut: Date; fin: Date } | null {
  if (jourDe(maintenant) !== jour) return null;
  const fin = Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate());
  const debut = fin - 7 * JOUR_MS;
  return { weekStart: date(debut), weekEnd: date(fin - JOUR_MS), debut: new Date(debut), fin: new Date(fin) };
}
