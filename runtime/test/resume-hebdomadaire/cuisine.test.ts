// Le résumé hebdomadaire dans la cuisine d'un projet de la station (#3261) : le
// test passe par `ouvrirCuisine`, le point d'entrée de la station — au jour
// réglé (`weeklySummaryDay`, ici celui d'aujourd'hui), le résumé de la semaine
// est gardé dans l'état du projet, et le chef en est notifié par une mention
// sur GitHub : une issue qui le mentionne, fermée aussitôt.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { lireLeResume } from "../../src/resume-hebdomadaire/cuisine.ts";
import { jourDe, semaineAResumer } from "../../src/resume-hebdomadaire/jour.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../src/station/configuration.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { DEPOT, FAUX_CLAUDE, fauxGh, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

test("on the set day, the station's kitchen stores the week's summary and @-mentions the chef on a closed issue carrying it", async (t) => {
  const maintenant = new Date();
  const semaine = semaineAResumer(maintenant, jourDe(maintenant));
  assert.ok(semaine);
  const racine = repertoireTemporaire(t);
  projetSurGit(t, { reglages: { integrationBranch: "v2", chef: "benomite", weeklySummaryDay: jourDe(maintenant) }, clone: join(racine, CLONES, "brigade") });
  const [projet] = lireConfiguration(`brigade ${DEPOT}`).projets;
  assert.ok(projet);
  const gh = fauxGh(t);
  gh.issues([]);
  gh.repondre(`repos/${DEPOT}/issues?state=all&since=*`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/issues`, { statut: 201, corps: { number: 99 } });
  gh.repondre(`repos/${DEPOT}/issues/99`, { corps: { number: 99, state: "closed" } });
  const env = environnementDuProjet(racine, projet, { HOME: repertoireTemporaire(t), BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_SESSION_STATE: join(racine, "session", "renouvellement"), BRIGADE_GH_BIN: gh.bin });
  const etat = env.BRIGADE_STATE_DIR ?? "";
  mkdirSync(etat, { recursive: true });
  const journal = ouvrirJournal(etat);
  const decisions = { BRIGADE_STATIONS: "box/claude:2:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium", BRIGADE_CLOSING_MODEL: "sonnet", BRIGADE_CLOSING_EFFORT: "medium" };
  for (const [name, value] of Object.entries(decisions)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  const cuisine = ouvrirCuisine(env, { dire: () => {}, intervalleTickMs: 5 });
  const creees = () => gh.appels().filter((args) => args.includes("POST") && args.at(-1) === `repos/${DEPOT}/issues` && args.some((arg) => arg.startsWith("title=Weekly kitchen summary")));
  const fermees = () => gh.appels().filter((args) => args.includes("PATCH") && args.at(-1) === `repos/${DEPOT}/issues/99` && args.includes("state=closed"));
  try {
    await jusqua(() => fermees().length > 0);
    const resume = lireLeResume(etat, "brigade", semaine.weekStart);
    assert.ok(resume);
    assert.equal(resume.weekEnd, semaine.weekEnd);
    assert.deepEqual(resume.themes, []);
    assert.equal(creees().length, 1, JSON.stringify(creees()));
    const corps = creees()[0]?.find((arg) => arg.startsWith("body=")) ?? "";
    assert.match(corps, /^body=<!-- brigade:weekly-summary project=brigade week=\d{4}-\d{2}-\d{2} -->\n@benomite /);
    assert.ok(corps.endsWith(resume.markdown));
  } finally {
    cuisine.arreter("fin du test");
    await cuisine.arretee?.();
  }
  assert.equal(creees().length, 1);
});

test("cuisine.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
