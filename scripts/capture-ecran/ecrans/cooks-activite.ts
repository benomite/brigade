// L'onglet Cooks de « parade » et, en tête, ce que sa cuisine a fait de ses tickets (#1272) : servis, renvoyés à un
// cook, remontés au chef, dans la dernière heure et le dernier jour — six nombres. Les stations sont celles de
// `cooks-deux-stations` : la box cuit #14, le Mac arrêté par le chef y finit #15.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { FACTS as DEUX_STATIONS } from "./cooks-deux-stations.ts";

const PARADE = RENDUS.parade as Rendu;
export const FACTS: Faits = {
  ...DEUX_STATIONS,
  activiteCuisine: { lastHour: { served: 1, sentBack: 2, escalated: 0 }, lastDay: { served: 2, sentBack: 4, escalated: 1 } },
} as Faits;

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : en tête, ses tickets servis, renvoyés et remontés au chef dans la dernière heure et le dernier jour, puis ses deux stations",
  largeur: 1440,
  hauteur: 1000,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
