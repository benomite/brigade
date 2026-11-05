// Kitchen > Cooks de « parade », son cahier de leçons (#2493, épique #2484) : le bloc « Notebook », entrée par entrée — les leçons
// promues du projet, lues dans `apprentissage` de `facts`, avec leur identifiant, leur texte et leur jour. Les provisoires n'y sont pas.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { APPRENTISSAGE } from "./cooks-apprentissage.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { KITCHEN } from "./projet-sante.ts";

const PARADE = RENDUS.parade as Rendu;
export const COOKS = { cliquer: "#onglets-cuisine button:nth-child(2)" };

export const lire = (apprentissage: unknown) => () => ({
  maintenant: MAINTENANT,
  reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
  envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: { ...PARADE.facts, apprentissage } as Rendu["facts"] } }),
});

export const ecran: Ecran = {
  dit: "Kitchen > Cooks de « parade » : le bloc Notebook, ses deux leçons promues entrée par entrée (#2493)",
  largeur: 1440,
  hauteur: 1900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, KITCHEN, COOKS],
  donnees: lire(APPRENTISSAGE),
};
