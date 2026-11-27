// La même section (#1778), sans aucune station : ni appairée — leur lecture sur GitHub n'en rend aucune —, ni enregistrée
// sous le compte. L'absence se dit une fois, avec la commande d'installation de chaque système.
import { type Home } from "../../../app/src/home.ts";
import type { StationsOfAccount } from "../../../app/src/stations-of-account.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const AUCUNE: StationsOfAccount = { state: "listed", stations: [], unreadable: [], reason: "No station is registered under this GitHub account yet." };

export const ecran: Ecran = {
  dit: "Les stations du chef, aucune (#1778) : ni appairée, ni enregistrée sous le compte GitHub — la phrase, et la commande d'installation de chaque système",
  largeur: 1440,
  hauteur: 900,
  etapes: [],
  donnees: () => {
    const accueil: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
    return { maintenant: MAINTENANT, reponses: { demarrage: { ...demarrage(configuration(PROJETS)), stations: { a: MAINTENANT, stations: [] }, accueil }, stationsDuCompte: AUCUNE }, envois: cuisine(RENDUS) };
  },
};
