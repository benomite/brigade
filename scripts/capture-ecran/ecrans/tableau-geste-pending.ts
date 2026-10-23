// Le merge de #12 confirmé, sur un poste sans `ssh` ni station (#1590) : posté en commentaire sur le tableau, la ligne
// dit « merge the PR: pending » — la box ne l'a pas encore lu — et n'offre plus ses décisions.
import { CONFIRMER, espaceDuTableau, LU, MERGER_LA_PREMIERE, POSTE } from "./tableau-commun.ts";

export const ecran = espaceDuTableau("Le merge de #12 posté sur le tableau de « parade » (#1590) : la ligne dit « pending »", LU, { box: false, etapes: [MERGER_LA_PREMIERE, CONFIRMER], geste: POSTE });
