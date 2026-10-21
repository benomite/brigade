// La page de « parade », qui cuit sur l'ordinateur où l'app tourne — un PC sous Windows (#1154) :
// « Cooks on this PC », sa cuisine qui s'arrête avec l'app, et « move the kitchen » ouvert. Le même
// écran que `demenager-sur-ce-mac` : seul le nom de ce poste change, tel que main.ts le rend (`poste`).
import type { Ecran } from "./commun.ts";
import { DEMENAGER, donnees, OUVRIR, SUR_CE_MAC } from "./cuisine-demenagee.ts";

const SOUS_WINDOWS = { nom: "this PC", mac: false };

export const ecran: Ecran = {
  dit: "L'espace de « parade », qui cuit sur ce PC sous Windows : « Cooks on this PC », la box recommandée pour l'y ramener (#1154)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, DEMENAGER],
  donnees: () => {
    const rendues = donnees(SUR_CE_MAC);
    return { ...rendues, reponses: { ...rendues.reponses, demarrage: { ...(rendues.reponses.demarrage as object), poste: SOUS_WINDOWS } } };
  },
};
