// « Tous les projets » avec « parade », sa station arrêtée (rail-station-arretee-commun.ts), et « cantine » calme : chaque ligne
// est celle que l'app tire de leurs `facts` (app/src/accueil.ts, `ligneDeProjet`).
import { ligneDeProjet, type Accueil } from "../../../app/src/accueil.ts";
import { comprendre, type Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { RENDU_STATION_ARRETEE } from "./rail-station-arretee-commun.ts";

const RENDUS_ARRETES: Record<string, Rendu> = { ...RENDUS, parade: RENDU_STATION_ARRETEE };
const ligne = (nom: string) => {
  const rendu = RENDUS_ARRETES[nom] as Rendu;
  const faits = comprendre(JSON.stringify(rendu.facts)) as Faits;
  return ligneDeProjet({ nom, servi: true }, { a: MAINTENANT, faits }, { texte: rendu.status });
};

export const ecran: Ecran = {
  dit: "« Tous les projets » : « parade », huit tickets en file depuis 14 h et sa station arrêtée, « cantine » calme",
  largeur: 1280,
  hauteur: 700,
  etapes: [],
  donnees: () => {
    const accueil: Accueil = { projets: [ligne("parade"), ligne("cantine")], stations: [], sante: { ton: "vert", dit: "", survol: "" } };
    return { maintenant: MAINTENANT, reponses: { demarrage: { ...demarrage(configuration(PROJETS)), accueil } }, envois: cuisine(RENDUS_ARRETES) };
  },
};
