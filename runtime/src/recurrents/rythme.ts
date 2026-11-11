// Le rythme d'un ticket récurrent (#3230) : tous les jours, un jour de la
// semaine, ou un jour du mois — et la date de chaque occurrence.
//
// Les dates sont des jours `YYYY-MM-DD` du calendrier UTC : une occurrence
// tombe le même jour sur toutes les machines. Le jour de la semaine est celui
// d'ISO 8601 : 1 le lundi, 7 le dimanche. Un jour du mois absent du mois (le 31
// d'un mois de 30 jours, le 29 d'un février de 28) tombe sur son dernier jour.

export type Rythme = { kind: "daily" } | { kind: "weekly"; weekday: number } | { kind: "monthly"; dayOfMonth: number };

// Ce que lève un rythme, un titre ou un ticket récurrent qui ne se lit pas : sa
// phrase, en anglais, est ce que la commande et l'app montrent.
export class RecurrentInvalide extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecurrentInvalide";
  }
}

const CHAMPS: Record<Rythme["kind"], string[]> = { daily: [], weekly: ["weekday"], monthly: ["dayOfMonth"] };

const entier = (valeur: unknown, min: number, max: number) => typeof valeur === "number" && Number.isInteger(valeur) && valeur >= min && valeur <= max;

// Le rythme tel qu'il est écrit, vérifié ; lève `RecurrentInvalide` sinon.
export function rythmeDe(brut: unknown): Rythme {
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) throw new RecurrentInvalide("the rhythm is missing: expected {kind: daily | weekly | monthly}");
  const champs = brut as Record<string, unknown>;
  const { kind } = champs;
  if (kind !== "daily" && kind !== "weekly" && kind !== "monthly") throw new RecurrentInvalide(`unknown rhythm “${String(kind)}”: expected daily, weekly or monthly`);
  const superflus = Object.keys(champs).filter((cle) => cle !== "kind" && !CHAMPS[kind].includes(cle));
  if (superflus.length > 0) throw new RecurrentInvalide(`a ${kind} rhythm takes no ${superflus.join(", ")}`);
  if (kind === "daily") return { kind };
  if (kind === "weekly") {
    if (!entier(champs.weekday, 1, 7)) throw new RecurrentInvalide(`weekday ${String(champs.weekday)} is out of range: expected 1 (Monday) to 7 (Sunday)`);
    return { kind, weekday: champs.weekday as number };
  }
  if (!entier(champs.dayOfMonth, 1, 31)) throw new RecurrentInvalide(`day of month ${String(champs.dayOfMonth)} is out of range: expected 1 to 31`);
  return { kind, dayOfMonth: champs.dayOfMonth as number };
}

const JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;

// Le jour UTC d'un instant.
export function jourDe(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

// Vrai si `texte` est un jour `YYYY-MM-DD` qui existe.
export function estUnJour(texte: unknown): texte is string {
  return typeof texte === "string" && JOUR.test(texte) && jourDe(new Date(`${texte}T00:00:00Z`)) === texte;
}

const instantDu = (jour: string) => new Date(`${jour}T00:00:00Z`);
const dernierJourDuMois = (annee: number, mois: number) => new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
const leJour = (annee: number, mois: number, jour: number) => jourDe(new Date(Date.UTC(annee, mois, jour)));

// La première occurrence du rythme ce jour-là ou après.
export function occurrenceDesLe(rythme: Rythme, jour: string): string {
  const date = instantDu(jour);
  if (rythme.kind === "daily") return jour;
  if (rythme.kind === "weekly") {
    const iso = ((date.getUTCDay() + 6) % 7) + 1;
    return leJour(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + ((rythme.weekday - iso + 7) % 7));
  }
  const [annee, mois] = [date.getUTCFullYear(), date.getUTCMonth()];
  const ceMois = Math.min(rythme.dayOfMonth, dernierJourDuMois(annee, mois));
  if (ceMois >= date.getUTCDate()) return leJour(annee, mois, ceMois);
  return leJour(annee, mois + 1, Math.min(rythme.dayOfMonth, dernierJourDuMois(annee, mois + 1)));
}

// La première occurrence du rythme strictement après ce jour.
export function occurrenceApres(rythme: Rythme, jour: string): string {
  const date = instantDu(jour);
  return occurrenceDesLe(rythme, leJour(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}
