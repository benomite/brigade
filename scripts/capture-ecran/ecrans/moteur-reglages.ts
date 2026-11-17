// La page de la station de cet ordinateur et sa section « Engine » (#3746) : la station cuit sur la clé d'API de Claude —
// la clé est gardée, masquée —, et retombe sur l'abonnement Claude. Les dossiers et la porte sont ceux de station-dossiers.
import type { Ecran } from "./commun.ts";
import { ecran as dossiers } from "./station-dossiers.ts";

export const ecran: Ecran = {
  ...dossiers,
  dit: "La page de la station de cet ordinateur, sa section « Engine » : la clé d'API de Claude, gardée et masquée, et l'abonnement en secours",
  hauteur: 1500,
  donnees: () => {
    const donnees = dossiers.donnees();
    const lus = donnees.reponses.lireReglagesDeLaStation as Record<string, unknown>;
    donnees.reponses.lireReglagesDeLaStation = { ...lus, engine: "claude-api-key", fallbackEngine: "claude-subscription", apiKey: true };
    return donnees;
  },
};
