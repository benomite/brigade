// « Tous les projets » pendant une pause de quota GitHub du compte (#3482, pause-quota-commun.ts) : « parade » en pause,
// « cantine » calme — chaque ligne est celle que l'app tire de leurs `facts` (app/src/accueil.ts, `ligneDeProjet`).
import { ligneDeProjet, type Accueil } from "../../../app/src/accueil.ts";
import { comprendre, type Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { RENDU_EN_PAUSE } from "./pause-quota-commun.ts";

const EN_PAUSE: Record<string, Rendu> = { ...RENDUS, parade: RENDU_EN_PAUSE };
const ligne = (nom: string) => {
  const rendu = EN_PAUSE[nom] as Rendu;
  const faits = comprendre(JSON.stringify(rendu.facts)) as Faits;
  return ligneDeProjet({ nom, servi: true }, { a: MAINTENANT, faits }, { texte: rendu.status });
};

export const ecran: Ecran = {
  dit: "« Tous les projets » pendant une pause de quota GitHub du compte : « parade » en pause, « cantine » calme (#3482)",
  largeur: 1280,
  hauteur: 700,
  etapes: [],
  donnees: () => {
    const accueil: Accueil = { projets: [ligne("parade"), ligne("cantine")], stations: [], sante: { ton: "vert", dit: "", survol: "" } };
    return { maintenant: MAINTENANT, reponses: { demarrage: { ...demarrage(configuration(PROJETS)), accueil } }, envois: cuisine(EN_PAUSE) };
  },
};
