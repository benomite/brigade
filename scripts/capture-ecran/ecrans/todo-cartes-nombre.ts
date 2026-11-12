// L'espace de « parade », projet GitHub seul : `nombre` cartes de TODO, presque toutes des revues de design (#3327). Même montage que
// todo-github-seul : `facts.attend[].chef` porte les cartes ; le bloc `awaiting` de `status` est vide. Les titres et les questions
// diffèrent d'une carte à l'autre, certains longs : la capture montre comment un vrai texte passe à la ligne dans une piste étroite.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const PARADE = RENDUS.parade as Rendu;
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

const STATUS = ["project    parade", "kitchen    open", "", "awaiting   nothing awaits the chef", "end awaiting", ...PARADE.status.split("\n").slice(5)].join("\n");
const ECRANS = ["invoice list", "export dialog", "settings page", "empty state", "onboarding tour", "billing banner", "search results"];
const QUESTIONS = [
  "The design is on the branch; say whether it matches the mockup or what to change before it merges.",
  "Does the new spacing hold on a narrow window? The screenshots are in the PR; tell me which of the two layouts to keep.",
  "The error message is now two lines long and cuts the button off on a phone width. Keep it, or shorten it to one line?",
  "Should the empty state propose to import a file, or only explain what will appear here once the first ticket is served?",
];

export const todoDeNCartes = (nombre: number, dit: string): Ecran => ({
  dit,
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
    envois: cuisine({
      ...RENDUS,
      parade: {
        ...PARADE,
        facts: {
          ...PARADE.facts,
          attend: Array.from({ length: nombre }, (_, i) => ({
            ticket: 100 + i,
            titre: `Design review: the ${ECRANS[i % ECRANS.length]} after the layout change${i % 3 === 1 ? ", with the longer title a real ticket carries" : ""}`,
            url: issue(100 + i),
            chef: { sorte: "product-question", texte: QUESTIONS[i % QUESTIONS.length] },
          })),
        },
        status: STATUS,
        manager: MANAGER_ALLUME,
      },
    }),
  }),
});
