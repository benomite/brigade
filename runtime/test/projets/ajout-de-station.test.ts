// Ajouter une station à un projet déjà cloné sur la machine (#1306) : ce que
// le formulaire montre d'emblée — les cooks des cœurs de la machine, le
// dossier des espaces de travail, ce que la machine sait faire —, et un ajout
// fait de la seule saisie de la station, le dépôt et la branche lus dans le
// clone. Sur de vrais dépôts git, sans réseau (`aides/projet-sur-git.ts`).
import assert from "node:assert/strict";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { decisionsPosees } from "../../src/decisions.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import type { Sonde } from "../../src/installation/besoins/fourni.ts";
import { ajouterUneStation, defautsDeStation } from "../../src/projets/ajout-de-station.ts";
import { documentDeDemande, lireDemande, type ProjetDemande } from "../../src/projets/demande.ts";
import { decisionsDe, poserLesDecisions } from "../../src/projets/preparer.ts";
import { plafondDesCoeurs } from "../../src/projections/stations.ts";
import { worktreesDeLaStation } from "../../src/station/configuration.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { git, repertoireTemporaire } from "../outils.ts";

// Un clone d'espace, tel que l'app l'a ouvert sur la machine : son `origin`
// est sur github.com.
function espace(t: TestContext, contenu: Parameters<typeof projetSurGit>[1] = { reglages: { integrationBranch: "v2" } }) {
  const lieux = projetSurGit(t, contenu);
  git(lieux.clone, "remote", "set-url", "origin", "https://github.com/benomite/espace.git");
  return lieux;
}

// Une machine qui a Chrome et le SDK Android, et rien d'autre.
const MACHINE: Sonde = {
  commande: (nom) => nom === "google-chrome",
  dossier: (chemin) => chemin === "/opt/android-sdk",
  env: { ANDROID_HOME: "/opt/android-sdk" },
  maison: "/home/chef",
};

describe("the defaults of a station, read from this machine and the project's clone", { concurrency: 4 }, () => {
  test("cooks from the machine's cores, the workspace folder, and each capability flagged detected or not — with the project read from its clone", async (t) => {
    const { clone } = espace(t);
    const racine = repertoireTemporaire(t);
    const defauts = await defautsDeStation({ dossier: clone, racine, env: { HOME: "/home/chef" }, coeurs: 8, sonde: MACHINE });

    assert.deepEqual(defauts.projet, { nom: "espace", depot: "benomite/espace", base: "v2", source: "projet.json", probleme: null });
    assert.equal(defauts.coeurs, 8);
    assert.equal(defauts.cooks, 3);
    assert.match(defauts.cooksDit, /8 cores/);
    assert.equal(defauts.espaceDeTravail, worktreesDeLaStation(racine, "/home/chef"));

    const detectees = defauts.capacites.filter(({ detectee }) => detectee).map(({ capacite }) => capacite);
    assert.deepEqual(detectees, ["navigateur-headless", "android"]);
    assert.ok(defauts.capacites.length > detectees.length, "the capabilities not detected are listed too");
    for (const capacite of defauts.capacites) assert.equal(typeof capacite.detectee, "boolean", JSON.stringify(capacite));
    assert.ok(defauts.capacites.some(({ capacite, detectee }) => capacite === "docker" && !detectee));
  });

  test("with nothing overridden, the cores are this machine's own, and the cooks follow them", async (t) => {
    const { clone } = espace(t);
    const defauts = await defautsDeStation({ dossier: clone, racine: repertoireTemporaire(t) });
    assert.equal(defauts.coeurs, availableParallelism());
    assert.equal(defauts.cooks, plafondDesCoeurs(availableParallelism()));
    assert.ok(defauts.cooks >= 1);
  });

  test("a folder that is no clone of a github.com repository has no project: it is said, nothing is guessed", async (t) => {
    const defauts = await defautsDeStation({ dossier: repertoireTemporaire(t), racine: repertoireTemporaire(t), coeurs: 2, sonde: MACHINE });
    assert.equal(defauts.projet.depot, null);
    assert.equal(defauts.projet.base, null);
    assert.equal(defauts.cooks, 1);
  });
});

