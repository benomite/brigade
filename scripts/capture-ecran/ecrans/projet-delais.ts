// Le rail de « parade » et ses dernières 24 heures (#4309, épique #4298) : 20 des 24 tickets fusionnés dans leur temps
// attendu, et les trois pires dépassements, le pire d'abord — l'objet `delais` tel que `brigade <project> status --json`
// le rend.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

const pire = (ticket: number, titre: string, attendu_min: number, reel_min: number, repartition_min: object) => ({ ticket, titre, attendu_min, reel_min, modele: "opus", effort: "medium", repartition_min });
export const DELAIS = {
  fenetre_heures: 24,
  fusionnes: 24,
  dans_les_temps: 20,
  part_dans_les_temps: 20 / 24,
  sans_temps_attendu: 0,
  pires_depassements: [
    pire(41, "Le journal en ajout seul", 10, 91, { cook: 31, gates: 7, review: 12, renvois: 37, attentes: 4 }),
    pire(38, "Validation SIRET", 20, 52, { cook: 21, gates: 5, review: 9, renvois: 13, attentes: 4 }),
    pire(35, "La pass verte", 30, 47, { cook: 25, gates: 6, review: 8, renvois: 3, attentes: 5 }),
  ],
};

export const ecran: Ecran = {
  dit: "Le rail de « parade » : ses dernières 24 heures — 83 % des tickets fusionnés dans leur temps (20/24), et les pires dépassements, le pire d'abord (#4309)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: () => donnees({ ...SUR_LA_BOX, delais: DELAIS }),
};
