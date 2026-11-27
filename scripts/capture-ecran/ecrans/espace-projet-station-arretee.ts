// L'espace d'un projet qui cuit sur ce Mac quand la station de ce Mac ne tourne pas (#1124) :
// « parade » n'a rien à lire — la page le dit en une ligne, au lieu de rester vide.
// « cantine », sur sa box, n'est pas concerné.
import type { Terminal } from "../../../app/src/terminaux.ts";
import { configuration, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS } from "./cuisine-figee.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris : la session d'hier", arrete: false };

export const ecran: Ecran = {
  dit: "L'espace de « parade », qui cuit sur ce Mac, la station de ce Mac arrêtée (#1124) : une ligne le dit, ni rail ni cartes",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade"]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS), (nom) => nom === "parade", false), espace: [SECOND] },
    envois: { regarder: {} },
  }),
};
