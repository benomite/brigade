// Les réglages de « parade », le plafond `sonnet / high` proposé (#1309) : choisir `sonnet` dans sa liste le propose
// aussitôt, sans bouton (#2920). La PR est ouverte sur son dépôt, dite sous la rangée avec de quoi l'ouvrir ; la valeur
// en vigueur ne change pas — elle vaut une fois la PR mergée.
import { PROPOSE } from "../../../app/src/reglages-du-projet.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { LUS, OUVRIR, PLAFOND } from "./reglages-du-projet.ts";

export const ecran: Ecran = {
  dit: "Les réglages de « parade », le plafond `sonnet / high` proposé dès son choix : « sonnet / high proposed in » et le bouton « pull request #51 » sous la rangée, la valeur en vigueur inchangée",
  largeur: 1440,
  hauteur: 900,
  etapes: [...OUVRIR, { saisir: `${PLAFOND} select[aria-label$="model"]`, texte: "sonnet" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], reglagesDuProjet: LUS, proposerUnReglage: { propose: PROPOSE, pr: "https://github.com/benomite/parade/pull/51", numero: 51 } },
    envois: cuisine(RENDUS),
  }),
};
