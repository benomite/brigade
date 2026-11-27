// Ce qu'une carte prise ou en pass dit de ce que la cuisine en fait, et depuis quand (ticket 3923) : « running the tests · 20 s
// ago » ; en pass, l'étape où la pass en est quand le runtime la donne (« CI running · 45 s ago ») ; et « no activity yet »
// tant que le runtime n'en sait rien. Calculé par le process principal à chaque lecture de `facts` (facts.ts) : la carte
// suit la cuisine au rythme où l'app relit le tableau, sans rechargement.

export const NOT_STILL_OF_ACTIVITY = "no activity yet";

// L'activité d'un ticket telle que `facts` la donne (facts.ts, `Activite`) : `faitEn`, le geste en anglais — absent d'un
// runtime d'avant ce champ, dont le français ne passe jamais sur la carte ; `etape`, en pass, l'étape de la pass.
export type ActivityOfCard = { faitEn?: string; etape?: string; cible: string | null };

// Le geste et son âge (`duree`, déjà écrite) ; nul quand la carte n'en sait rien.
export function tellActivity(activity: ActivityOfCard | null | undefined, duration: string): string | null {
  const done = activity?.etape ?? activity?.faitEn;
  if (activity == null || done === undefined) return null;
  return `${activity.cible === null || activity.etape !== undefined ? done : `${done} ${activity.cible}`} · ${duration} ago`;
}
