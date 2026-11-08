// Les instants et les durées que le chef tape et que la cuisine lui redit :
// une durée tapée, une date locale, un instant en UTC avec son fuseau en lettres.
const HEURE_MS = 3_600_000;

const DUREES: Array<[RegExp, (trouve: RegExpExecArray) => number]> = [
  // `2d`, et `2j` — l'ancien mot, que le chef a encore dans les doigts.
  [/^([0-9]+)[dj]$/, ([, jours]) => Number(jours) * 24 * HEURE_MS],
  [/^([0-9]+)h([0-5][0-9])?$/, ([, heures, minutes]) => Number(heures) * HEURE_MS + Number(minutes ?? 0) * 60_000],
  [/^([0-9]+)min$/, ([, minutes]) => Number(minutes) * 60_000],
];

// Une date du calendrier local, ou rien si elle n'existe pas (le 31 février).
export function dateLocale(annee: number, mois: number, jour: number, heure: number, minute: number, seconde = 0): Date | null {
  const date = new Date(annee, mois - 1, jour, heure, minute, seconde);
  return date.getFullYear() === annee && date.getMonth() === mois - 1 && date.getDate() === jour && date.getHours() === heure && date.getMinutes() === minute ? date : null;
}

// Une durée tapée (30min, 4h, 1h30, 2d, or 2j), en millisecondes — ou rien si elle
// ne se lit pas, ou ne dure rien.
export function dureeTapee(valeur: string): number | null {
  for (const [forme, enMs] of DUREES) {
    const trouve = forme.exec(valeur);
    if (trouve && enMs(trouve) > 0) return enMs(trouve);
  }
  return null;
}

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

// Un instant, avec son fuseau en lettres : « 12 oct. 19:20 UTC ».
// La box est en UTC et ne connaît pas le fuseau du chef : un `Z` collé à un
// horodatage ISO se lit comme une heure locale, « UTC » écrit ne se lit pas ainsi.
export function direInstant(iso: string): string {
  const d = new Date(iso);
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${deux(d.getUTCHours())}:${deux(d.getUTCMinutes())} UTC`;
}

const MOIS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Le même instant, en anglais : « 12 Oct 19:20 UTC ».
export function direInstantEn(iso: string): string {
  const d = new Date(iso);
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MOIS_EN[d.getUTCMonth()]} ${deux(d.getUTCHours())}:${deux(d.getUTCMinutes())} UTC`;
}
