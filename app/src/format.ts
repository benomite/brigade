// Le format des nombres et des heures de l'app, à un seul endroit : l'anglais américain
// (« 1,234.5 », « 3:04:05 PM »), sur tous les écrans. Aucun autre fichier ne choisit de locale.
const LOCALE = "en-US";

export const nombre = (valeur: number): string => valeur.toLocaleString(LOCALE);

export const heure = (instant: number | string | Date): string => new Date(instant).toLocaleTimeString(LOCALE);

export const dateHeure = (instant: number | string | Date): string => new Date(instant).toLocaleString(LOCALE);

export const majuscules = (texte: string): string => texte.toLocaleUpperCase(LOCALE);

// L'heure locale en 24 h, « 14:32 » : celle des lignes qui annoncent une reprise.
export const heureHM = (instant: number | string | Date): string => {
  const d = new Date(instant);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// L'heure sans ses secondes (« 3:16 PM ») : celle qu'on annonce, pas celle qu'on a lue.
export const heureCourte = (instant: number | string | Date): string => new Date(instant).toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" });
