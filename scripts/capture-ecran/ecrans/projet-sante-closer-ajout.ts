// La page de « parade », le bandeau de santé dans Settings (#2491, #2920, #3014) : le chef a tapé une vérification de plus pour le closer
// et cliqué « add » — l'ajout à `.claude/brigade/closer-checks.md` est proposé par une pull request, que la partie dit et
// ouvre ; la liste reste celle en vigueur jusqu'au merge.
import type { RenduDesVerifications } from "../../../app/src/closer-sante.ts";
import { PROPOSE } from "../../../app/src/reglages-du-projet.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { PLAFONDS_LUS, SETTINGS } from "./projet-sante.ts";
import { CLOSER_LU } from "./projet-sante-closer.ts";
import { NORMAL } from "./projet-temps-commun.ts";

const AJOUTEE = "Tests that only exercise a removed export";
const RENDU: RenduDesVerifications = {
  propose: PROPOSE,
  pr: "https://github.com/chef/parade/pull/2613",
  numero: 2613,
  geste: "ajouter",
  verification: AJOUTEE,
  liste: "liste" in CLOSER_LU.verifications ? CLOSER_LU.verifications.liste : [],
};
const CHAMP = '[data-bloc="closer"] [data-partie="en-plus"] .champ.ajouter input';

export const ecran: Ecran = {
  dit: "L'espace de « parade », le bandeau de santé de Settings : une vérification ajoutée au closer, proposée par une pull request (#2491, #2920)",
  largeur: 1440,
  hauteur: 1700,
  // Le closer est dans la section de Settings : le chef ouvre Settings, puis la partie est amenée à l'écran.
  etapes: [
    OUVRIR,
    SETTINGS,
    { saisir: CHAMP, texte: AJOUTEE },
    { cliquer: '[data-bloc="closer"] .ajouter-la-verification button' },
    { defiler: '[data-bloc="closer"] [data-partie="en-plus"]' },
  ],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: { enregistrements: NORMAL, lostTimeMaxMin: 2 } }, { plafondsDuree: PLAFONDS_LUS, closerDeSante: CLOSER_LU, changerVerificationDuCloser: RENDU }),
};
