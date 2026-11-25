// #4221 : la prise du backlog, par le point d'entrée de la box (`ouvrirCuisine`). Le manager de la cuisine lit la place
// libre des places de la station : il calibre puis lance l'issue qu'il a jugée exécutable quand la cuisine a de la
// place, et ne lance rien quand un ticket lancé qui attend son cook la prend déjà.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { empreinte } from "../../src/juger.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../src/station/configuration.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { DEPOT, FAUX_CLAUDE, fauxGh, issueGitHub, jusqua, repertoireTemporaire } from "../outils.ts";

// Une issue du dépôt, ouverte par son propriétaire.
const issueDuChef = (numero: number, labels: string[]) => {
  const issue = issueGitHub(numero, { labels });
  return { ...issue, author_association: "OWNER" };
};

// La cuisine d'une station à un cook, dont le manager a déjà jugé exécutables les issues `jugees`, telles qu'ouvertes.
function ouvrir(t: TestContext, issues: Array<ReturnType<typeof issueDuChef>>, jugees: number[]) {
  const racine = repertoireTemporaire(t);
  projetSurGit(t, { reglages: { integrationBranch: "v2" }, clone: join(racine, CLONES, "brigade") });
  const [projet] = lireConfiguration(`brigade ${DEPOT}`).projets;
  assert.ok(projet);
  const gh = fauxGh(t);
  gh.repondre("user", { corps: { login: "chef" } });
  gh.repondre(`repos/${DEPOT}`, { corps: { full_name: DEPOT, owner: { login: "acme", type: "Organization" }, permissions: { push: true } } });
  gh.issues(issues);
  // Le sondage du manager : toutes les issues ouvertes.
  gh.repondre(`repos/${DEPOT}/issues?state=open&per_page=100`, { corps: issues });
  for (const { number } of issues) {
    gh.repondre(`repos/${DEPOT}/issues/${number}/labels`, { corps: [] });
    gh.repondre(`repos/${DEPOT}/issues/${number}/events?per_page=100`, { corps: [] });
  }
  gh.repondre(`repos/${DEPOT}/issues/*`, { statut: 201, corps: { id: 1 } });
  gh.repondre(`repos/${DEPOT}/commits/v2/check-runs?per_page=100`, { corps: { check_runs: [] } });
  gh.repondre(`repos/${DEPOT}/commits/v2/status?per_page=100`, { corps: { statuses: [] } });
  const env = environnementDuProjet(racine, projet, { HOME: repertoireTemporaire(t), BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_SESSION_STATE: join(racine, "session", "renouvellement"), BRIGADE_GH_BIN: gh.bin, BRIGADE_MAX_LOAD_PER_CORE: "1000000" });
  mkdirSync(env.BRIGADE_STATE_DIR ?? "", { recursive: true });
  const journal = ouvrirJournal(env.BRIGADE_STATE_DIR ?? "");
  const decisions = { BRIGADE_STATIONS: "box/claude:1:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium" };
  for (const [name, value] of Object.entries(decisions)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  for (const numero of jugees) {
    const fingerprint = empreinte({ number: numero, title: `Ticket ${numero}`, body: "", labels: [] }, []);
    journal.ajouter({ project: "brigade", ticket: numero, author: "manager", type: "manager.judged", payload: { run: `juge-${numero}`, fingerprint, content: fingerprint, verdict: "fire", kind: "ticket", reason: "One deliverable.", missing: null, model: "haiku", effort: "low", calibration: "Small." } });
  }
  journal.fermer();
  const cuisine = ouvrirCuisine(env, { dire: () => {} });
  // Les labels que la cuisine a posés, issue par issue, dans l'ordre.
  const labellisations = () =>
    gh
      .appels()
      .filter((args) => args.includes("POST") && /\/issues\/\d+\/labels$/.test(args.at(-1) ?? ""))
      .map((args) => [Number(/issues\/(\d+)\/labels$/.exec(args.at(-1) ?? "")?.[1]), args.filter((arg) => arg.startsWith("labels[]=")).map((arg) => arg.slice("labels[]=".length))] as const);
  return { cuisine, labellisations };
}

test("with room in the kitchen, the manager of the station calibrates the issue it judged, then puts `fire` on it", async (t) => {
  const { cuisine, labellisations } = ouvrir(t, [issueDuChef(1, ["prio:1"])], [1]);
  try {
    await jusqua(() => labellisations().length === 2);
    assert.deepEqual(labellisations(), [
      [1, ["model:haiku", "effort:low"]],
      [1, ["fire"]],
    ]);
  } finally {
    cuisine.arreter("fin du test");
    await cuisine.arretee?.();
  }
});

test("its one place taken by a fired ticket that waits for its cook, the manager of the station puts `fire` on nothing", async (t) => {
  // #5 : lancée par le chef sans calibrage, elle attend son cook ; le manager la calibre, plus loin dans son tour.
  const { cuisine, labellisations } = ouvrir(t, [issueDuChef(1, ["prio:1"]), issueDuChef(5, ["fire"])], [1, 5]);
  try {
    await jusqua(() => labellisations().some(([numero]) => numero === 5));
    assert.deepEqual(labellisations(), [[5, ["model:haiku", "effort:low"]]]);
  } finally {
    cuisine.arreter("fin du test");
    await cuisine.arretee?.();
  }
});
