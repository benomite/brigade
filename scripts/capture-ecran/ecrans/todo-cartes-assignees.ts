// L'espace de « parade » vu par alice, une humaine qui n'est pas le chef (ticket 2761, épique #2748) : son TODO ne porte que
// les cartes `chef-todo` qui lui sont assignées sur GitHub — #41 et #47 —, ni celle de bob (#44), ni celle du chef, sans
// assigné (#52). La liste passe par la règle de l'app (app/src/vue/cartes-assignees/), les cartes gardent leurs gestes.
import { cartesAssignees } from "../../../app/src/vue/cartes-assignees/cartes-assignees.ts";
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
const ATTEND = cartesAssignees(TOUTES, { login: "alice", chef: "chef" }).map(({ assignes: _, ...carte }) => carte);

export const ecran: Ecran = {
  dit: "L'espace de « parade » vu par alice, qui n'est pas le chef (ticket 2761) : son TODO ne porte que ses deux cartes assignées sur GitHub, avec les gestes du chef",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [SECOND] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: { ...PARADE.facts, attend: ATTEND }, status: STATUS, manager: MANAGER_ALLUME } }),
  }),
};
