// Les deux pages que la ligne d'un projet en lecture seule ouvre (#3163, vue/lecture-seule/) : comment obtenir l'écriture
// sur le dépôt — c'est son propriétaire qui y invite —, ou le forker. Le process principal ne les ouvre que pour le dépôt
// que la dernière lecture du projet dit en lecture seule (tableau/lecture.ts, `lectureSeule`) : la vue ne donne pas
// d'adresse, seulement ce qu'elle veut ouvrir.
export const ACCES_EN_ECRITURE = "https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-access-to-your-personal-repositories/inviting-collaborators-to-a-personal-repository";

export type PageDeLaLectureSeule = "acces" | "fork";

const DEPOT = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

// L'adresse de la page demandée pour ce dépôt ; rien pour une demande ou un dépôt qui ne se lit pas.
export function pageDeLaLectureSeule(depot: unknown, quoi: unknown): string | undefined {
  if (typeof depot !== "string" || !DEPOT.test(depot)) return undefined;
  if (quoi === "acces") return ACCES_EN_ECRITURE;
  if (quoi === "fork") return `https://github.com/${depot}/fork`;
  return undefined;
}

// La page demandée pour le dépôt que ces faits — ceux de la dernière lecture d'un projet — disent en lecture seule ; rien
// quand ils ne le disent pas. Le desktop (main.ts) et le téléphone (lecture-github-telephone.ts) ouvrent par elle.
export function pageDesFaits(faits: { [champ: string]: unknown } | undefined, quoi: unknown): string | undefined {
  const seule = faits?.lectureSeule;
  return pageDeLaLectureSeule(typeof seule === "object" && seule !== null && "depot" in seule ? seule.depot : undefined, quoi);
}
