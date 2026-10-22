// Ce que la station fait d'un projet demandé avant de lui écrire sa ligne :
// l'autorisation de ses Apps sur le dépôt, contre un faux GitHub d'Apps ; le
// clone, par une doublure de `gh` ; les décisions du parcours, au journal.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { posixOnly } from "../support/plateforme.ts";
import { decisionsPosees, poserDecision } from "../../src/decisions.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { cloner, decisionsDe, machineDe, poserLesDecisions, verifierAutorisation } from "../../src/projets/preparer.ts";
import { fauxGitHubApps } from "../aides/faux-github-apps.ts";
import { depotGit, git, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const FAUX_GH = join(import.meta.dirname, "faux-gh.ts");
const PARADE = { nom: "parade", depot: "benomite/parade", base: "main", principale: true, cooks: 3, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: null };

test("sans Apps, la station agit sous le compte de son `gh` : rien à autoriser", async () => {
  assert.deepEqual(await verifierAutorisation({}, "benomite/parade"), { autorisee: true });
});

test("avec ses Apps : autorisées, rien à faire ; une App pas installée sur le dépôt, la page où l'installer, en un clic", async (t) => {
  const apps = await fauxGitHubApps(t);
  const env = { BRIGADE_GITHUB_APPS_DIR: apps.repertoire, BRIGADE_GITHUB_API_URL: apps.url };
  assert.deepEqual(await verifierAutorisation(env, "benomite/parade"), { autorisee: true });

  apps.desinstaller("cook");
  apps.desinstaller("manager");
  assert.deepEqual(await verifierAutorisation(env, "benomite/parade"), { autorisee: false, pages: ["https://github.com/apps/brigade-cook/installations/new", "https://github.com/apps/brigade-manager/installations/new"] });

  apps.panne(502, "Server Error");
  const panne = await verifierAutorisation(env, "benomite/parade");
  assert.ok("panne" in panne, JSON.stringify(panne));
});

test("le dépôt se clone à sa place par le `gh` de la machine ; déjà cloné, rien ne se refait ; introuvable, rien ne reste", { skip: posixOnly("builds a real git repository, whose .git/config git refuses on Windows") }, async (t) => {
  const { origine } = depotGit(t);
  const origines = repertoireTemporaire(t);
  const gists = repertoireTemporaire(t);
  mkdirSync(join(origines, "benomite"));
  git(origines, "clone", "-q", "--bare", origine, join(origines, "benomite/parade.git"));
  const avant = { FAUX_ORIGINES: process.env.FAUX_ORIGINES, FAUX_GISTS: process.env.FAUX_GISTS };
  Object.assign(process.env, { FAUX_ORIGINES: origines, FAUX_GISTS: gists });
  t.after(() => {
    for (const [nom, valeur] of Object.entries(avant)) if (valeur === undefined) delete process.env[nom];
    else process.env[nom] = valeur;
  });
  const racine = repertoireTemporaire(t);
  const clone = join(racine, "clones/parade");

  await cloner({ gh: FAUX_GH, depot: "benomite/parade", clone });
  assert.ok(existsSync(join(clone, "LISEZMOI")));
  assert.ok(!existsSync(`${clone}.clonage`));
  await cloner({ gh: FAUX_GH, depot: "benomite/parade", clone });
  assert.equal(readFileSync(join(gists, "clones"), "utf8").split("\n").filter(Boolean).length, 1);

  await assert.rejects(cloner({ gh: FAUX_GH, depot: "benomite/absent", clone: join(racine, "clones/absent") }), /clone de benomite\/absent en échec — GraphQL: Could not resolve/);
  assert.ok(!existsSync(join(racine, "clones/absent")));
  assert.ok(!existsSync(join(racine, "clones/absent.clonage")));
});

test("les décisions du parcours sont posées sous le nom du chef ; celles qu'il a changées depuis ne sont pas écrasées", (t) => {
  const etat = repertoireTemporaire(t);
  assert.deepEqual(decisionsDe(PARADE, "Box du Salon"), {
    BRIGADE_STATIONS: "box-du-salon/claude:3:code+raisonnement",
    BRIGADE_MANAGER_MODEL: "sonnet",
    BRIGADE_MANAGER_EFFORT: "medium",
    BRIGADE_REVIEWER_MODEL: "opus",
    BRIGADE_REVIEWER_EFFORT: "high",
  });
  assert.equal(machineDe("box"), "box");
  const journal = ouvrirJournal(etat);
  poserDecision(journal, { projet: "parade", nom: "BRIGADE_MANAGER_MODEL", valeur: "haiku", auteur: "chef" });
  journal.fermer();

  assert.deepEqual(poserLesDecisions(etat, "parade", decisionsDe(PARADE, "box")), ["BRIGADE_STATIONS", "BRIGADE_MANAGER_EFFORT", "BRIGADE_REVIEWER_MODEL", "BRIGADE_REVIEWER_EFFORT"]);
  assert.deepEqual(poserLesDecisions(etat, "parade", decisionsDe(PARADE, "box")), []);
  const relu = ouvrirJournal(etat, { lectureSeule: true });
  try {
    assert.equal(decisionsPosees(relu.base).BRIGADE_MANAGER_MODEL, "haiku");
  } finally {
    relu.fermer();
  }
});

test("preparer.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
