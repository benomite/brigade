// L'espace de « parade », projet GitHub seul : vingt et une cartes de TODO, presque toutes des revues de design (#3327).
// Même montage que todo-github-seul : `facts.attend[].chef` porte les cartes ; le bloc `awaiting` de `status` est vide.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const PARADE = RENDUS.parade as Rendu;
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

const STATUS = ["project    parade", "kitchen    open", "", "awaiting   nothing awaits the chef", "end awaiting", ...PARADE.status.split("\n").slice(5)].join("\n");
const ATTEND = Array.from({ length: 21 }, (_, i) => ({
  ticket: 100 + i,
  titre: `Design review: the ${["invoice list", "export dialog", "settings page", "empty state", "onboarding tour", "billing banner", "search results"][i % 7]} after the layout change`,
  url: issue(100 + i),
  chef: { sorte: "product-question", texte: "The design is on the branch; say whether it matches the mockup or what to change before it merges." },
}));

export const ecran: Ecran = {
  dit: "L'espace de « parade », projet GitHub seul : vingt et une cartes de TODO, des revues de design — la colonne prend la place qu'il lui faut (#3327)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: { ...PARADE.facts, attend: ATTEND }, status: STATUS, manager: MANAGER_ALLUME } }),
  }),
};
