// L'espace de « parade », projet GitHub seul (ticket 3132) : son TODO se lit de GitHub, une carte par issue au
// label `chef-todo`, sa sorte et son texte tirés du commentaire `<!-- brigade:todo kind=… -->` que le runtime y a posé.
// `facts` porte ces cartes dans `attend[].chef`, comme tableau/todo-github.ts les y met ; le bloc `awaiting` de `status` est vide.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const PARADE = RENDUS.parade as Rendu;
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

const STATUS = ["project    parade", "kitchen    open", "", "awaiting   nothing awaits the chef", "end awaiting", ...PARADE.status.split("\n").slice(5)].join("\n");
const ATTEND = [
  {
    ticket: 41,
    titre: "Open the epic on GitHub",
    url: issue(41),
    chef: { sorte: "blocked", texte: "**Gesture for the chef:** From a machine with GitHub access, run: gh issue create --repo benomite/brigade --title \"Epic 3128: a card gesture shown in full\" --body-file /tmp/epic-3128.md --label chef-todo --label epic\n\nStation `parade`: the cook stopped, blocked." },
  },
  { ticket: 44, titre: "Validation SIRET", url: issue(44), chef: { sorte: "merge-by-hand", texte: "Delivery is green but the pass does not merge it: merge PR 46 yourself." } },
];

export const ecran: Ecran = {
  dit: "L'espace de « parade », projet GitHub seul (ticket 3132) : une carte de TODO dont le geste du chef est une longue commande gh — lue en entier, avec son bouton « copy »",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: { ...PARADE.facts, attend: ATTEND }, status: STATUS, manager: MANAGER_ALLUME } }),
  }),
};
