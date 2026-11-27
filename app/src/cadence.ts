// À quelle allure la cuisine sert (#1811) : le chef revient au bout d'une heure ou de cinq, et le rail lui dit d'un coup
// d'œil « ça a avancé » ou « pourquoi c'est lent ». Lu dans `facts` (`cadence`,
// docs/runtime/etat-et-mesures.md) et jamais dans la mémoire de l'app — juste dès qu'elle s'ouvre : sur chaque carte de Taken et de Pass, depuis combien de temps elle y est : bien plus longtemps que d'ordinaire —
//    plus de deux fois la médiane des tickets passés par cette colonne —, elle tranche par sa couleur. Son âge exact
//    est au survol. L'histogramme des 24 heures a quitté la tête du rail avec la bande de chiffres (#3013).
// Ce module calcule ce que la vue pose : la vue n'y compte rien.
import { duration } from "./facts.ts";
import { hourHM } from "./format.ts";

// La forme lue : `hours`, vingt-quatre heures piles, la plus ancienne d'abord ; `medianSeconds`, le temps ordinaire
// d'un ticket pris (`taken`) et en pass (`pass`), nul tant que la cuisine n'en sait rien dire.
export type HourRead = { at: string; served: number; failed: number };
export type CadenceRead = { hours: HourRead[]; medianSeconds: { taken: number | null; pass: number | null } };

// L'âge d'une carte de Taken ou de Pass : court, sur la carte ; exact, au survol ; `longue`, elle y est depuis plus de
// deux fois l'ordinaire.
export type Seniority = { court: string; dit: string; longue: boolean };

// Un essai du séjour d'un ticket pris, tel que le runtime le donne (#1893) : sa prise, la fin de son cook (nulle tant
// qu'il tourne), pourquoi il s'est arrêté (nul pour l'essai courant).
export type TrialRead = { depuis: string; jusqua: string | null; arret: string | null; enCours: boolean };
// Un point de la carte, un par essai : `enCours`, le dernier, celui qui cuit ; `dit`, ce qu'il dit au survol.
export type Point = { enCours: boolean; dit: string };

export const HOURS = 24;
// Bien plus longtemps que d'ordinaire : plus de deux fois la médiane.
export const TIMES_THE_MEDIAN = 2;

const account = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const seconds = (value: unknown): value is number | null => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);

// Le champ `cadence` d'un `facts`. Un champ qui n'a pas cette forme n'est pas lu — le rail se dessine sans, comme pour
// un runtime d'avant ce champ.
export function cadenceRead(raw: unknown): CadenceRead | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { hours, medianSeconds } = raw as Record<string, unknown>;
  if (!Array.isArray(hours) || hours.length !== HOURS || typeof medianSeconds !== "object" || medianSeconds === null) return undefined;
  const readEntries: HourRead[] = [];
  for (const hour of hours) {
    if (typeof hour !== "object" || hour === null) return undefined;
    const { at, served, failed } = hour as Record<string, unknown>;
    if (typeof at !== "string" || Number.isNaN(Date.parse(at)) || !account(served) || !account(failed)) return undefined;
    readEntries.push({ at, served, failed });
  }
  const { taken, pass } = medianSeconds as Record<string, unknown>;
  if (!seconds(taken) || !seconds(pass)) return undefined;
  return { hours: readEntries, medianSeconds: { taken, pass } };
}

// Une durée en un mot court, pour la carte : « 12 min », « 3 h », « 2 d ».
export function durationShort(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / (24 * 60))} d`;
}

const COLUMNS = { pris: { nom: "Taken", mediane: "taken" }, "en pass": { nom: "Pass", mediane: "pass" } } as const;

// L'âge d'une carte de Taken (`pris`) ou de Pass (`en pass`), entre deux heures de la box — son entrée dans la colonne,
// la lecture. Rien pour un autre état, ni pour un ticket dont la box ne dit pas l'entrée. Sans médiane, la carte ne
// tranche pas : la cuisine ne sait pas encore ce qui est ordinaire, et le survol le dit.
export function seniority(state: string, since: string | undefined, readOne: string, medianes: CadenceRead["medianSeconds"] | undefined): Seniority | undefined {
  if (since === undefined || !(state === "pris" || state === "en pass")) return undefined;
  const column = COLUMNS[state];
  const age = Math.max(0, Date.parse(readOne) - Date.parse(since));
  const median = medianes?.[column.mediane] ?? null;
  const long = median !== null && age > TIMES_THE_MEDIAN * median * 1000;
  const ordinary =
    median === null
      ? "no usual time yet: too few tickets have left this column in the last 7 days"
      : `usually ${duration(median * 1000)} (the median of the last 7 days)${long ? " — more than twice that" : ""}`;
  return { court: durationShort(age), dit: `in ${column.nom} for ${duration(age)}, since ${hourHM(since)} — ${ordinary}`, longue: long };
}

// Le champ `essais` d'un ticket du rail (#1893), le plus ancien d'abord.
export function trialsRead(raw: unknown, field: string): TrialRead[] {
  if (!Array.isArray(raw)) throw new Error(`${field}: expected a list`);
  return raw.map((trial: unknown, rank) => {
    const readOne = (typeof trial === "object" && trial !== null ? trial : {}) as Record<string, unknown>;
    const { depuis: since, jusqua: until, arret: stop, enCours: inProgress } = readOne;
    const hour = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value));
    if (!hour(since) || !(until === null || hour(until)) || !(stop === null || typeof stop === "string") || typeof inProgress !== "boolean") {
      throw new Error(`${field}[${rank}]: expected an attempt`);
    }
    return { depuis: since as string, jusqua: until as string | null, arret: stop as string | null, enCours: inProgress };
  });
}

// Les points d'une carte : un par essai, dès qu'il y en a plus d'un — un seul essai n'en montre aucun. Un essai fini dit,
// au survol, son rang, combien de temps il a cuit et pourquoi il s'est arrêté (le mot du runtime : `turns`, `idle`,
// `failed`, `interrupted`…) ; le courant dit qu'il cuit.
export function points(trials: TrialRead[] | undefined): Point[] | undefined {
  if (trials === undefined || trials.length < 2) return undefined;
  return trials.map((trial, rank) => {
    const name = `attempt ${rank + 1} of ${trials.length}`;
    if (trial.enCours || trial.jusqua === null) return { enCours: true, dit: `${name} — cooking now` };
    const cooked = duration(Math.max(0, Date.parse(trial.jusqua) - Date.parse(trial.depuis)));
    return { enCours: false, dit: `${name} — stopped after ${cooked}: ${trial.arret ?? "unknown reason"}` };
  });
}
