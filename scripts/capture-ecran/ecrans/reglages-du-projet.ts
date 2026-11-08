// Les réglages de « parade » (Settings, General) et ceux de son projet, lus dans son dépôt (#1309) : sa branche
// d'intégration, les calibrages par défaut de son manager et de son reviewer, son plafond de calibrage, les réglages de
// son closer (#1685) — chacun la rangée de réglage (#2920) : sa valeur, d'où elle vient, de quoi la changer, et la ligne
// qui dit qu'un changement ouvre une PR. Le chef écrit `develop` dans la branche, sans l'avoir validé : rien n'est
// proposé tant que le champ n'est pas quitté.
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
      closer: {
        calibration: { model: "sonnet", effort: "medium", from: "repository" },
        cooksBelow: { value: 1, from: "default" },
        maxTokens: { value: 200000, from: "repository" },
        maxRemovedLines: { value: 500, from: "station" },
      },
    }),
  ),
};

export const OUVRIR: Etape[] = [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(3)" }];
export const PLAFOND = '#reglages-du-projet .reglage[data-cle="plafond"]';
export const BRANCHE = '#reglages-du-projet .reglage[data-cle="branche"]';

export const ecran: Ecran = {
  dit: "Les réglages de « parade » : ceux de son projet, lus dans son dépôt, chacun avec sa valeur, d'où elle vient, son champ et « a change opens a pull request, applied once merged », sans bouton ; `develop` écrit dans la branche, pas encore validé",
  largeur: 1440,
  hauteur: 900,
  etapes: [...OUVRIR, { saisir: `${BRANCHE} input`, texte: "develop" }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], reglagesDuProjet: LUS }, envois: cuisine(RENDUS) }),
};
