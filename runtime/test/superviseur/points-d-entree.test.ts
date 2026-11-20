// Le superviseur (#3945) est atteint des deux points d'entrée du runtime : la
// cuisine d'un projet de la station (`station/cuisine.ts`, `ouvrirCuisine`) et
// le runtime d'un seul projet (`main.ts`). La base de leur projet est rouge
// depuis plus de 10 min : le superviseur se réveille, et le manager du projet
// est lancé sur sa consigne, son dossier compris.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../src/station/configuration.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { BASE, DEPOT, depotGit, ENV_GIT, FAUX_CLAUDE, fauxGh, type FauxGh, jusqua, lancementsDuFauxClaude, lancer, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

const MAIN = join(import.meta.dirname, "../../src/main.ts");
const HORLOGE_EN_AVANCE = pathToFileURL(join(import.meta.dirname, "../aides/horloge-en-avance.ts")).href;
// Ce par quoi commence la consigne du superviseur (`superviseur/brancher.ts`).
const CONSIGNE = "et le superviseur de ce run : la cuisine ne bouge pas";
const ONZE_MINUTES = 11 * 60_000;

// Le `gh` du projet : aucun ticket, et le check `tests` rouge sur la tête de `v2`.
function baseRouge(t: TestContext): FauxGh {
  const gh = fauxGh(t);
  gh.repondre("user", { corps: { login: "chef" } });
  gh.repondre(`repos/${DEPOT}`, { corps: { full_name: DEPOT, owner: { login: "acme", type: "Organization" }, permissions: { push: true } } });
  gh.issues([]);
  gh.repondre(`repos/${DEPOT}/issues?state=open&per_page=100`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/commits/${BASE}/check-runs?per_page=100`, { corps: { check_runs: [{ name: "tests", status: "completed", conclusion: "failure", html_url: `https://github.com/${DEPOT}/actions/runs/5/job/6` }] } });
  gh.repondre(`repos/${DEPOT}/commits/${BASE}/status?per_page=100`, { corps: { statuses: [] } });
  return gh;
}

// Le tour GitHub seul a lu la base rouge : il cherche aussitôt la livraison qui l'a cassée (`livraison-rouge/`).
const luLaBase = (gh: FauxGh) => gh.appels().some((appel) => appel.at(-1) === `repos/${DEPOT}/commits/${BASE}`);
const superviseurLance = (temoin: string) => lancementsDuFauxClaude(temoin).filter(({ args, entree }) => [...args, entree].join("\n").includes(CONSIGNE));

// Attend un fait sans lire l'heure : le `Date` de la cuisine est figé par le test, et `jusqua` le lit.
// Au plus quatre mille regards, cinq millisecondes l'un de l'autre.
async function attendre(condition: () => boolean): Promise<void> {
  for (let regard = 0; regard < 4000 && !condition(); regard++) await new Promise((fin) => setTimeout(fin, 5));
  assert.ok(condition(), "condition jamais remplie");
}

test("the station's kitchen reaches the supervisor: main red for 10 min launches the project's manager on the supervisor's brief", async (t) => {
  const racine = repertoireTemporaire(t);
  projetSurGit(t, { reglages: { integrationBranch: BASE }, clone: join(racine, CLONES, "brigade") });
  const [projet] = lireConfiguration(`brigade ${DEPOT}`).projets;
  assert.ok(projet);
  const gh = baseRouge(t);
  const temoin = repertoireTemporaire(t);
  const env = environnementDuProjet(racine, projet, { HOME: repertoireTemporaire(t), BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, FAUX_CLAUDE_TEMOIN: temoin, BRIGADE_SESSION_STATE: join(racine, "session", "renouvellement"), BRIGADE_GH_BIN: gh.bin });
  mkdirSync(env.BRIGADE_STATE_DIR ?? "", { recursive: true });
  const journal = ouvrirJournal(env.BRIGADE_STATE_DIR ?? "");
  const decisions = { BRIGADE_STATIONS: "box/claude:2:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium" };
  for (const [name, value] of Object.entries(decisions)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  const depart = Date.parse("2026-11-20T10:00:00.000Z");
  t.mock.timers.enable({ apis: ["Date"], now: depart });
  const cuisine = ouvrirCuisine(env, { dire: () => {}, intervalleTickMs: 20 });
  try {
    await attendre(() => luLaBase(gh));
    // Rouge depuis moins de 10 min : rien ne part.
    assert.deepEqual(superviseurLance(temoin), []);
    t.mock.timers.setTime(depart + ONZE_MINUTES);
    await attendre(() => superviseurLance(temoin).length > 0);
    const [lancement] = superviseurLance(temoin);
    assert.match([...(lancement?.args ?? []), lancement?.entree].join("\n"), /"cause": "main-red"/);
  } finally {
    cuisine.arreter("fin du test");
    await cuisine.arretee?.();
  }
});

test("the single-project runtime (main.ts) reaches the supervisor: main red for 10 min launches the project's manager on the supervisor's brief", { skip: posixOnly("stops the runtime with SIGTERM expecting exit 0; on Windows SIGTERM kills the runtime before its handler runs") }, async (t) => {
  const repertoire = repertoireTemporaire(t);
  const gh = baseRouge(t);
  const temoin = repertoireTemporaire(t);
  const avance = join(repertoireTemporaire(t), "avance");
  const runtime = lancer(t, MAIN, [], {
    ...ENV_GIT,
    NODE_OPTIONS: `--import=${HORLOGE_EN_AVANCE}`,
    HORLOGE_EN_AVANCE: avance,
    BRIGADE_STATE_DIR: repertoire,
    BRIGADE_PROJECT: "brigade",
    BRIGADE_GITHUB_REPO: DEPOT,
    BRIGADE_GH_BIN: gh.bin,
    BRIGADE_REPO_DIR: depotGit(t).clone,
    BRIGADE_BASE_BRANCH: BASE,
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    FAUX_CLAUDE_TEMOIN: temoin,
    BRIGADE_STATIONS: "box/claude:2:code",
    BRIGADE_MANAGER_MODEL: "sonnet",
    BRIGADE_MANAGER_EFFORT: "medium",
    BRIGADE_REVIEWER_MODEL: "sonnet",
    BRIGADE_REVIEWER_EFFORT: "medium",
    BRIGADE_MAX_LOAD_PER_CORE: "1000000",
    BRIGADE_MIN_FREE_MEMORY_MB: "0",
    BRIGADE_MIN_FREE_DISK_MB: "0",
  });
  await runtime.attendre("démarré");
  await jusqua(() => luLaBase(gh));
  assert.deepEqual(superviseurLance(temoin), []);
  writeFileSync(avance, String(ONZE_MINUTES));
  // Le runtime se réveille quand son journal bouge : une décision du chef, reposée telle quelle.
  const journal = ouvrirJournal(repertoire);
  journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name: "BRIGADE_REVIEWER_EFFORT", value: "medium", previous: "medium" } });
  journal.fermer();
  await jusqua(() => superviseurLance(temoin).length > 0);
  const [lancement] = superviseurLance(temoin);
  assert.match([...(lancement?.args ?? []), lancement?.entree].join("\n"), /"cause": "main-red"/);
  runtime.process.kill("SIGTERM");
  assert.equal(await runtime.fin, 0);
});

test("points-d-entree.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
