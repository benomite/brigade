// Les humains de « parade » sous Settings (#2930) : trois humains déclarés dans son `projet.json`, chacun son login et
// ses rôles en cases, la ligne qui dit qu'un changement s'écrit dans projet.json par une PR ; puis `review` coché pour
// bob : le changement part tout de suite, sans « Save », et sa rangée dit la PR ouverte, avec son lien.
import { configuration, cuisine, demarrage, type Ecran, type Etape, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { LUS, OUVRIR } from "./reglages-du-projet.ts";

export const HUMAINS = [
  { login: "alice", roles: ["product", "review"] },
  { login: "bob", roles: ["design"] },
  { login: "carol-dupont", roles: ["client-contact"] },
];
export const HAUTEUR = 1240;
export const humain = (login: string) => `#humains-du-projet .humain[data-login="${login}"]`;
export const OUVRIR_LES_HUMAINS: Etape[] = OUVRIR;

export const ecran: Ecran = {
  dit: "Les humains de « parade » sous Settings : alice, bob et carol-dupont, chacun ses rôles et la ligne « written to projet.json through a pull request » ; `review` coché pour bob, sa rangée dit « proposed in PR #2951 »",
  largeur: 1440,
  hauteur: HAUTEUR,
  etapes: [...OUVRIR_LES_HUMAINS, { cliquer: `${humain("bob")} input[aria-label="review"]` }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: {
      demarrage: demarrage(configuration(PROJETS)),
      espace: [],
      reglagesDuProjet: LUS,
      listerLesHumains: HUMAINS,
      enregistrerUnHumain: { pr: "https://github.com/benomite/parade/pull/2951" },
    },
    envois: cuisine(RENDUS),
  }),
};
