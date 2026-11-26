// À quelle allure la cuisine sert (#1811) : le chef revient au bout d'une heure ou de cinq, et le rail lui dit d'un coup
// d'œil « ça a avancé » ou « pourquoi c'est lent ». Lu dans `facts` (`cadence`,
// docs/runtime/etat-et-mesures.md) et jamais dans la mémoire de l'app — juste dès qu'elle s'ouvre : sur chaque carte de Taken et de Pass, depuis combien de temps elle y est : bien plus longtemps que d'ordinaire —
//    plus de deux fois la médiane des tickets passés par cette colonne —, elle tranche par sa couleur. Son âge exact
//    est au survol. L'histogramme des 24 heures a quitté la tête du rail avec la bande de chiffres (#3013).
// Ce module calcule ce que la vue pose : la vue n'y compte rien.
import { duree } from "./faits.ts";
import { heureHM } from "./format.ts";

// La forme lue : `hours`, vingt-quatre heures piles, la plus ancienne d'abord ; `medianSeconds`, le temps ordinaire
// d'un ticket pris (`taken`) et en pass (`pass`), nul tant que la cuisine n'en sait rien dire.
export type HeureLue = { at: string; served: number; failed: number };
export type CadenceLue = { hours: HeureLue[]; medianSeconds: { taken: number | null; pass: number | null } };

// L'âge d'une carte de Taken ou de Pass : court, sur la carte ; exact, au survol ; `longue`, elle y est depuis plus de
// deux fois l'ordinaire.
export type Anciennete = { court: string; dit: string; longue: boolean };

// Un essai du séjour d'un ticket pris, tel que le runtime le donne (#1893) : sa prise, la fin de son cook (nulle tant
// qu'il tourne), pourquoi il s'est arrêté (nul pour l'essai courant).
export type EssaiLu = { depuis: string; jusqua: string | null; arret: string | null; enCours: boolean };
// Un point de la carte, un par essai : `enCours`, le dernier, celui qui cuit ; `dit`, ce qu'il dit au survol.
export type Point = { enCours: boolean; dit: string };

export const HEURES = 24;
// Bien plus longtemps que d'ordinaire : plus de deux fois la médiane.
export const FOIS_LA_MEDIANE = 2;

const compte = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0;
const secondes = (valeur: unknown): valeur is number | null => valeur === null || (typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0);

// Le champ `cadence` d'un `facts`. Un champ qui n'a pas cette forme n'est pas lu — le rail se dessine sans, comme pour
// un runtime d'avant ce champ.
export function cadenceLue(brut: unknown): CadenceLue | undefined {
  if (typeof brut !== "object" || brut === null) return undefined;
  const { hours, medianSeconds } = brut as Record<string, unknown>;
  if (!Array.isArray(hours) || hours.length !== HEURES || typeof medianSeconds !== "object" || medianSeconds === null) return undefined;
  const lues: HeureLue[] = [];
  for (const heure of hours) {
    if (typeof heure !== "object" || heure === null) return undefined;
    const { at, served, failed } = heure as Record<string, unknown>;
    if (typeof at !== "string" || Number.isNaN(Date.parse(at)) || !compte(served) || !compte(failed)) return undefined;
    lues.push({ at, served, failed });
  }
  const { taken, pass } = medianSeconds as Record<string, unknown>;
  if (!secondes(taken) || !secondes(pass)) return undefined;
  return { hours: lues, medianSeconds: { taken, pass } };
}

// Une durée en un mot court, pour la carte : « 12 min », « 3 h », « 2 d ».
export function dureeCourte(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / (24 * 60))} d`;
}

const COLONNES = { pris: { nom: "Taken", mediane: "taken" }, "en pass": { nom: "Pass", mediane: "pass" } } as const;

// L'âge d'une carte de Taken (`pris`) ou de Pass (`en pass`), entre deux heures de la box — son entrée dans la colonne,
// la lecture. Rien pour un autre état, ni pour un ticket dont la box ne dit pas l'entrée. Sans médiane, la carte ne
// tranche pas : la cuisine ne sait pas encore ce qui est ordinaire, et le survol le dit.
export function anciennete(etat: string, depuis: string | undefined, lu: string, medianes: CadenceLue["medianSeconds"] | undefined): Anciennete | undefined {
  if (depuis === undefined || !(etat === "pris" || etat === "en pass")) return undefined;
  const colonne = COLONNES[etat];
  const age = Math.max(0, Date.parse(lu) - Date.parse(depuis));
  const mediane = medianes?.[colonne.mediane] ?? null;
  const longue = mediane !== null && age > FOIS_LA_MEDIANE * mediane * 1000;
  const ordinaire =
    mediane === null
      ? "no usual time yet: too few tickets have left this column in the last 7 days"
      : `usually ${duree(mediane * 1000)} (the median of the last 7 days)${longue ? " — more than twice that" : ""}`;
  return { court: dureeCourte(age), dit: `in ${colonne.nom} for ${duree(age)}, since ${heureHM(depuis)} — ${ordinaire}`, longue };
}

// Le champ `essais` d'un ticket du rail (#1893), le plus ancien d'abord.
export function essaisLus(brut: unknown, champ: string): EssaiLu[] {
  if (!Array.isArray(brut)) throw new Error(`${champ}: expected a list`);
  return brut.map((essai: unknown, rang) => {
    const lu = (typeof essai === "object" && essai !== null ? essai : {}) as Record<string, unknown>;
    const { depuis, jusqua, arret, enCours } = lu;
    const heure = (valeur: unknown) => typeof valeur === "string" && !Number.isNaN(Date.parse(valeur));
    if (!heure(depuis) || !(jusqua === null || heure(jusqua)) || !(arret === null || typeof arret === "string") || typeof enCours !== "boolean") {
      throw new Error(`${champ}[${rang}]: expected an attempt`);
    }
    return { depuis: depuis as string, jusqua: jusqua as string | null, arret: arret as string | null, enCours };
  });
}

// Les points d'une carte : un par essai, dès qu'il y en a plus d'un — un seul essai n'en montre aucun. Un essai fini dit,
// au survol, son rang, combien de temps il a cuit et pourquoi il s'est arrêté (le mot du runtime : `turns`, `idle`,
// `failed`, `interrupted`…) ; le courant dit qu'il cuit.
export function points(essais: EssaiLu[] | undefined): Point[] | undefined {
  if (essais === undefined || essais.length < 2) return undefined;
  return essais.map((essai, rang) => {
    const nom = `attempt ${rang + 1} of ${essais.length}`;
    if (essai.enCours || essai.jusqua === null) return { enCours: true, dit: `${nom} — cooking now` };
    const cuit = duree(Math.max(0, Date.parse(essai.jusqua) - Date.parse(essai.depuis)));
    return { enCours: false, dit: `${nom} — stopped after ${cuit}: ${essai.arret ?? "unknown reason"}` };
  });
}
