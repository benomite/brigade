// Les tickets récurrents dans la cuisine d'un projet de la station (#3230) : le
// test passe par `ouvrirCuisine`, le point d'entrée de la station — un ticket
// récurrent déclaré par la commande, à sa date, devient une issue avec `fire`.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { principal } from "../../src/recurrents/commande.ts";
import { lireLesRecurrents } from "../../src/recurrents/recurrents.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../src/station/configuration.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { DEPOT, FAUX_CLAUDE, fauxGh, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

test("the station's kitchen creates the issue of a recurring ticket due today, with its title, its body and `fire`", async (t) => {
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
  principal({ args: ["declare", "--title", "Daily triage", "--body", "Look at the inbox", "--rhythm", "daily"], env: { BRIGADE_STATE_DIR: etat }, dire: () => {}, redire: () => {} });
  const journal = ouvrirJournal(etat);
  const decisions = { BRIGADE_STATIONS: "box/claude:2:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium", BRIGADE_CLOSING_MODEL: "sonnet", BRIGADE_CLOSING_EFFORT: "medium" };
  for (const [name, value] of Object.entries(decisions)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  const cuisine = ouvrirCuisine(env, { dire: () => {}, intervalleTickMs: 5 });
  const creees = () => gh.appels().filter((args) => args.includes("POST") && args.at(-1) === `repos/${DEPOT}/issues` && args.includes("title=Daily triage"));
  try {
    await jusqua(() => lireLesRecurrents(etat)[0]?.lastIssue === 99);
    assert.equal(creees().length, 1, JSON.stringify(creees()));
    assert.ok(creees()[0]?.includes("body=Look at the inbox"));
    assert.ok(creees()[0]?.includes("labels[]=fire"));
  } finally {
    cuisine.arreter("fin du test");
    await cuisine.arretee?.();
  }
});

test("cuisine.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
