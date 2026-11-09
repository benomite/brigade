// Le seuil du `served-elsewhere` : un ticket sort de la cuisine après trois arrêts de suite,
// quel qu'en soit le motif, ou dès que deux arrêts de suite ont le même motif (#2729).
// Jamais pour un désaccord avec la relecture (#2593).

export const ARRETS_MAX = 3;
export const MEME_MOTIF_MAX = 2;

export type Arret = { motif: string; desaccord: boolean };

const norme = (motif: string): string => motif.trim().replace(/\s+/g, " ").toLowerCase();

// `arrets` : du plus ancien au plus récent. Seuls les derniers comptent.
export function horsCuisine(arrets: readonly Arret[]): boolean {
  const memes = arrets.slice(-MEME_MOTIF_MAX);
  if (memes.length === MEME_MOTIF_MAX && !memes.some((arret) => arret.desaccord) && memes.every((arret) => norme(arret.motif) === norme(memes[0]!.motif))) return true;
  if (arrets.length < ARRETS_MAX) return false;
  return !arrets.slice(-ARRETS_MAX).some((arret) => arret.desaccord);
}
