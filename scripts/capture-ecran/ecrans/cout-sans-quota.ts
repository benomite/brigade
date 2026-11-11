// La page du coût de tous les projets sans quota Max réglé (#3254, #3313) : les tokens de chaque ticket cher, aucune part, et
// sous la liste la seule ligne qui dit pourquoi. Les données sont celles de cout-part.ts, sans `quotaMax`.
import type { Ecran } from "./commun.ts";
import { ecran as avecQuota } from "./cout-part.ts";

export const ecran: Ecran = {
  ...avecQuota,
  dit: "La page du coût de tous les projets sans quota Max : les tokens de chaque ticket cher, sans part, et « Share not shown: weekly quota is not configured. » (#3254)",
  donnees: () => {
    const base = avecQuota.donnees();
    const demarrage = base.reponses.demarrage as { configuration: { quotaMax?: unknown } };
    const { quotaMax: _, ...configuration } = demarrage.configuration;
    return { ...base, reponses: { ...base.reponses, demarrage: { ...demarrage, configuration } } };
  },
};
