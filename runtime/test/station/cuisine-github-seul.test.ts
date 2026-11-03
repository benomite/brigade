// La cuisine d'un projet de la station ouvre le chemin que dit l'interrupteur
// de son dépôt (`githubOnlyState`, #2060) : la box fait tourner la station
// multi-projets, pas `main.ts` (#2176). Allumé, c'est la station GitHub seul
// qui prend les tickets, au nom de la station déclarée ; éteint, l'ancien
// chemin, tel quel.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../src/station/configuration.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { DEPOT, FAUX_CLAUDE, fauxGh, issueGitHub, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const OUVERTURE = "GitHub-only state — this station takes, cooks, reviews and merges the project's tickets from GitHub only";
const PRISE = "<!-- brigade:prise station=box/claude -->\nTaken by station `box/claude`.";

// Une station neuve qui sert `brigade` sur la box, son dépôt sur la branche
// `v2` ; `githubOnlyState` est ce que porte son `projet.json`.
function ouvrir(t: TestContext, githubOnlyState: boolean | undefined) {
  const racine = repertoireTemporaire(t);
  projetSurGit(t, { reglages: { integrationBranch: "v2", ...(githubOnlyState === undefined ? {} : { githubOnlyState }) }, clone: join(racine, CLONES, "brigade") });
  const [projet] = lireConfiguration(`brigade ${DEPOT}`).projets;
  assert.ok(projet);
  // Le `gh` du projet : un ticket calibré, que personne ne tient, sur une base verte.
  const gh = fauxGh(t);
  gh.issues([issueGitHub(7, { labels: ["fire", "model:sonnet", "effort:low"] })]);
  gh.repondre(`repos/${DEPOT}/issues/7/events?per_page=100`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/commits/v2/check-runs?per_page=100`, { corps: { check_runs: [] } });
  gh.repondre(`repos/${DEPOT}/commits/v2/status?per_page=100`, { corps: { statuses: [] } });
  const env = environnementDuProjet(racine, projet, { HOME: repertoireTemporaire(t), BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_SESSION_STATE: join(racine, "session", "renouvellement"), BRIGADE_GH_BIN: gh.bin });
  mkdirSync(env.BRIGADE_STATE_DIR ?? "", { recursive: true });
  const journal = ouvrirJournal(env.BRIGADE_STATE_DIR ?? "");
  const decisions = { BRIGADE_STATIONS: "box/claude:2:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium" };
  for (const [name, value] of Object.entries(decisions)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  const dits: string[] = [];
  const cuisine = ouvrirCuisine(env, { dire: (dit) => void dits.push(dit) });
  // Les prises postées sur l'issue : le corps de chaque commentaire créé sur #7.
  const prises = () =>
    gh
      .appels()
      .filter((args) => args.includes("POST") && args.at(-1) === `repos/${DEPOT}/issues/7/comments`)
      .map((args) => args.find((arg) => arg.startsWith("body="))?.slice("body=".length));
  return { cuisine, dits, prises };
}

test("switch on: the station's kitchen opens the GitHub-only path and claims a ticket as the station declared on the box", async (t) => {
  const { cuisine, dits, prises } = ouvrir(t, true);
  try {
    assert.ok(dits.includes(`brigade : ${OUVERTURE}`), dits.join("\n"));
    await jusqua(() => prises().length > 0);
    assert.deepEqual(prises(), [PRISE]);
  } finally {
    cuisine.arreter("fin du test");
    await cuisine.arretee?.();
  }
});

test("switch off: the station's kitchen keeps the old path, and claims nothing on GitHub", async (t) => {
  const { cuisine, dits, prises } = ouvrir(t, undefined);
  cuisine.arreter("fin du test");
  await cuisine.arretee?.();
  assert.ok(!dits.some((dit) => dit.includes("GitHub-only")), dits.join("\n"));
  assert.deepEqual(prises(), []);
});

test("cuisine-github-seul.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
