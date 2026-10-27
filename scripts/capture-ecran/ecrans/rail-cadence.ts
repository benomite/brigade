// Le rail de « parade » et, sur la ligne de « upcoming », à quelle allure sa cuisine sert (#1811) : l'histogramme des
// 24 dernières heures — servis en vert, ratés en rouge, une case vide par heure sans rien — et l'âge des cartes de
// Taken et de Pass. #14 est pris depuis 12 min, plus de deux fois les 5 min ordinaires : sa carte tranche ; #30, en pass
// depuis 4 min, sous ses 12 min ordinaires, non.
// Les faits sont ceux de la cuisine figée, avec ce que `facts` y ajoute : l'entrée de chaque ticket dans son état
// (`depuis`, d'après les lignes de `status`) et `cadence`. Les deux servis du jour sont ceux de Served (07:12, 10:03).
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const FAITS = PARADE.facts as Faits;
// L'entrée de chaque ticket dans son état, à l'horloge de la box — celle que `status` dit « since ».
const DEPUIS: Record<number, string> = {
  14: "2026-10-13T09:52:11.000Z",
  21: "2026-10-13T07:59:11.000Z",
  22: "2026-10-13T10:01:11.000Z",
  30: "2026-10-13T10:00:11.000Z",
  12: "2026-10-11T10:04:11.000Z",
};
// Les 24 heures piles, de 11:00 la veille à l'heure en cours : ce qui a été servi, et ce qui a raté.
const SERVIS: Record<number, number> = { 20: 1, 23: 1 };
const RATES: Record<number, number> = { 1: 1, 4: 2, 21: 1, 22: 2 };
const hours = Array.from({ length: 24 }, (_, rang) => ({
  at: new Date(Date.parse("2026-10-12T11:00:00.000Z") + rang * 3_600_000).toISOString(),
  served: SERVIS[rang] ?? 0,
  failed: RATES[rang] ?? 0,
}));

export const FACTS = {
  ...FAITS,
  rail: FAITS.rail.map((ticket) => ({ ...ticket, depuis: DEPUIS[ticket.ticket] })),
  cadence: { hours, medianSeconds: { taken: 300, pass: 720 } },
} as Faits;

export const ecran: Ecran = {
  dit: "Le rail de « parade » : sur la ligne de « upcoming », l'histogramme des 24 dernières heures, et l'âge des cartes de Taken et de Pass — #14, pris depuis plus de deux fois l'ordinaire, tranche",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
