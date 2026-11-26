// L'espace de « parade », projet GitHub seul (#4358) : l'issue d'un auteur sans l'écriture est retenue — aucun agent ne la
// lit — et sa carte de TODO, telle que le runtime la pose (runtime/src/trust/retenue.ts, `carteDeRetenue`), nomme son
// auteur et offre « accept » et « close ».
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const PARADE = RENDUS.parade as Rendu;
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

const STATUS = ["project    parade", "kitchen    open", "", "awaiting   nothing awaits the chef", "end awaiting", ...PARADE.status.split("\n").slice(5)].join("\n");
const ATTEND = [
  {
    ticket: 48,
    titre: "Please add dark mode",
    url: issue(48),
    chef: {
      sorte: "product-question",
      texte: [
        "Held issue #48: accept it, so the kitchen reads it?",
        "",
        "- [accept] Accept it",
        "- [close] Close it",
        "",
        "Asks: Please add dark mode — The app hurts my eyes at night.",
        "Opened by @mallory, who has no write access to the repository.",
        "",
        "Until you accept it, no agent reads #48 and nothing of it reaches the rail. You can also answer on the issue with one line: `accept`.",
      ].join("\n"),
    },
  },
];

export const ecran: Ecran = {
  dit: "L'espace de « parade », projet GitHub seul (#4358) : la carte de TODO d'une issue retenue — son auteur sans l'écriture, « accept » et « close »",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: { ...PARADE.facts, attend: ATTEND }, status: STATUS, manager: MANAGER_ALLUME } }),
  }),
};
