// La même file sur un écran de téléphone, #24 (`prio:2`) soulevé par un appui long et mené au-dessus de #23 (`prio:1`) :
// la carte grossit, une ombre la détache, et le trait d'accent dit qu'elle atterrira juste avant #23 (ticket 1348).
import type { Ecran } from "./commun.ts";
import { CARTE, FILE as file } from "./rail-file-commun.ts";

export const LARGEUR = 412;
export const HAUTEUR = 915;

export const ecran: Ecran = {
  ...file,
  dit: "La même file sur un téléphone, #24 soulevé par un appui long et mené au-dessus de #23 : la carte est détachée, un trait dit qu'elle atterrira juste avant #23",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [...file.etapes, { soulever: CARTE(4), vers: CARTE(2) }],
};
