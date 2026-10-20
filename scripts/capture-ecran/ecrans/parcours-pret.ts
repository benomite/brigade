// La page de « parade », son onboarding fini (#1111) : à la place des étapes, la phrase qui invite à
// poser le premier ticket avec le label `fire`, son bouton, et « dismiss ».
import type { Onboarding } from "../../../app/src/projets/demande.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { EN_ECHEC } from "./parcours-en-echec.ts";

const PRET: Onboarding = {
  etat: "pret",
  termine: true,
  courante: "premier-ticket",
  etapes: [
    ...EN_ECHEC.etapes.slice(0, 2),
    { etape: "preparation", titre: "Repository preparation", etat: "faite", dit: "#433 is merged: benomite/parade is prepared.", geste: null },
    { etape: "premier-ticket", titre: "First ticket", etat: "courante", dit: "parade is ready: post your first ticket with the `fire` label.", geste: { quoi: "Post your first ticket with the `fire` label.", ou: "On GitHub, in the issues of benomite/parade.", liens: ["https://github.com/benomite/parade/issues/new"] } },
  ],
  preparation: { ticket: 433, url: "https://github.com/benomite/parade/issues/433", etat: "faite", raison: null, prochainEssai: null, pr: null },
  sansBacASable: false,
  decisionAttendue: false,
};

export const ecran: Ecran = {
  dit: "L'espace de « parade », son onboarding fini : « parade is ready », le premier ticket à poser, et « dismiss » (#1111)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: () => donnees({ ...SUR_LA_BOX, onboarding: PRET }),
};
