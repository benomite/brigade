// L'onglet Kitchen > Cooks de « parade » (#2492) : le formulaire rempli, « add » cliqué — GitHub a créé
// `agents/cook-migrations.md` sur la branche d'intégration : le formulaire se referme, une ligne le dit, et `migrations`
// est dans la liste, à son rang.
import type { RenduDeLaSpecialisation } from "../../../app/src/specialisations.ts";
import type { Ecran } from "./commun.ts";
import { donnees, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { REMPLIR } from "./cooks-specialisation-ajout.ts";
import { COOKS_DE_LA_CUISINE, SPECIALISATIONS_LUES } from "./cooks-specialisations.ts";

const AJOUTEE: RenduDeLaSpecialisation = {
  fait: "migrations added in the repository",
  specialisation: { nom: "migrations", fichier: "agents/cook-migrations.md", description: "Database schema changes and their migrations.", modele: "sonnet", effort: "medium", capacites: ["code", "postgres"] },
};

export const ecran: Ecran = {
  dit: "L'onglet Kitchen > Cooks de « parade » : une spécialisation ajoutée — `migrations` entre dans la liste (#2492)",
  largeur: 1440,
  hauteur: 1100,
  etapes: [...COOKS_DE_LA_CUISINE, ...REMPLIR, { cliquer: '[data-bloc="specialisations"] .ajout-de-specialisation .ajouter button' }],
  donnees: () => donnees(SUR_LA_BOX, { specialisations: SPECIALISATIONS_LUES, ajouterSpecialisation: AJOUTEE }),
};
