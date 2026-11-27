// L'espace de « parade » vu par alice, une humaine qui n'est pas le chef (ticket 2761, épique #2748) : son TODO porte d'abord
// les cartes `chef-todo` qui lui sont assignées sur GitHub — #41 et #47 —, avec leurs gestes ; celle de bob (#44) et celle du
// chef, sans assigné (#52), ferment la colonne sous « Awaiting others (2) », repliée, en lecture seule (ticket 2985). Le
// partage passe par la règle de l'app (app/src/vue/cartes-assignees/).
import { formeDuChef } from "../../../app/src/tableau/todo-github.ts";
import { partagerLesCartes } from "../../../app/src/vue/cartes-assignees/cartes-assignees.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { MANAGER_ALLUME, PROJETS, RENDUS } from "./cuisine-figee.ts";
import { SECOND } from "./rail-waiting-commun.ts";

const PARADE = RENDUS.parade as Rendu;
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

const STATUS = ["project    parade", "kitchen    open", "", "awaiting   nothing awaits the chef", "end awaiting", ...PARADE.status.split("\n").slice(5)].join("\n");
const TOUTES = [
  { ticket: 41, titre: "Export the journal as CSV", url: issue(41), assignes: ["alice"], chef: { sorte: "product-question", texte: "Which separator should the CSV export use?\n- [resume] Semicolons, for spreadsheet users\n- [drop] Commas, the standard" } },
  { ticket: 44, titre: "Validation SIRET", url: issue(44), assignes: ["bob"], chef: { sorte: "merge-by-hand", texte: "Delivery is green but the pass does not merge it: merge PR 46 yourself." } },
  { ticket: 47, titre: "Which plan for the free tier?", url: issue(47), assignes: ["alice", "carol"], chef: { sorte: "product-question", texte: "Does the free tier keep the export?\n- [resume] Yes, keep it\n- [close] No, paid plans only" } },
  { ticket: 52, titre: "Archive old boards", url: issue(52), chef: { sorte: "abandoned", texte: "The kitchen gave this ticket up after five attempts; its issue stays open." } },
];
const PARTAGE = partagerLesCartes(TOUTES, { login: "alice", chef: "chef" });
const ATTEND = PARTAGE.siennes.map(({ assignes: _, ...carte }) => carte);
const AUTRES = PARTAGE.autres.map(({ attente: { ticket, titre, url, chef }, qui }) => ({ ticket, titre, url, question: formeDuChef(chef.texte).question ?? chef.texte, qui }));

export const ecran: Ecran = {
  dit: "L'espace de « parade » vu par alice, qui n'est pas le chef (ticket 2761) : son TODO porte ses deux cartes assignées sur GitHub, avec les gestes du chef, puis « Awaiting others (2) », replié, pour celle de bob et celle du chef",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: { ...PARADE.facts, attend: ATTEND, attendAutres: AUTRES }, status: STATUS, manager: MANAGER_ALLUME } }),
  }),
};
