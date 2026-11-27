// « Tous les projets » pendant une pause de quota GitHub du compte (#3482, pause-quota-commun.ts) : « parade » en pause,
// « cantine » calme — chaque ligne est celle que l'app tire de leurs `facts` (app/src/home.ts, `ligneDeProjet`).
import { lineOfProject, type Home } from "../../../app/src/home.ts";
import { understand, type Facts } from "../../../app/src/facts.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { RENDU_EN_PAUSE } from "./pause-quota-commun.ts";

const EN_PAUSE: Record<string, Rendu> = { ...RENDUS, parade: RENDU_EN_PAUSE };
const ligne = (nom: string) => {
  const rendu = EN_PAUSE[nom] as Rendu;
  const faits = understand(JSON.stringify(rendu.facts)) as Facts;
  return lineOfProject({ nom, servi: true }, { a: MAINTENANT, faits }, { texte: rendu.status });
};

export const ecran: Ecran = {
  dit: "« Tous les projets » pendant une pause de quota GitHub du compte : « parade » en pause, « cantine » calme (#3482)",
  largeur: 1280,
  hauteur: 700,
  etapes: [],
  donnees: () => {
    const accueil: Home = { projets: [ligne("parade"), ligne("cantine")], stations: [], sante: { ton: "vert", dit: "", survol: "" } };
    return { maintenant: MAINTENANT, reponses: { demarrage: { ...demarrage(configuration(PROJETS)), accueil } }, envois: cuisine(EN_PAUSE) };
  },
};
