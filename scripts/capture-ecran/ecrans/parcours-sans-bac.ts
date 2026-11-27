// La page de « parade », confiée à une station sans bac à sable, pendant son onboarding (#1113) : le
// parcours attend le chef sur l'étape de la machine — l'avertissement en une phrase, et deux boutons :
// choisir une autre station, ou continuer sans bac à sable. L'onboarding est celui que la station publie (#1110).
import type { Onboarding } from "../../../app/src/projets/demande.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

export const SANS_BAC: Onboarding = {
  etat: "en-cours",
  termine: false,
  courante: "machine",
  etapes: [
    { etape: "depot", titre: "Repository", etat: "faite", dit: "benomite/parade is authorized and cloned on box.", geste: null },
    {
      etape: "machine",
      titre: "Cooking machine",
      etat: "courante",
      dit: "box has no sandbox: its cooks would read everything the station's account reads. Nothing is launched for parade until you choose.",
      geste: { quoi: "Continue without a sandbox on box, or choose another station for parade.", ou: "In the app, on the project's page.", liens: [] },
    },
    { etape: "preparation", titre: "Repository preparation", etat: "a-venir", dit: "box opens the ticket that prepares benomite/parade: its gates, its worktree setup, the sites it may reach.", geste: null },
    { etape: "premier-ticket", titre: "First ticket", etat: "a-venir", dit: "Once benomite/parade is prepared, post your first ticket with the `fire` label.", geste: null },
  ],
  preparation: null,
  sansBacASable: true,
  decisionAttendue: true,
};

export const ecran: Ecran = {
  dit: "L'espace de « parade », sur une station sans bac à sable : l'avertissement en une phrase, « choose another station » et « continue without sandbox » (#1113)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: () => donnees({ ...SUR_LA_BOX, onboarding: SANS_BAC }),
};
