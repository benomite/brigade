// Kitchen > Cooks de « parade », son cahier de leçons vide (#2493) : le bloc « Notebook » le dit en une ligne.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { KITCHEN } from "./projet-sante.ts";

const PARADE = RENDUS.parade as Rendu;
const COOKS = { cliquer: "#onglets-cuisine button:nth-child(2)" };

const lire = (apprentissage: unknown) => () => ({
  maintenant: MAINTENANT,
  reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
  envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: { ...PARADE.facts, apprentissage } as Rendu["facts"] } }),
});

export const ecran: Ecran = {
  dit: "Kitchen > Cooks de « parade » sans leçon : le bloc Notebook dit qu'il n'y en a pas encore (#2493)",
  largeur: 1440,
  hauteur: 1900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, KITCHEN, COOKS],
  donnees: lire({ lecons: [], profils: [] }),
};