describe("adding a station with only what belongs to it", { concurrency: 4 }, () => {
  test("cooks, main or not, and capabilities are enough: the repository comes from the clone's origin, the branch from what the repository declares", async (t) => {
    const { clone } = espace(t);
    const ajout = await ajouterUneStation(clone, { cooks: 2, principale: true, capacites: ["navigateur-headless", "android"] });
    assert.ok("projet" in ajout, JSON.stringify(ajout));
    assert.deepEqual(ajout.projet, { nom: "espace", depot: "benomite/espace", base: null, principale: true, cooks: 2, manager: null, reviewer: null, ouvertLe: null, demandeLe: null, fournit: ["navigateur-headless", "android"] });
    // La demande ne nomme pas la branche : la station la relit dans le dépôt.
    assert.deepEqual(ajout.resolu, { depot: "benomite/espace", base: "v2", depuis: { depot: "clone", base: "projet.json" } });

    // Telle que la station la lit dans son gist, puis la pose au journal du projet, chez elle.
    const lue = lireDemande(documentDeDemande([ajout.projet]));
    assert.deepEqual(lue, { projets: [ajout.projet], problemes: [] });
    assert.deepEqual(decisionsDe(ajout.projet, "Mac du chef"), { BRIGADE_STATIONS: "mac-du-chef/claude:2:code+raisonnement+navigateur-headless+android" });
  });

  test("a repository without the settings file: the branch is the one its CLAUDE.md declares", async (t) => {
    const { clone } = espace(t, { claudeMd: "- **Branche d'intégration** : `main`\n", parDefaut: "main" });
    const ajout = await ajouterUneStation(clone, { cooks: 1, principale: false });
    assert.ok("projet" in ajout, JSON.stringify(ajout));
    assert.equal(ajout.projet.base, null);
    assert.equal(ajout.projet.fournit, undefined);
    assert.deepEqual(ajout.resolu, { depot: "benomite/espace", base: "main", depuis: { depot: "clone", base: "CLAUDE.md" } });
  });

  test("an older call that still names the repository and the branch keeps working, with or without a clone here", async (t) => {
    const ancien = { nom: "parade", depot: "benomite/parade", base: "main", principale: true, cooks: 3, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: "2026-10-15T12:00:00.000Z", demandeLe: "2026-10-15T12:01:00.000Z" };
    const sansClone = await ajouterUneStation(null, ancien);
    assert.deepEqual(sansClone, { projet: ancien, resolu: { depot: "benomite/parade", base: "main", depuis: { depot: "saisie", base: "saisie" } } });
    // Ce que l'appel nomme passe avant ce que le clone dit.
    const { clone } = espace(t);
    const avecClone = await ajouterUneStation(clone, ancien);
    assert.ok("projet" in avecClone, JSON.stringify(avecClone));
    assert.deepEqual(avecClone.projet, ancien);
    assert.deepEqual(lireDemande(documentDeDemande([avecClone.projet]))?.projets, [ancien]);
  });

  test("what cannot be resolved is named field by field, never guessed", async (t) => {
    // Un dossier sans clone de github.com, et rien de nommé.
    const vide = await ajouterUneStation(repertoireTemporaire(t), { cooks: 2, principale: true });
    assert.ok("refus" in vide, JSON.stringify(vide));
    assert.deepEqual(Object.keys(vide.refus).sort(), ["base", "depot"]);
    // Un clone dont le dépôt ne déclare pas sa branche.
    const { clone } = espace(t, {});
    const sansBranche = await ajouterUneStation(clone, { cooks: 2, principale: true });
    assert.ok("refus" in sansBranche && Object.keys(sansBranche.refus).join() === "base", JSON.stringify(sansBranche));
    // Une saisie de la station illisible.
    const illisible = await ajouterUneStation(clone, { base: "v2", cooks: 0, capacites: ["pas une capacité"], manager: { modele: "gpt", effort: "high" } });
    assert.ok("refus" in illisible, JSON.stringify(illisible));
    assert.deepEqual(Object.keys(illisible.refus).sort(), ["capacites", "cooks", "manager", "principale"]);
  });

  test("nothing from the station's fields is written into the project's repository: the clone stays clean", async (t) => {
    const { clone } = espace(t);
    const avant = { tete: git(clone, "rev-parse", "HEAD"), statut: git(clone, "status", "--porcelain", "--ignored", "--untracked-files=all") };
    assert.equal(avant.statut, "");
    const racine = repertoireTemporaire(t);

    const defauts = await defautsDeStation({ dossier: clone, racine, env: { HOME: repertoireTemporaire(t) }, coeurs: 16, sonde: MACHINE });
    const ajout = await ajouterUneStation(clone, { cooks: defauts.cooks, principale: true, capacites: defauts.capacites.filter(({ detectee }) => detectee).map(({ capacite }) => capacite) });
    assert.ok("projet" in ajout, JSON.stringify(ajout));
    // Ce que la station en fait : ses décisions, au journal du projet sous son répertoire.
    const etat = join(racine, "etat", "espace");
    assert.deepEqual(poserLesDecisions(etat, "espace", decisionsDe(ajout.projet, "mac")), ["BRIGADE_STATIONS"]);
    const journal = ouvrirJournal(etat, { lectureSeule: true });
    try {
      assert.equal(decisionsPosees(journal.base).BRIGADE_STATIONS, "mac/claude:7:code+raisonnement+navigateur-headless+android");
    } finally {
      journal.fermer();
    }

    assert.deepEqual({ tete: git(clone, "rev-parse", "HEAD"), statut: git(clone, "status", "--porcelain", "--ignored", "--untracked-files=all") }, avant);
  });
});

test("the station reads the capabilities of its demand; an unreadable one is only ignored, and said", () => {
  const projet: ProjetDemande = { nom: "espace", depot: "benomite/espace", base: null, principale: true, cooks: 2, manager: null, reviewer: null, ouvertLe: null, demandeLe: null };
  const lu = lireDemande(JSON.stringify({ brigade: "projets", format: 1, projets: [{ ...projet, fournit: ["android", "android", "pas une capacité", 3] }] }));
  assert.deepEqual(lu?.projets, [{ ...projet, fournit: ["android"] }]);
  assert.deepEqual(lu?.problemes, ["projet « espace » demandé par l'app : 2 capacités illisibles sont ignorées — attendu des lettres, des chiffres et des tirets"]);
});
