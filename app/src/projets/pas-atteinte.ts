// La ligne d'une station ajoutée à un projet que sa principale dit pas atteinte (#1758) : la raison tient en deux
// mots sur la ligne, que le bouton « check again » (relire GitHub) accompagne ; le geste que la principale publie
// (runtime/src/projets/secondaires.ts) — ce que le chef fait sur l'autre ordinateur — se lit au survol. À défaut
// (une principale d'avant ce ticket), le plus sûr qui reste. Sans import : projets.ts se joue avant les dépendances.
export const PAS_ATTEINTE = "not reached";
export const GESTE_PAR_DEFAUT = "open Brigade on that computer";
export const gesteDePasAtteinte = (geste: string | undefined) => geste ?? GESTE_PAR_DEFAUT;
