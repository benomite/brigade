// L'onglet Cooks de « parade » quand sa box ne déclare aucune station (#1509) : la ligne qui le dit, à la place d'un blanc.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { guide } from "./cooks-stations-declarees.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade », sa box ne déclarant aucune station : une ligne le dit",
  largeur: 1440,
  hauteur: 1000,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], service: guide({ proposees: [{ nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"] }], absent: null, declarees: [] }) },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: { ...PARADE.facts, stations: [] } } }),
  }),
};
