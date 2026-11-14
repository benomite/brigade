// Le ticket de la déclaration d'essai dans la cuisine d'un projet de la station
// (#3559) : le test passe par `ouvrirCuisine`, le point d'entrée de la station —
// un projet dont la base a un script `dev` npm et pas de `.brigade/try.json`
// reçoit une issue avec `fire`, une seule, tick après tick.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../src/station/configuration.ts";
import { poser, projetSurGit } from "../aides/projet-sur-git.ts";
import { DEPOT, FAUX_CLAUDE, fauxGh, git, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

test("the station's kitchen files one ticket, with `fire`, for a project whose base has no `.brigade/try.json`", async (t) => {
  const racine = repertoireTemporaire(t);
  const { amont, rapatrier } = projetSurGit(t, { reglages: { integrationBranch: "v2" }, clone: join(racine, CLONES, "brigade") });
  poser(amont, "package.json", JSON.stringify({ scripts: { dev: "vite --port 5173" } }));
  git(amont, "add", ".");
  git(amont, "commit", "-q", "-m", "un projet npm");
  rapatrier();
  const [projet] = lireConfiguration(`brigade ${DEPOT}`).projets;
  assert.ok(projet);
  const gh = fauxGh(t);
  gh.issues([]);
  gh.repondre(`repos/${DEPOT}/issues?state=all&since=*`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/issues`, { statut: 201, corps: { number: 99 } });
  const env = environnementDuProjet(racine, projet, { HOME: repertoireTemporaire(t), BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_SESSION_STATE: join(racine, "session", "renouvellement"), BRIGADE_GH_BIN: gh.bin });
  const etat = env.BRIGADE_STATE_DIR ?? "";
  mkdirSync(etat, { recursive: true });
  const journal = ouvrirJournal(etat);
  const decisions = { BRIGADE_STATIONS: "box/claude:2:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium", BRIGADE_CLOSING_MODEL: "sonnet", BRIGADE_CLOSING_EFFORT: "medium" };
  for (const [name, value] of Object.entries(decisions)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  const cuisine = ouvrirCuisine(env, { dire: () => {}, intervalleTickMs: 5 });
  const creees = () => gh.appels().filter((args) => args.includes("POST") && args.at(-1) === `repos/${DEPOT}/issues` && args.some((arg) => arg.startsWith("title=Declare how the project is tried")));
  const note = () => {
    try {
      return JSON.parse(readFileSync(join(etat, "declaration-essai.json"), "utf8")) as { ticket?: number };
    } catch {
      return null;
    }
  };
  try {
    await jusqua(() => note()?.ticket === 99);
    assert.equal(creees().length, 1, JSON.stringify(creees()));
    assert.ok(creees()[0]?.includes("labels[]=fire"));
    assert.ok(creees()[0]?.some((arg) => arg.startsWith("body=") && arg.includes('"command": "npm install && npm run dev"')));
    // D'autres ticks passent : aucun second ticket.
    const appels = gh.appels().length;
    await jusqua(() => gh.appels().length > appels + 3);
    assert.equal(creees().length, 1);
  } finally {
    cuisine.arreter("fin du test");
    await cuisine.arretee?.();
  }
});

test("cuisine.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
