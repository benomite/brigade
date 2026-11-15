// L'onglet Stations de « parade », cuit par la station de ce Mac (#3642) : elle cuit #14 et garde ce Mac éveillé tant
// qu'un cook cuit — sa carte le dit, sous ce qu'elle est.
import type { Faits } from "../../../app/src/faits.ts";
import type { Ecran, Rendu } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";
import { BOX, CONFIE, MAC, ongletDesStations } from "./stations-tab-commun.ts";

const PARADE = RENDUS.parade as Rendu;
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "macbook/claude" };
const ligne = { station: "macbook/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, presente: true, cooks: [COOK_14] };
const facts = { ...PARADE.facts, cooks: [COOK_14], stations: [ligne] } as unknown as Faits;

const onglet = ongletDesStations("L'onglet Stations de « parade », cuit par ce Mac, qui reste éveillé tant qu'un cook cuit : la ligne sur sa carte (#3642)", {
  stations: [{ ...BOX, projets: [] }, { ...MAC, ligne: "online · 1 project: parade", projets: ["parade"] }],
  projet: { ...CONFIE, suiviPar: { id: "gmac", nom: "macbook" }, stations: [{ id: "gmac", nom: "macbook", etat: "servi", dit: "served by macbook", autoriser: [] }], cuitSur: { id: "gmac", nom: "macbook", ici: true } } as never,
  ici: true,
  servisIci: ["chef/parade"],
  facts,
});

export const ecran: Ecran = {
  ...onglet,
  donnees: () => {
    const donnees = onglet.donnees();
    // Ce que la station de ce Mac écrit de sa veille (runtime/src/veille-machine/contrat.ts, `lireVeille`).
    return { ...donnees, reponses: { ...donnees.reponses, veilleMachine: { sorte: "mac", reglage: { garderEveille: true }, tenue: true } } };
  },
};
