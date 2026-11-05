// La cuisine d'un projet de la station dit son mode d'identité GitHub, et le
// retient pour `status` (#2316) : une identité par rôle avec les trois Apps,
// l'identité unique sans elles. Dans le process du test : ni station lancée,
// ni appel à GitHub. Ce que `status` dit des appels de chaque identité est
// dans appels-par-identite.test.ts.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { photoDuProjet } from "../../src/status.ts";
import { fauxGitHubApps } from "../aides/faux-github-apps.ts";
import { FAUX_CLAUDE, git, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const DECIDE = {
  BRIGADE_STATIONS: "box/claude:30:code",
  BRIGADE_MANAGER_MODEL: "sonnet",
  BRIGADE_MANAGER_EFFORT: "medium",
  BRIGADE_REVIEWER_MODEL: "sonnet",
  BRIGADE_REVIEWER_EFFORT: "medium",
};

// Ouvre puis arrête la cuisine d'un projet, avec ou sans Apps, et rend ce
// qu'elle a dit et les lignes d'identité de `status`.
async function ouvrir(t: TestContext, avecApps: boolean) {
  const racine = repertoireTemporaire(t);
  const etat = join(racine, "etat");
  const clone = join(racine, "clone");
  mkdirSync(etat);
  mkdirSync(clone);
  git(clone, "init", "-q");
  const journal = ouvrirJournal(etat);
  for (const [name, value] of Object.entries(DECIDE)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  const apps = avecApps ? await fauxGitHubApps(t) : null;
  const dites: string[] = [];
  const cuisine = ouvrirCuisine(
    {
      HOME: racine,
      BRIGADE_STATE_DIR: etat,
      BRIGADE_PROJECT: "brigade",
      BRIGADE_GITHUB_REPO: "acme/brigade",
      // Aucun test ne joint GitHub : ce `gh` n'existe pas, le tableau de la cuisine ne se publie nulle part.
      BRIGADE_GH_BIN: join(racine, "gh-absent"),
      BRIGADE_REPO_DIR: clone,
      BRIGADE_BASE_BRANCH: "v2",
      BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
      ...(apps ? { BRIGADE_GITHUB_APPS_DIR: apps.repertoire, BRIGADE_GITHUB_API_URL: apps.url } : {}),
    },
    { dire: (ligne) => dites.push(ligne) },
  );
  cuisine.arreter("fin du test");
  const lignes = photoDuProjet({ BRIGADE_STATE_DIR: etat }, { maintenant: new Date() });
  const rang = lignes.findIndex((ligne) => ligne.startsWith("identity   "));
  return { dites, identite: lignes[rang] };
}

test("avec les trois Apps, la cuisine dit une identité par rôle, et `status` le redit", async (t) => {
  const { dites, identite } = await ouvrir(t, true);
  assert.ok(
    dites.some((ligne) => ligne.startsWith("GitHub — une identité par rôle (cook, pass, manager)")),
    dites.join("\n"),
  );
  assert.equal(identite, "identity   GitHub — one identity per role");
});

test("sans Apps, la cuisine dit l'identité unique, et `status` le redit", async (t) => {
  const { dites, identite } = await ouvrir(t, false);
  assert.ok(!dites.some((ligne) => ligne.includes("une identité par rôle")), dites.join("\n"));
  assert.match(identite ?? "", /^identity {3}GitHub — single identity/);
});

test("cuisine-identites.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
