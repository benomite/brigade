// L'histogramme du rail de « parade » (#1811), une barre touchée : la seule phrase qu'il porte, son heure et ses deux
// comptes. Les faits sont ceux de `rail-cadence` ; la barre est celle de 15:00, deux ratés.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { FACTS } from "./rail-cadence.ts";

const PARADE = RENDUS.parade as Rendu;

export const ecran: Ecran = {
  dit: "L'histogramme du rail de « parade », sa barre de 15:00 touchée : son heure, ses servis et ses ratés",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#rail .cadence > .survol:nth-child(5) > button" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
