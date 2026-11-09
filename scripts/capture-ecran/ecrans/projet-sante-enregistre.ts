// La page de « parade », le bandeau de santé de Rail (#2490, #2920) : le chef a tapé 150 dans la durée des gates et quitté
// le champ — le réglage s'applique à son `change`, sans « save ». Gardé dans le dépôt, il s'y propose par une pull
// request : la rangée la dit, son lien l'ouvre, et la valeur montrée reste celle en vigueur jusqu'au merge.
import type { RenduDuPlafond } from "../../../app/src/plafonds-duree.ts";
import { PROPOSE } from "../../../app/src/reglages-du-projet.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { PLAFONDS_LUS } from "./projet-sante.ts";
import { NORMAL } from "./projet-temps-commun.ts";

const PROPOSE_PAR_PR: RenduDuPlafond = { propose: PROPOSE, pr: "https://github.com/chef/parade/pull/2612", numero: 2612, cle: "gatesSeconds", valeur: 150 };
// Les plafonds sont repliés derrière une ligne du bandeau : le chef la déplie d'abord.
const DEPLIER = { cliquer: "#bandeau-sante > details > summary" };
const CHAMP = '[data-bloc="plafonds-duree"] .reglage[data-cle="gatesSeconds"] input';

export const ecran: Ecran = {
  dit: "L'espace de « parade », le bandeau de santé de Rail : un plafond de durée changé, proposé par une pull request (#2490, #2920)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, DEPLIER, { saisir: CHAMP, texte: "150", valider: true }, { defiler: `[data-bloc="plafonds-duree"] .reglage[data-cle="testsSeconds"]` }],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: { enregistrements: NORMAL, lostTimeMaxMin: 2 } }, { plafondsDuree: PLAFONDS_LUS, changerPlafondDuree: PROPOSE_PAR_PR }),
};
