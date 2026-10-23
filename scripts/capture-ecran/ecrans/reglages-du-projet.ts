// Les réglages de « parade » (Settings, General) et ceux de son projet, lus dans son dépôt (#1309) : sa branche
// d'intégration, les calibrages par défaut de son manager et de son reviewer, son plafond de calibrage — chacun sa
// valeur, d'où elle vient, et de quoi la changer. Le chef a choisi `sonnet` pour le plafond, sans l'avoir proposé.
import { reglagesVus } from "../../../app/src/reglages-du-projet.ts";
import { configuration, cuisine, demarrage, type Ecran, type Etape, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

// Ce que `setting` rend de la cuisine de parade.
export const LUS = {
  vus: reglagesVus(
    JSON.stringify({
      file: ".claude/brigade/projet.json",
      inRepository: true,
      integrationBranch: { value: "main", from: "repository" },
      defaultCalibrations: { manager: { model: "opus", effort: "high", from: "repository" }, reviewer: { model: "sonnet", effort: "medium", from: "station" } },
      calibrationCeiling: { model: "opus", effort: "high", from: "default" },
    }),
  ),
};

export const OUVRIR: Etape[] = [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets > button:first-child" }];
export const PLAFOND = '#reglages-du-projet .reglage[data-cle="plafond"]';

export const ecran: Ecran = {
  dit: "Les réglages de « parade » : ceux de son projet, lus dans son dépôt, chacun avec sa valeur, d'où elle vient et « propose » ; le plafond changé en `sonnet`, pas encore proposé",
  largeur: 1440,
  hauteur: 900,
  etapes: [...OUVRIR, { saisir: `${PLAFOND} select[aria-label$="model"]`, texte: "sonnet" }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], reglagesDuProjet: LUS }, envois: cuisine(RENDUS) }),
};
