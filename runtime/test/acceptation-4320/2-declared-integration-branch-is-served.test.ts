// #4320, critère 2 : un projet dont le setup déclare une branche d'intégration est servi sur cette branche — même quand sa ligne en garde une périmée.
// Le dépôt n'a que `main` et `develop` ; son `projet.json` déclare `develop` ; la ligne dit `v2`. La station prend le ticket en lisant
// la CI de `develop`, et ne consulte pas `origin/v2`.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { brancheDuTicket } from "../../src/brigade-github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../src/station/configuration.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { DEPOT, FAUX_CLAUDE, fauxGh, issueGitHub, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

test("a project whose setup declares an integration branch is served on that branch, whatever its line says", async (t) => {
  const racine = repertoireTemporaire(t);
  projetSurGit(t, { reglages: { integrationBranch: "develop" }, parDefaut: "main", autres: ["develop"], clone: join(racine, CLONES, "brigade") });
  const [projet] = lireConfiguration(`brigade ${DEPOT} v2`).projets;
  assert.ok(projet);
  const gh = fauxGh(t);
  gh.repondre("user", { corps: { login: "chef" } });
  gh.repondre(`repos/${DEPOT}`, { corps: { full_name: DEPOT, owner: { login: "acme", type: "Organization" }, permissions: { push: true } } });
  gh.issues([issueGitHub(7, { labels: ["fire", "model:sonnet", "effort:low"] })]);
  gh.repondre(`repos/${DEPOT}/issues/7/events?per_page=100`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/pulls?head=${DEPOT.split("/")[0]}:${brancheDuTicket(7)}&state=all&per_page=1`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/commits/develop/check-runs?per_page=100`, { corps: { check_runs: [] } });
  gh.repondre(`repos/${DEPOT}/commits/develop/status?per_page=100`, { corps: { statuses: [] } });
  const env = environnementDuProjet(racine, projet, { HOME: repertoireTemporaire(t), BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_SESSION_STATE: join(racine, "session", "renouvellement"), BRIGADE_GH_BIN: gh.bin, BRIGADE_MAX_LOAD_PER_CORE: "1000000" });
  mkdirSync(env.BRIGADE_STATE_DIR ?? "", { recursive: true });
  const journal = ouvrirJournal(env.BRIGADE_STATE_DIR ?? "");
  const decisions = { BRIGADE_STATIONS: "box/claude:2:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium" };
  for (const [name, value] of Object.entries(decisions)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  const dits: string[] = [];
  const cuisine = ouvrirCuisine(env, { dire: (dit) => void dits.push(dit) });
  try {
    const prises = () => gh.appels().filter((args) => args.includes("POST") && args.at(-1) === `repos/${DEPOT}/issues/7/comments`);
    await jusqua(() => prises().length > 0);
    const chemins = gh.appels().map((args) => args.at(-1) ?? "");
    assert.ok(chemins.some((chemin) => chemin.includes("/commits/develop/")), "the station reads the CI of the declared branch");
    assert.ok(!chemins.some((chemin) => chemin.includes("/commits/v2/")), chemins.join("\n"));
    assert.ok(dits.some((dit) => dit.startsWith("project settings — branch develop (from .claude/brigade/projet.json)")), dits.join("\n"));
    assert.ok(!dits.some((dit) => dit.includes("origin/v2")), `the stale line branch is never consulted\n${dits.join("\n")}`);
  } finally {
    cuisine.arreter("fin du test");
    await cuisine.arretee?.();
  }
});

test("2-declared-integration-branch-is-served.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
