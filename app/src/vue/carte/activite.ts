// Ce qu'une carte prise ou en pass dit de ce que la cuisine en fait, et depuis quand (ticket 3923) : « running the tests · 20 s
// ago » ; en pass, l'étape où la pass en est quand le runtime la donne (« CI running · 45 s ago ») ; et « no activity yet »
// tant que le runtime n'en sait rien. Calculé par le process principal à chaque lecture de `facts` (faits.ts) : la carte
// suit la cuisine au rythme où l'app relit le tableau, sans rechargement.

export const PAS_ENCORE_D_ACTIVITE = "no activity yet";

// L'activité d'un ticket telle que `facts` la donne (faits.ts, `Activite`) : `faitEn`, le geste en anglais — absent d'un
// runtime d'avant ce champ, dont le français ne passe jamais sur la carte ; `etape`, en pass, l'étape de la pass.
export type ActiviteDeCarte = { faitEn?: string; etape?: string; cible: string | null };

// Le geste et son âge (`duree`, déjà écrite) ; nul quand la carte n'en sait rien.
export function direActivite(activite: ActiviteDeCarte | null | undefined, duree: string): string | null {
  const fait = activite?.etape ?? activite?.faitEn;
  if (activite == null || fait === undefined) return null;
  return `${activite.cible === null || activite.etape !== undefined ? fait : `${fait} ${activite.cible}`} · ${duree} ago`;
}
