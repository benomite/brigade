// La page de « parade », confiée à sa box, pendant son onboarding (#1111) : le parcours en quatre
// étapes sous la ligne de ses stations, la préparation du dépôt en échec — sa raison, l'heure de son
// prochain essai —, son ticket à ouvrir. L'onboarding est celui que la box publie (#1110).
import type { Onboarding } from "../../../app/src/projets/demande.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

const TICKET = "https://github.com/benomite/parade/issues/433";
export const EN_ECHEC: Onboarding = {
  etat: "en-cours",
  termine: false,
  courante: "preparation",
  etapes: [
    { etape: "depot", titre: "Repository", etat: "faite", dit: "benomite/parade is authorized and cloned on box.", geste: null },
    { etape: "machine", titre: "Cooking machine", etat: "faite", dit: "box cooks parade.", geste: null },
    { etape: "preparation", titre: "Repository preparation", etat: "courante", dit: "The cook of #433 failed — the worktree setup of the project fails; it is retried by itself.", geste: null },
    { etape: "premier-ticket", titre: "First ticket", etat: "a-venir", dit: "Once benomite/parade is prepared, post your first ticket with the `fire` label.", geste: null },
  ],
  preparation: { ticket: 433, url: TICKET, etat: "en-echec", raison: "The worktree setup of the project fails.", prochainEssai: "2026-10-13T10:14:00.000Z", pr: null },
  sansBacASable: false,
  decisionAttendue: false,
};

export const ecran: Ecran = {
  dit: "L'espace de « parade », pendant son onboarding : le parcours en quatre étapes, la préparation du dépôt en échec, sa raison et son prochain essai (#1111)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: () => donnees({ ...SUR_LA_BOX, onboarding: EN_ECHEC }),
};
