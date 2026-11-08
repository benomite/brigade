// Scène 4 de la démo (ticket 2875) : l'onglet Stations de « parade », sa seule station, la box, qui cuit #21.
import type { Faits } from "../../../app/src/faits.ts";
import type { Ecran } from "./commun.ts";
import { donneesDe, OUVRIR_PARADE, PRIS } from "./demo-commun.ts";

const station = { plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, arreteeDepuis: null, refus: null } as const;
const FACTS = { ...PRIS.facts, stations: [{ ...station, station: "box/claude", distante: false, cuisson: "cooking", cooks: PRIS.facts.cooks }] } as Faits;

export const ecran: Ecran = {
  dit: "La démo, scène 4 : l'onglet Stations de « parade », la box cuit #21",
  largeur: 1440,
  hauteur: 430,
  etapes: [OUVRIR_PARADE, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => donneesDe({ ...PRIS, facts: FACTS }),
};
