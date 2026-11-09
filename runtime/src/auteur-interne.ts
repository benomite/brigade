// Le robot du projet n'est pas un inconnu (#3088) : l'issue que son propre workflow ouvre
// (« publier-app: app-v1.0.185 was not published… », #3084) est un fait technique pour la
// cuisine, pas une décision de produit pour le chef. Ce module dit si l'auteur d'une issue est
// ce robot ; `github-etat/auteur.ts` s'en sert pour ne pas classer l'issue parmi celles d'un
// inconnu, et le manager la juge alors comme tout ticket technique.
//
// GitHub montre le compte sous `github-actions[bot]` (REST) ou `github-actions` (GraphQL),
// sans distinguer la casse.
const ROBOT_DU_PROJET = "github-actions";

export const auteurInterne = (auteur: string | undefined): boolean => {
  if (auteur === undefined) return false;
  const login = auteur.toLowerCase();
  return login === ROBOT_DU_PROJET || login === `${ROBOT_DU_PROJET}[bot]`;
};
