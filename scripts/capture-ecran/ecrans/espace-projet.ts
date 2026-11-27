// L'espace d'un projet : le rail au centre, son second à droite — « parade », ouvert par sa case
// dans la barre.
import type { Terminal } from "../../../app/src/terminaux.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "fil repris : la session d'hier", arrete: false };
// Ce que le second affiche : un écran de `claude` qui attend, pas un vrai.
const ECRAN_DU_SECOND = ["\x1b[1msecond · parade\x1b[0m", "", "  /brigade:second — rail lu à 10:04", "", "\x1b[2m> \x1b[0m"].join("\r\n");

export const ecran: Ecran = {
  dit: "L'espace de « parade » : son rail en colonnes, sa bande d'alertes, son second à droite",
  largeur: 1440,
  hauteur: 900,
  // La case porte le nom du projet, puis son état : « parade — ouverte ».
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => {
    const envois = cuisine(RENDUS);
    return {
      maintenant: MAINTENANT,
      reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
      envois: { ...envois, regarder: { ...envois.regarder, parade: [...(envois.regarder.parade ?? []), { sur: "surSortie", args: [SECOND.id, ECRAN_DU_SECOND] }] } },
    };
  },
};
