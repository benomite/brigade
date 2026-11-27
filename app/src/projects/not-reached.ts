// La ligne d'une station ajoutée à un projet que sa principale dit pas atteinte (#1758) : la raison tient en deux
// mots sur la ligne, que le bouton « check again » (relire GitHub) accompagne ; le geste que la principale publie
// (l'ancien runtime/src/projets/secondaires.ts, retiré par #2713) — ce que le chef fait sur l'autre ordinateur — se lit au survol. À défaut
// (une principale d'avant ce ticket), le plus sûr qui reste. Sans import : projects.ts se joue avant les dépendances.
export const NOT_REACHED = "not reached";
export const ACTION_PAR_DEFAULT = "open Brigade on that computer";
export const actionOfNotReached = (action: string | undefined) => action ?? ACTION_PAR_DEFAULT;
