// Les réglages de « parade », le plafond `sonnet / high` proposé (#1309) : la PR est ouverte sur son dépôt, dite à côté
// du champ avec de quoi l'ouvrir ; la valeur en vigueur ne change pas — elle vaut une fois la PR mergée.
import { PROPOSE } from "../../../app/src/reglages-du-projet.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { LUS, OUVRIR, PLAFOND } from "./reglages-du-projet.ts";

export const ecran: Ecran = {
  dit: "Les réglages de « parade », le plafond `sonnet / high` proposé : « proposed as a pull request — it applies once merged » et le bouton de la PR #51, la valeur en vigueur inchangée",
  largeur: 1440,
  hauteur: 900,
  etapes: [...OUVRIR, { saisir: `${PLAFOND} select[aria-label$="model"]`, texte: "sonnet" }, { cliquer: `${PLAFOND} .proposer-le-reglage > button` }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], reglagesDuProjet: LUS, proposerUnReglage: { propose: PROPOSE, pr: "https://github.com/benomite/parade/pull/51", numero: 51 } },
    envois: cuisine(RENDUS),
  }),
};
