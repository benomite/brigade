// « Tous les projets » avec « parade » au rail bloqué (#3358, rail-bloque-commun.ts) et « cantine » calme : chaque ligne
// est celle que l'app tire de leurs `facts` (app/src/home.ts, `ligneDeProjet`).
import { lineDeProject, type Home } from "../../../app/src/home.ts";
import { comprendre, type Facts } from "../../../app/src/facts.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { RENDU_BLOQUE } from "./rail-bloque-commun.ts";

const RENDUS_BLOQUES: Record<string, Rendu> = { ...RENDUS, parade: RENDU_BLOQUE };
const ligne = (nom: string) => {
  const rendu = RENDUS_BLOQUES[nom] as Rendu;
  const faits = comprendre(JSON.stringify(rendu.facts)) as Facts;
  return lineDeProject({ nom, servi: true }, { a: MAINTENANT, faits }, { texte: rendu.status });
};

export const ecran: Ecran = {
  dit: "« Tous les projets » : « parade » au rail bloqué — huit tickets qu'aucun manager n'a pris depuis 14 h —, « cantine » calme (#3358)",
  largeur: 1280,
  hauteur: 700,
  etapes: [],
  donnees: () => {
    const accueil: Home = { projets: [ligne("parade"), ligne("cantine")], stations: [], sante: { ton: "vert", dit: "", survol: "" } };
    return { maintenant: MAINTENANT, reponses: { demarrage: { ...demarrage(configuration(PROJETS)), accueil } }, envois: cuisine(RENDUS_BLOQUES) };
  },
};
