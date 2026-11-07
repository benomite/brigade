// La page de « parade », Kitchen > Health (#2491) : le chef a tapé une vérification de plus pour le closer et cliqué
// « add » — GitHub a écrit `.claude/brigade/closer-checks.md`, la ligne le dit et la vérification rejoint la liste.
import type { RenduDesVerifications } from "../../../app/src/closer-sante.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { KITCHEN, PLAFONDS_LUS } from "./projet-sante.ts";
import { CLOSER_LU } from "./projet-sante-closer.ts";
import { NORMAL } from "./projet-temps-commun.ts";

const AJOUTEE = "Tests that only exercise a removed export";
const RENDU: RenduDesVerifications = { fait: "added in the repository", liste: [...("liste" in CLOSER_LU.verifications ? CLOSER_LU.verifications.liste : []), AJOUTEE] };
const CHAMP = '[data-bloc="closer"] [data-partie="en-plus"] .champ.ajouter input';

export const ecran: Ecran = {
  dit: "L'espace de « parade », Kitchen > Health : une vérification ajoutée au closer (#2491)",
  largeur: 1440,
  hauteur: 1700,
  etapes: [OUVRIR, KITCHEN, { saisir: CHAMP, texte: AJOUTEE }, { cliquer: '[data-bloc="closer"] .ajouter-la-verification button' }],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: { enregistrements: NORMAL, lostTimeMaxMin: 2 } }, { plafondsDuree: PLAFONDS_LUS, closerDeSante: CLOSER_LU, changerVerificationDuCloser: RENDU }),
};
