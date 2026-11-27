// L'espace de « parade », projet de la nouvelle cuisine (ticket 4474) : #41 porte `parked:chef`, et le commentaire de la
// cuisine qui dit pourquoi. Le TODO de l'app le lit de GitHub (board/parked-chef-github.ts) : une carte, ce que la cuisine
// en dit, Answer et « Open on GitHub ». `facts` porte cette carte dans `attend[].chef`, comme board/wait-of-chef.ts l'y met.
// `todo-parked-chef-avant` : le même projet avant, quand le TODO ne lisait pas `parked:chef` — rien ne l'attend ;
// `todo-parked-chef-repondu` : la réponse tapée, Answer cliqué.
import type { Expected } from "../../../app/src/facts.ts";
import { configuration, cuisine, demarrage, type Donnees, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const PARADE = RENDUS.parade as Rendu;
const STATUS = ["project    parade", "kitchen    open", "", "awaiting   nothing awaits the chef", "end awaiting", ...PARADE.status.split("\n").slice(5)].join("\n");
const ATTEND: Expected[] = [
  {
    ticket: 41,
    titre: "Free tier: keep the CSV export?",
    url: "https://github.com/chef/parade/issues/41",
    chef: { sorte: "parked-chef", texte: "Parked for the chef by its cook: the ticket does not say whether the free tier keeps the CSV export — keep it, or reserve it to paid plans?" },
  },
];

export const CHAMP_DE_41 = '[aria-label="the question #41 asks you"] textarea';
export const ANSWER_DE_41 = '[aria-label="the question #41 asks you"] .phrase .action > button';

export const donneesDe = (attend: Expected[], reponses: Record<string, unknown> = {}): Donnees => ({
  maintenant: MAINTENANT,
  reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND], ...reponses },
  envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: { ...PARADE.facts, attend }, status: STATUS, manager: MANAGER_ALLUME } }),
});

export const ecran: Ecran = {
  dit: "L'espace de « parade », projet de la nouvelle cuisine (ticket 4474) : #41 porte parked:chef — sa carte de TODO dit ce que la cuisine en dit, avec Answer et « Open on GitHub »",
  largeur: 1440,
  hauteur: 1100,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => donneesDe(ATTEND),
};
