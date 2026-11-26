// La page des résumés hebdomadaires (#3263), sur des résumés figés : ceux qu'écrit le runtime
// (runtime/src/resume-hebdomadaire/resume.ts) pour la semaine du 5 au 11 octobre 2026 de « parade », qui cuit sur ce Mac —
// avec ses chiffres d'autonomie, puis sans.
import { resumeDeLaSemaine } from "../../../runtime/src/resume-hebdomadaire/resume.ts";
import type { ResumesDuProjet } from "../../../app/src/vue/resume-hebdomadaire/resume-cuisine.ts";
import { configuration, demarrage, type Donnees } from "./commun.ts";
import { PROJETS } from "./cuisine-figee.ts";
import { donnees, OUVRIR, SUR_CE_MAC } from "./cuisine-demenagee.ts";
import { SETTINGS } from "./projet-sante.ts";

const issue = (n: number) => `https://github.com/chef/parade/issues/${n}`;
const RAIL = { number: 3, title: "The rail at a glance" };
const SERVIS = [
  { number: 12, title: "feat(#12): show the rail age on the tile", url: issue(12), labels: [], epic: RAIL },
  { number: 14, title: "Keep the tile colours when the project is renamed", url: issue(14), labels: [], epic: RAIL },
  { number: 17, title: "Export the log as CSV from `app/src/vue/log.js`", url: issue(17), labels: [], epic: null },
  { number: 15, title: "fix: the log no longer stops at 200 events", url: issue(15), labels: ["bug"], epic: null },
];
const ATTENTES = [{ ticket: 21, ligne: "Keep or drop the old /rail route for bookmarks?", url: issue(21) }];
const AUTONOMIE = { tickets: 4, sansHumain: 3, partSansHumain: 0.75, delaiMedianMs: 5.5 * 3600_000, renvoyes: 1, partRenvoyee: 0.25, avecHumain: [] };

const semaine = (autonomie: typeof AUTONOMIE | null) => resumeDeLaSemaine({ project: "parade", weekStart: "2026-10-05", weekEnd: "2026-10-11", servis: SERVIS, autonomie: autonomie as never, attentes: ATTENTES });
const PRECEDENTE = resumeDeLaSemaine({ project: "parade", weekStart: "2026-09-28", weekEnd: "2026-10-04", servis: SERVIS.slice(0, 1), attentes: [] });
const lus = (autonomie: typeof AUTONOMIE | null): ResumesDuProjet => ({
  projet: "parade",
  jour: { jour: "monday", pose: false },
  resumes: { resumes: [semaine(autonomie), PRECEDENTE], illisibles: [] },
});

export const ETAPES = [OUVRIR, SETTINGS, { cliquer: "#resumes-de-tous button" }];
// Seul « parade » est servi : le faux pont rend la même lecture à chaque projet, et « cantine » n'a pas de page à lui.
function deParade(lue: ResumesDuProjet): Donnees {
  const figees = donnees(SUR_CE_MAC, { lireLesResumesHebdomadaires: lue });
  const parade = demarrage(configuration(PROJETS), (nom) => nom === "parade", true, ({ nom }) => nom === "parade");
  return { ...figees, reponses: { ...figees.reponses, demarrage: { ...(figees.reponses.demarrage as object), configuration: parade.configuration } } };
}
export const AVEC_AUTONOMIE = () => deParade(lus(AUTONOMIE));
export const SANS_AUTONOMIE = () => deParade(lus(null));
