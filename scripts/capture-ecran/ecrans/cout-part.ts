// La page du coût de tous les projets avec le quota Max réglé (#3254) : à côté des tokens de chaque ticket cher, sa part du
// quota hebdomadaire, et sous la liste le coût de la semaine en cours, tous projets. Les cooks sont ceux de cout.ts.
import type { Ecran } from "./commun.ts";
import { lu } from "./cout.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { PROJETS } from "./cuisine-figee.ts";
import { SETTINGS } from "./projet-sante.ts";

export const ecran: Ecran = {
  dit: "La page du coût de tous les projets avec un quota Max de 10 000 000 tokens pondérés : la part de chaque ticket cher, et le coût de la semaine (#3254)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, SETTINGS, { cliquer: "#couts-de-tous button" }],
  donnees: () => {
    const base = donnees(SUR_LA_BOX);
    const demarrage = base.reponses.demarrage as { configuration: object };
    return {
      ...base,
      reponses: { ...base.reponses, demarrage: { ...demarrage, configuration: { ...demarrage.configuration, quotaMax: { tokens: 10_000_000, poids: { opus: 5 } } } } },
      envois: { ...base.envois, onglet: { ...base.envois.onglet, "undefined/couts": PROJETS.map(({ nom }) => lu(nom)) } },
    };
  },
};
