// Les deux pages que la ligne d'un projet en lecture seule ouvre (#3163, vue/read-only/) : comment obtenir l'écriture
// sur le dépôt — c'est son propriétaire qui y invite —, ou le forker. Le process principal ne les ouvre que pour le dépôt
// que la dernière lecture du projet dit en lecture seule (board/read.ts, `lectureSeule`) : la vue ne donne pas
// d'adresse, seulement ce qu'elle veut ouvrir.
export const ACCESS_EN_WRITING = "https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-access-to-your-personal-repositories/inviting-collaborators-to-a-personal-repository";

export type PageOfTheReadOnly = "acces" | "fork";

const REPOSITORY = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

// L'adresse de la page demandée pour ce dépôt ; rien pour une demande ou un dépôt qui ne se lit pas.
export function pageOfTheReadOnly(repository: unknown, what: unknown): string | undefined {
  if (typeof repository !== "string" || !REPOSITORY.test(repository)) return undefined;
  if (what === "acces") return ACCESS_EN_WRITING;
  if (what === "fork") return `https://github.com/${repository}/fork`;
  return undefined;
}

// La page demandée pour le dépôt que ces faits — ceux de la dernière lecture d'un projet — disent en lecture seule ; rien
// quand ils ne le disent pas. Le desktop (main.ts) et le téléphone (read-github-phone.ts) ouvrent par elle.
export function pageOfFacts(facts: { [field: string]: unknown } | undefined, what: unknown): string | undefined {
  const only = facts?.lectureSeule;
  return pageOfTheReadOnly(typeof only === "object" && only !== null && "depot" in only ? only.depot : undefined, what);
}
