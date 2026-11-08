// La cuisine de la box ouvre la station contributrice quand le compte de la
// machine n'a pas l'écriture sur le dépôt (#2935) : par `ouvrirCuisine`, le
// vrai client GitHub sous un faux `gh`, la station prend le ticket par un
// commentaire signé de son compte, et ne pose aucun label.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { brancheDuTicket } from "../../src/brigade-github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../src/station/configuration.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { DEPOT, FAUX_CLAUDE, fauxGh, issueGitHub, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const CONTRIBUTRICE = "brigade : @outsider has no write access to the repository — contributor station: it claims tickets with a comment, cooks them in its fork, and delivers each one as a pull request from the fork";

function ouvrir(t: TestContext) {
  const racine = repertoireTemporaire(t);
  projetSurGit(t, { reglages: { integrationBranch: "v2" }, clone: join(racine, CLONES, "brigade") });
  const [projet] = lireConfiguration(`brigade ${DEPOT}`).projets;
  assert.ok(projet);
  // Le `gh` du projet : un ticket calibré, que personne ne tient, sur une base verte.
  const gh = fauxGh(t);
  // Le compte de la machine n'a que la lecture du dépôt, et sa fourche.
  gh.repondre("user", { corps: { login: "outsider" } });
  gh.repondre(`repos/${DEPOT}`, { corps: { full_name: DEPOT, owner: { login: "acme", type: "Organization" }, permissions: { push: false, pull: true } } });
  gh.repondre(`repos/${DEPOT}/forks`, { statut: 202, corps: { full_name: "outsider/brigade", owner: { login: "outsider" }, clone_url: join(racine, "fourche.git") } });
  gh.repondre(`repos/${DEPOT}/pulls?state=open&per_page=100`, { corps: [] });
  gh.issues([issueGitHub(7, { labels: ["fire", "model:sonnet", "effort:low"] })]);
  gh.repondre(`repos/${DEPOT}/issues/7/events?per_page=100`, { corps: [] });
  // Sans PR : la station lit celle du ticket avant de le prendre (#2622).
  gh.repondre(`repos/${DEPOT}/pulls?head=${DEPOT.split("/")[0]}:${brancheDuTicket(7)}&state=all&per_page=1`, { corps: [] });
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
  // Ce que la station écrit sur GitHub : le corps de chaque commentaire créé sur #7, et ses labels.
  const labels = () => gh.appels().filter((args) => args.includes("POST") && args.at(-1) === `repos/${DEPOT}/issues/7/labels`);
  const prises = () =>
    gh
      .appels()
      .filter((args) => args.includes("POST") && args.at(-1) === `repos/${DEPOT}/issues/7/comments`)
      .map((args) => args.find((arg) => arg.startsWith("body="))?.slice("body=".length));
  return { cuisine, dits, prises, labels };
}

test("the box's kitchen opens the contributor station when the machine's account cannot write: it claims the ticket with a signed comment and sets no label", async (t) => {
  const { cuisine, dits, prises, labels } = ouvrir(t);
  try {
    await jusqua(() => prises().length > 0);
    assert.ok(dits.includes(CONTRIBUTRICE), dits.join("\n"));
    assert.deepEqual(prises(), ["<!-- brigade:reclame station=box/claude login=outsider -->\nClaimed by contributor station `box/claude` (@outsider), which cooks it in its fork."]);
    assert.deepEqual(labels(), []);
  } finally {
    cuisine.arreter("fin du test");
    await cuisine.arretee?.();
  }
});

test("station-contributrice/cuisine.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
