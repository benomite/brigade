// « Tous les projets » avec « parade » dont le disjoncteur est ouvert (#3602) alors que son rail est aussi bloqué : sa ligne
// dit « held: breaker open », jamais « no manager takes ». Chaque ligne est celle que l'app tire de leurs `facts`.
import { lineOfProject, type Home } from "../../../app/src/home.ts";
import { understand, type Facts } from "../../../app/src/facts.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { RENDU_DISJONCTEUR } from "./rail-disjoncteur-commun.ts";

const RENDUS_RETENUS: Record<string, Rendu> = { ...RENDUS, parade: RENDU_DISJONCTEUR };
const ligne = (nom: string) => {
  const rendu = RENDUS_RETENUS[nom] as Rendu;
  const faits = understand(JSON.stringify(rendu.facts)) as Facts;
  return lineOfProject({ nom, servi: true }, { a: MAINTENANT, faits }, { texte: rendu.status });
};

export const ecran: Ecran = {
  dit: "« Tous les projets » : « parade » retenu par son disjoncteur, son rail aussi bloqué — « held: breaker open » ; « cantine » calme (#3602)",
  largeur: 1280,
  hauteur: 700,
  etapes: [],
  donnees: () => {
    const accueil: Home = { projets: [ligne("parade"), ligne("cantine")], stations: [], sante: { ton: "vert", dit: "", survol: "" } };
    return { maintenant: MAINTENANT, reponses: { demarrage: { ...demarrage(configuration(PROJETS)), accueil } }, envois: cuisine(RENDUS_RETENUS) };
  },
};
