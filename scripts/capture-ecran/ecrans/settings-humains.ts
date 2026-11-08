// Les humains de « parade » sous Settings (#2930) : trois humains déclarés dans son `projet.json`, chacun son login et
// ses rôles en vigueur et en cases, la ligne de la rangée de réglage (#2920) qui dit qu'un changement ouvre une PR ; puis
// `review` coché pour bob : le changement part tout de suite, sans « Save », et sa rangée dit la PR ouverte, avec son lien.
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
  dit: "Les humains de « parade » sous Settings : alice, bob et carol-dupont, chacun ses rôles et la ligne « a change opens a pull request, applied once merged » ; `review` coché pour bob, sa rangée dit « proposed in pull request #2951 »",
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
