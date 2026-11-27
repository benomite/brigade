// L'espace de « parade », projet GitHub seul (ticket 2221, épique #2209) : son TODO se lit de GitHub, une carte par issue au
// label `chef-todo`, sa sorte et son texte tirés du commentaire `<!-- brigade:todo kind=… -->` que le runtime y a posé.
// `facts` porte ces cartes dans `attend[].chef`, comme tableau/todo-github.ts les y met ; le bloc `awaiting` de `status` est vide.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const PARADE = RENDUS.parade as Rendu;
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

const STATUS = ["project    parade", "kitchen    open", "", "awaiting   nothing awaits the chef", "end awaiting", ...PARADE.status.split("\n").slice(5)].join("\n");
const ATTEND = [
  { ticket: 41, titre: "Export the journal as CSV", url: issue(41), chef: { sorte: "blocked", texte: "Three cooks failed on the same test. The branch is kept; say whether to retry or reshape the ticket." } },
  { ticket: 44, titre: "Validation SIRET", url: issue(44), chef: { sorte: "merge-by-hand", texte: "Delivery is green but the pass does not merge it: merge PR 46 yourself." } },
  { ticket: 47, titre: "Which plan for the free tier?", url: issue(47), chef: { sorte: "product-question", texte: "The ticket does not say if the free tier keeps the export. Answer on the issue." } },
  { ticket: 52, titre: "Archive old boards", url: issue(52), chef: { sorte: "abandoned", texte: "The kitchen gave this ticket up after five attempts; its issue stays open." } },
];

export const ecran: Ecran = {
  dit: "L'espace de « parade », projet GitHub seul (ticket 2221) : quatre cartes de TODO lues de GitHub, une par issue au label chef-todo — sa sorte, son texte, le lien de son issue",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: { ...PARADE.facts, attend: ATTEND }, status: STATUS, manager: MANAGER_ALLUME } }),
  }),
};
