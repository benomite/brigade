// Le closer de la cuisine d'un projet de la station lit le compte du projet
// (`blocages-sans-question.json`) et ouvre le défaut qui le nomme (#2558) :
// le test passe par `ouvrirCuisine`, le point d'entrée de la station.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { FICHIER_BLOCAGES_SANS_QUESTION } from "../../src/blocages-sans-question.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../src/station/configuration.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { DEPOT, FAUX_CLAUDE, fauxGh, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";


const rienNeReste = temporaireDuFichier();

test("the station's kitchen opens a defect naming the blocked-without-question count its status holds", async (t) => {
  const racine = repertoireTemporaire(t);
  projetSurGit(t, { reglages: { integrationBranch: "v2" }, clone: join(racine, CLONES, "brigade") });
  const [projet] = lireConfiguration(`brigade ${DEPOT}`).projets;
  assert.ok(projet);
  const gh = fauxGh(t);
  gh.issues([]);
  gh.repondre(`repos/${DEPOT}/issues?state=all&since=*`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/issues`, { statut: 201, corps: { number: 99 } });
  const env = environnementDuProjet(racine, projet, { HOME: repertoireTemporaire(t), BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_SESSION_STATE: join(racine, "session", "renouvellement"), BRIGADE_GH_BIN: gh.bin });
  const etat = env.BRIGADE_STATE_DIR ?? "";
  mkdirSync(etat, { recursive: true });
  writeFileSync(join(etat, FICHIER_BLOCAGES_SANS_QUESTION), JSON.stringify({ blockedWithoutQuestion: 3 }));
  const journal = ouvrirJournal(etat);
  const decisions = { BRIGADE_STATIONS: "box/claude:2:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium", BRIGADE_CLOSING_MODEL: "sonnet", BRIGADE_CLOSING_EFFORT: "medium" };
  for (const [name, value] of Object.entries(decisions)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  const cuisine = ouvrirCuisine(env, { dire: () => {}, intervalleTickMs: 5 });
  const ouverts = () => gh.appels().filter((args) => args.includes("POST") && args.at(-1) === `repos/${DEPOT}/issues`);
  try {
    await jusqua(() => ouverts().length > 0);
    assert.ok(ouverts().some((args) => args.some((arg) => arg.startsWith("title=3 blocked-on-human without a question"))), JSON.stringify(ouverts()));
  } finally {
    cuisine.arreter("fin du test");
    await cuisine.arretee?.();
  }
});

test("cuisine-blocages-sans-question.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
