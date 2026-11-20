// #3911, criterion 4: opening a breaker files no GitHub issue. The kitchen is opened on a project whose
// log already says the breaker opened on failures; GitHub answers every read and accepts every write,
// and no `POST` creating an issue may reach it.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../src/station/configuration.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { DEPOT, FAUX_CLAUDE, fauxGh, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();
const BRIGADE = "benomite/brigade";
const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

function ouvrir(t: TestContext) {
  const racine = repertoireTemporaire(t);
  projetSurGit(t, { reglages: { integrationBranch: "v2" }, clone: join(racine, CLONES, "brigade") });
  const [projet] = lireConfiguration(`brigade ${DEPOT}`).projets;
  assert.ok(projet);
  const gh = fauxGh(t);
  gh.repondre("user", { corps: { login: "chef" } });
  gh.repondre(`repos/${DEPOT}`, { corps: { full_name: DEPOT, owner: { login: "acme", type: "Organization" }, permissions: { push: true } } });
  gh.issues([]);
  // The brigade's repository: no issue open, a label that can be created, an issue that can be filed.
  gh.repondre(`repos/${BRIGADE}/issues?*`, { corps: [] });
  gh.repondre(`repos/${BRIGADE}/labels`, { statut: 201, corps: {} });
  gh.repondre(`repos/${BRIGADE}/issues`, { statut: 201, corps: { number: 900 } });
  const env = environnementDuProjet(racine, projet, { HOME: repertoireTemporaire(t), BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_SESSION_STATE: join(racine, "session", "renouvellement"), BRIGADE_GH_BIN: gh.bin });
  mkdirSync(env.BRIGADE_STATE_DIR ?? "", { recursive: true });
  const journal = ouvrirJournal(env.BRIGADE_STATE_DIR ?? "");
  const decisions = { BRIGADE_STATIONS: "box/claude:2:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium" };
  for (const [name, value] of Object.entries(decisions)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "guard.configured", payload: { limits: LIMITES, breakerThreshold: 3 } });
  for (const [i, ticket] of [31, 32, 33].entries()) {
    const run = `${ticket}-github-0000000${i}`;
    journal.ajouter({ project: "brigade", ticket, author: "runtime", type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl` } });
    journal.ajouter({ project: "brigade", ticket, author: "runtime", type: "cook.exited", payload: { run, outcome: "failed", code: 1, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } });
  }
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "breaker.opened", payload: { failures: 3, threshold: 3 } });
  journal.fermer();
  const cuisine = ouvrirCuisine(env, { dire: () => {} });
  const creations = () => gh.appels().filter((args) => args.includes("POST") && args.at(-1)?.endsWith("/issues"));
  return { cuisine, gh, creations };
}

test("a breaker that opens files no GitHub issue: the station reads the open breaker and nothing is created on GitHub", async (t) => {
  const { cuisine, gh, creations } = ouvrir(t);
  try {
    // The station has gone through its first rounds: it listed the project's tickets, and went on until
    // its calls to GitHub stopped coming (the base files the issue in the first of them).
    await jusqua(() => gh.appels().some((args) => args.at(-1)?.startsWith(`repos/${DEPOT}/issues`)));
    let vus = -1;
    await jusqua(async () => {
      const maintenant = gh.appels().length;
      await new Promise((resoudre) => setTimeout(resoudre, 100));
      const stable = maintenant === vus;
      vus = maintenant;
      return stable;
    }, 2000);
    assert.deepEqual(creations(), []);
  } finally {
    cuisine.arreter("fin du test");
    await cuisine.arretee?.();
  }
});

// brigade:guard
test("ouverture-sans-issue-github.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
