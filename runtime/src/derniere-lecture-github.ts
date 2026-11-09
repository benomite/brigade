// La dernière bonne lecture de GitHub, projet par projet (#3005) : quand GitHub
// refuse une lecture — sa limite atteinte, une erreur de son côté, le réseau
// qui ne le joint pas —, ce qui a été lu avant se sert encore, avec son âge,
// au lieu de disparaître. Le jeton du chef épuisé effaçait le rail de chaque
// projet (#2994).
//
// Une lecture réussie remplace celle qu'elle retient. Un refus sert la
// dernière, `stale: true`, avec l'heure où elle a été lue (`readAt`) et le refus
// lui-même ; avant toute bonne lecture, il ne sert que le refus — `reading:
// null`, rien d'inventé. Les projets ne se mêlent pas : chacun garde la sienne.
// La mémoire est celle du process qui la tient ; rien ne s'écrit sur le disque.

export type LectureFraiche<L> = { reading: L; readAt: string; stale: false };
export type LectureServie<L, R> = { reading: L; readAt: string; stale: true; refusal: R } | { reading: null; refusal: R };

export type DernieresLectures<L, R> = {
  // Une lecture réussie de ce projet : elle devient la sienne, lue à l'instant.
  reussie(projet: string, lecture: L): LectureFraiche<L>;
  // GitHub refuse la lecture de ce projet : sa dernière bonne lecture, s'il en a une.
  refusee(projet: string, refus: R): LectureServie<L, R>;
};

export function tenirDernieresLectures<L, R>(options: { maintenant?: () => Date } = {}): DernieresLectures<L, R> {
  const maintenant = options.maintenant ?? (() => new Date());
  const bonnes = new Map<string, { reading: L; readAt: string }>();
  return {
    reussie(projet, lecture) {
      const bonne = { reading: lecture, readAt: maintenant().toISOString() };
      bonnes.set(projet, bonne);
      return { ...bonne, stale: false };
    },
    refusee(projet, refus) {
      const bonne = bonnes.get(projet);
      return bonne === undefined ? { reading: null, refusal: refus } : { ...bonne, stale: true, refusal: refus };
    },
  };
}
