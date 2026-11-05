// L'onglet Kitchen > Cooks de « parade » (#2492, épique #2484) : en bas, le bloc des spécialisations — chacune avec son
// modèle, son effort et ses capacités, lues dans le dépôt (`agents/cook-<nom>.md`) —, puis « Add a specialization ».
// La cuisine est celle de `cuisine-demenagee` : parade sur la box ; la page se capture haute pour montrer le bloc.
import type { LectureDesSpecialisations } from "../../../app/src/specialisations.ts";
import type { Ecran, Etape } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

export const COOKS_DE_LA_CUISINE: Etape[] = [OUVRIR, { cliquer: "#onglets-du-projet button:nth-child(3)" }, { cliquer: "#onglets-cuisine button:nth-child(2)" }];

export const SPECIALISATIONS_LUES: LectureDesSpecialisations = {
  branche: "main",
  specialisations: [
    { nom: "design", fichier: "agents/cook-design.md", description: "Interface tickets: the app's visual language, captures before and after.", modele: null, effort: "medium", capacites: [] },
    { nom: "security", fichier: "agents/cook-security.md", description: "Auth, secrets and permissions.", modele: "opus", effort: "high", capacites: ["code", "acces-prod"] },
  ],
};

export const ecran: Ecran = {
  dit: "L'onglet Kitchen > Cooks de « parade » : ses spécialisations, leur modèle, leur effort et leurs capacités, et « Add a specialization » (#2492)",
  largeur: 1440,
  hauteur: 1100,
  etapes: COOKS_DE_LA_CUISINE,
  donnees: () => donnees(SUR_LA_BOX, { specialisations: SPECIALISATIONS_LUES }),
};
