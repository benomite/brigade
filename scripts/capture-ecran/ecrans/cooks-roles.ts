// L'onglet Cooks de « parade » et, sous son plafond de calibrage, les rôles de sa cuisine (#1274) : le manager, la
// pass, le reviewer, le second juge, le triage et le closer — chacun avec ce qu'il fait et sa dernière action sur le
// projet, son heure. Le second juge n'a encore rien fait : `no action yet`. Le reste est `cooks-activite`.
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { FACTS as ACTIVITE } from "./cooks-activite.ts";

const PARADE = RENDUS.parade as Rendu;
// Une heure, `minutes` avant MAINTENANT.
const avant = (minutes: number) => new Date(Date.parse(MAINTENANT) - minutes * 60_000).toISOString();

// Les rôles tels que `facts` les rend (runtime/src/roles-cuisine/roles.ts) : leur ligne et la phrase de leur action
// sont celles du runtime.
export const ROLES = [
  { role: "manager", does: "Judges the project's issues, puts the ready ones on the rail, splits epics, and decides what follows a red ticket.", latest: { what: "put #16 on the rail", ticket: 16, at: avant(4) } },
  { role: "pass", does: "Judges each delivery on its gates, its CI and its review, then merges it, sends it back to its cook, or escalates it to you.", latest: { what: "merged #12", ticket: 12, at: avant(23) } },
  { role: "reviewer", does: "Reads each delivery's diff and writes the review the pass judges with.", latest: { what: "reviewed #12: green", ticket: 12, at: avant(31) } },
  { role: "second judge", does: "Checks that a green delivery touching its own judges (gates, setup, workflows) does not weaken them.", latest: null },
  { role: "triage", does: "Takes up a card before it reaches TODO, and settles it alone when it can: relaunch, split, wait or remove.", latest: { what: "relaunched #9", ticket: 9, at: avant(3 * 60 + 12) } },
  { role: "closer", does: "Prunes and simplifies the project's code in one cleanup pass, when you ask for it.", latest: { what: "delivered a cleanup PR removing 140 lines", ticket: null, at: avant(26 * 60) } },
];

export const FACTS: Faits = { ...ACTIVITE, rolesCuisine: ROLES } as Faits;

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : sous ses stations et son plafond, les rôles de sa cuisine — le manager, la pass, le reviewer, le second juge (no action yet), le triage et le closer —, chacun avec ce qu'il fait et sa dernière action datée",
  largeur: 1440,
  hauteur: 1250,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] },
    envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
  }),
};
