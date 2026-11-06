// Le seuil du `hors-cuisine` : un ticket ne sort de la cuisine qu'après le même
// motif d'arrêt trois fois de suite, et jamais pour un désaccord avec la relecture (#2593).

export const ARRETS_MAX = 3;

export type Arret = { motif: string; desaccord: boolean };

const norme = (motif: string): string => motif.trim().replace(/\s+/g, " ").toLowerCase();

// `arrets` : du plus ancien au plus récent. Seuls les `ARRETS_MAX` derniers comptent.
export function horsCuisine(arrets: readonly Arret[]): boolean {
  if (arrets.length < ARRETS_MAX) return false;
  const derniers = arrets.slice(-ARRETS_MAX);
  const [premier] = derniers;
  if (derniers.some((arret) => arret.desaccord)) return false;
  return derniers.every((arret) => norme(arret.motif) === norme(premier!.motif));
}
