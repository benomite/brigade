// L'onglet Cooks de « parade » sur toute sa hauteur, quand il n'a rien à dire (#1456) : aucun ticket
// servi, renvoyé ou remonté du dernier jour, aucun passage de gates, ni leçon ni profil. Chacun de ces blocs tient en
// une ligne, sans tableau de zéros ; les blocs repliés restent fermés.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { FACTS as PAGE, STATUS } from "./cooks-page.ts";
import { FACTS as SANS_PASSAGE } from "./cooks-gates-sans-passage.ts";

const PARADE = RENDUS.parade as Rendu;
const ZERO = { served: 0, sentBack: 0, escalated: 0 };

export const FACTS: Faits = {
  ...PAGE,
  activiteCuisine: { lastHour: ZERO, lastDay: ZERO },
  coutDesGates: SANS_PASSAGE.coutDesGates,
  apprentissage: { lecons: [], profils: [] },
} as Faits;

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » sur toute sa hauteur, sans rien à dire : ses tickets, ses gates et ce que ses cooks ont appris tiennent chacun en une ligne",
  largeur: 1366,
  hauteur: 1100,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS, status: STATUS } }),
  }),
};
