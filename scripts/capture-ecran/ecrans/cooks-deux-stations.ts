// L'onglet Cooks de « parade » à deux stations (#1289) : la box cuit #14, le Mac, distant, arrêté par le chef y finit #15 —
// une ligne chacune, son nom, son bouton, qui n'agit que sur elle.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
const COOK_15 = { ticket: 15, titre: "La carte des desserts", station: "mac/claude" };
const station = { plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, arreteeDepuis: null, refus: null } as const;
export const FACTS: Faits = {
  ...PARADE.facts,
  compteurs: { ...PARADE.facts.compteurs, auTravail: 2 },
  rail: [
    ...PARADE.facts.rail.slice(0, 1),
    { ticket: 15, etat: "pris", titre: COOK_15.titre, url: issue(15), activite: null, attente: null },
    ...PARADE.facts.rail.slice(1),
  ],
  cooks: [COOK_14, COOK_15],
  stations: [
    { ...station, station: "box/claude", distante: false, cuisson: "cooking", cooks: [COOK_14] },
    { ...station, station: "mac/claude", distante: true, cuisson: "stopped", arreteeDepuis: "2026-10-13T09:52:00.000Z", cooks: [COOK_15] },
  ],
} as Faits;

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » à deux stations : une ligne chacune — la box cuit, le Mac arrêté y finit son cook —, et un bouton par station",
  largeur: 1440,
  hauteur: 1000,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
