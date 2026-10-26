// La phrase de la ligne d'une station ajoutée à un projet que sa principale dit pas atteinte (#1758) : le geste est
// celui que la principale publie (runtime/src/projets/secondaires.ts) — à défaut (une principale d'avant ce ticket), le
// plus sûr qui reste. Voir aussi stations/raison.ts, pour les stations que l'app lit elle-même.
export const GESTE_PAR_DEFAUT = "open Brigade on that computer";
export const pasAtteinte = (geste: string | undefined) => `not reached — ${geste ?? GESTE_PAR_DEFAUT}`;
