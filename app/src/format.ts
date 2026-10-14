// Le format des nombres et des heures de l'app, à un seul endroit : l'anglais américain
// (« 1,234.5 », « 3:04:05 PM »), sur tous les écrans. Aucun autre fichier ne choisit de locale.
const LOCALE = "en-US";

export const nombre = (valeur: number): string => valeur.toLocaleString(LOCALE);

export const heure = (instant: number | string | Date): string => new Date(instant).toLocaleTimeString(LOCALE);

export const dateHeure = (instant: number | string | Date): string => new Date(instant).toLocaleString(LOCALE);

export const majuscules = (texte: string): string => texte.toLocaleUpperCase(LOCALE);
