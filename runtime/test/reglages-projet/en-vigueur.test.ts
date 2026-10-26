// Les réglages du projet tels que le runtime les applique : ceux que porte la
// branche d'intégration de son dépôt passent avant ceux de la box — la branche
// de la ligne de configuration, le calibrage du manager et du reviewer, le
// plafond de calibrage posés au journal. Sur de vrais dépôts git, sans réseau
// (`aides/projet-sur-git.ts`).
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { poserDecision, suivreDecisions } from "../../src/decisions.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { PLAFOND_PAR_DEFAUT } from "../../src/reagir.ts";
import { avecLaBrancheDuDepot, brancheDuProjet, lireLeDepot, reglagesALaBase, reglagesPourMontrer } from "../../src/reglages-projet/en-vigueur.ts";
import { FICHIER, texteDuFichier, type ReglagesProjet } from "../../src/reglages-projet/reglages.ts";
import { ConfigInvalide } from "../../src/runtime.ts";
import { poser, projetSurGit } from "../aides/projet-sur-git.ts";
import { aArreter, git, repertoireTemporaire } from "../outils.ts";

// Ce que le dépôt du projet porte, partout différent de ce que la box tient.
const DU_DEPOT: ReglagesProjet = {
  integrationBranch: "v2",
  defaultCalibrations: { manager: { model: "opus", effort: "high" }, reviewer: { model: "sonnet", effort: "low" } },
  calibrationCeiling: { model: "sonnet", effort: "high" },
};

// Ce que la box tient : la ligne de configuration et les décisions du chef.
const DE_LA_BOX = {
  BRIGADE_MANAGER_MODEL: "haiku",
  BRIGADE_MANAGER_EFFORT: "low",
  BRIGADE_REVIEWER_MODEL: "haiku",
  BRIGADE_REVIEWER_EFFORT: "medium",
  BRIGADE_CEILING_MODEL: "opus",
  BRIGADE_CEILING_EFFORT: "max",
};

// Le journal du projet, où la box tient les décisions du chef. Fermé avant
// que son répertoire ne parte : sous Windows, un journal ouvert l'empêche.
function journalDeLaBox(t: TestContext, decisions: Record<string, string>) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  for (const [nom, valeur] of Object.entries(decisions)) poserDecision(journal, { projet: "espace", nom, valeur, auteur: "chef" });
  return journal;
}

describe("the project's settings are read from its repository before the box's", { concurrency: 8 }, () => {
  test("a clone whose integration branch carries the file: its branch, calibrations and ceiling are used, the box's values ignored", (t) => {
    // Le dépôt déclare `v2` ; sa branche par défaut, que la ligne nomme, aussi.
    const { clone } = projetSurGit(t, { reglages: DU_DEPOT, parDefaut: "main", autres: ["v2"] });
    const journal = journalDeLaBox(t, DE_LA_BOX);
    const lu = lireLeDepot({ BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: "main" });
    assert.equal(lu.env.BRIGADE_BASE_BRANCH, "v2");
    assert.deepEqual(lu.branche, { branche: "v2", provenance: "projet.json", problemes: [] });
    assert.deepEqual(lu.reglages, DU_DEPOT);

    const decisions = suivreDecisions(journal.base, {}, () => {}, lu.suivis);
    assert.deepEqual(decisions.manager(), { model: "opus", effort: "high" });
    assert.deepEqual(decisions.reviewer(), { model: "sonnet", effort: "low" });
    assert.deepEqual(decisions.plafond(), { model: "sonnet", effort: "high", pose: { model: false, effort: false }, depot: true });
  });

  test("a change merged on the integration branch applies to the next read once the station fetches it, without any restart", (t) => {
    const { clone, merger, rapatrier } = projetSurGit(t, { reglages: DU_DEPOT });
    const journal = journalDeLaBox(t, DE_LA_BOX);
    const lu = lireLeDepot({ BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: "v2" });
    const avertis: string[] = [];
    const decisions = suivreDecisions(journal.base, {}, (message) => void avertis.push(message), lu.suivis);
    assert.deepEqual(decisions.plafond(), { model: "sonnet", effort: "high", pose: { model: false, effort: false }, depot: true });

    // Le plafond baissé par une PR : rien ne change tant que la station ne l'a pas rapatriée…
    merger("v2", texteDuFichier({ ...DU_DEPOT, calibrationCeiling: { model: "haiku", effort: "medium" } }));
    assert.equal(decisions.plafond().model, "sonnet");
    // … et la lecture suivante le prend, comme le calibrage du manager.
    rapatrier();
    assert.deepEqual(decisions.plafond(), { model: "haiku", effort: "medium", pose: { model: false, effort: false }, depot: true });

    // Une PR qui casse le fichier : le runtime s'en tient à ce qu'il lisait, et le dit une fois.
    merger("v2", "{ not json");
    rapatrier();
    assert.equal(decisions.plafond().model, "haiku");
    assert.equal(decisions.manager().model, "opus");
    assert.equal(avertis.length, 1, avertis.join("\n"));
    assert.match(avertis[0] ?? "", /réglages du dépôt non relus — `\.claude\/brigade\/projet\.json` is not valid JSON/);

    // Le fichier retiré : la box reprend la main, ses décisions comme avant.
    git(join(clone, "..", "amont"), "rm", "-q", FICHIER);
    git(join(clone, "..", "amont"), "commit", "-q", "-m", "plus de réglages");
    rapatrier();
    assert.deepEqual(decisions.plafond(), { model: "opus", effort: "max", pose: { model: true, effort: true } });
    assert.deepEqual(decisions.manager(), { model: "haiku", effort: "low" });
  });

  test("a project whose repository has no file: the box's branch, calibrations and ceiling, as before", (t) => {
    const { clone } = projetSurGit(t, { claudeMd: "- **Branche d'intégration** : `v2`\n" });
    const lu = lireLeDepot({ BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: "v2" });
    assert.equal(lu.env.BRIGADE_BASE_BRANCH, "v2");
    assert.equal(lu.branche.provenance, "configuration");
    assert.equal(lu.reglages, null);

    const posees = suivreDecisions(journalDeLaBox(t, DE_LA_BOX).base, {}, () => {}, lu.suivis);
    assert.deepEqual(posees.manager(), { model: "haiku", effort: "low" });
    assert.deepEqual(posees.reviewer(), { model: "haiku", effort: "medium" });
    assert.deepEqual(posees.plafond(), { model: "opus", effort: "max", pose: { model: true, effort: true } });
    // Rien de posé sur la box pour le plafond : son défaut, comme avant.
    const { BRIGADE_CEILING_MODEL: _m, BRIGADE_CEILING_EFFORT: _e, ...sansPlafond } = DE_LA_BOX;
    const parDefaut = suivreDecisions(journalDeLaBox(t, sansPlafond).base, {}, () => {}, lu.suivis);
    assert.deepEqual(parDefaut.plafond(), { ...PLAFOND_PAR_DEFAUT, pose: { model: false, effort: false } });
  });

  test("a fresh clone and a station line that names no branch: the project's branch, calibrations and ceiling, nothing entered on the box", (t) => {
    // La branche par défaut du dépôt n'est pas sa branche d'intégration.
    const { clone } = projetSurGit(t, { reglages: DU_DEPOT, parDefaut: "main", autres: ["v2"] });
    const lu = lireLeDepot({ BRIGADE_REPO_DIR: clone });
    assert.equal(lu.env.BRIGADE_BASE_BRANCH, "v2");
    assert.deepEqual(lu.branche, { branche: "v2", provenance: "projet.json", problemes: [] });
    // Aucune décision au journal : tout vient du dépôt.
    const decisions = suivreDecisions(journalDeLaBox(t, {}).base, {}, () => {}, lu.suivis);
    assert.deepEqual(decisions.manager(), { model: "opus", effort: "high" });
    assert.deepEqual(decisions.reviewer(), { model: "sonnet", effort: "low" });
    assert.deepEqual(decisions.plafond(), { model: "sonnet", effort: "high", pose: { model: false, effort: false }, depot: true });
    assert.match(lu.dits.at(-1) ?? "", /branch v2 \(from \.claude\/brigade\/projet\.json\); from \.claude\/brigade\/projet\.json on origin\/v2, reread at each use: manager opus\/high, reviewer sonnet\/low, ceiling sonnet\/high, closer box/);
  });

  test("without the box's calibrations nor the repository's, the runtime refuses to start, naming both places", (t) => {
    const { clone } = projetSurGit(t, { reglages: { integrationBranch: "v2" } });
    const lu = lireLeDepot({ BRIGADE_REPO_DIR: clone });
    assert.throws(() => suivreDecisions(journalDeLaBox(t, {}).base, {}, () => {}, lu.suivis), /BRIGADE_MANAGER_MODEL n'est pas défini.*`\.claude\/brigade\/projet\.json` du dépôt \(`defaultCalibrations\.manager`\)/);
  });

  test("a file on the integration branch that is not the project's settings: the kitchen refuses to open rather than fall back on the box", (t) => {
    const { clone } = projetSurGit(t, { reglages: JSON.stringify({ version: 1, integrationBranch: "v2", calibrationCeiling: { model: "gpt", effort: "high" } }) });
    assert.throws(() => lireLeDepot({ BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: "v2" }), (erreur: unknown) => erreur instanceof ConfigInvalide && /settings on origin\/v2 are refused — `calibrationCeiling\.model` must be one of/.test(erreur.message));
  });
});

describe("the integration branch is resolved from the repository", { concurrency: 8 }, () => {
  test("the file on the branch the line names comes first, then the file of the clone's working tree, then the line, then the CLAUDE.md line", (t) => {
    // Le fichier sur la branche que la ligne nomme : il fait foi.
    const surLaLigne = projetSurGit(t, { reglages: { integrationBranch: "develop" }, autres: ["develop"] });
    assert.deepEqual(brancheDuProjet(surLaLigne.clone, "v2"), { branche: "develop", provenance: "projet.json", problemes: [] });
    // La ligne nomme une branche sans le fichier : celui de l'arbre du clone.
    const dansLArbre = projetSurGit(t, { reglages: { integrationBranch: "develop" }, parDefaut: "main" });
    git(join(dansLArbre.clone, "..", "amont"), "checkout", "-q", "-b", "nue");
    git(join(dansLArbre.clone, "..", "amont"), "rm", "-q", FICHIER);
    git(join(dansLArbre.clone, "..", "amont"), "commit", "-q", "-m", "sans réglages");
    dansLArbre.rapatrier();
    assert.deepEqual(brancheDuProjet(dansLArbre.clone, "nue"), { branche: "develop", provenance: "projet.json", problemes: [] });
    // Aucun fichier : la ligne, sinon le CLAUDE.md.
    const sans = projetSurGit(t, { claudeMd: "- **Branche d'intégration** : `trunk`\n" });
    assert.deepEqual(brancheDuProjet(sans.clone, "v2"), { branche: "v2", provenance: "configuration", problemes: [] });
    assert.deepEqual(brancheDuProjet(sans.clone, null), { branche: "trunk", provenance: "CLAUDE.md", problemes: [] });
    // Rien nulle part : rien n'est deviné.
    assert.deepEqual(brancheDuProjet(projetSurGit(t).clone, null), { branche: null, provenance: null, problemes: [] });
  });

  test("a branch the clone does not know, or an unreadable file, is said — the resolution goes on, it never throws", (t) => {
    const { clone } = projetSurGit(t, { claudeMd: "- **Branche d'intégration** : `v2`\n" });
    const inconnue = brancheDuProjet(clone, "disparue");
    assert.equal(inconnue.branche, "disparue");
    assert.equal(inconnue.provenance, "configuration");
    assert.match(inconnue.problemes[0] ?? "", /^\.claude\/brigade\/projet\.json not read on origin\/disparue — /);

    poser(clone, FICHIER, "{ not json");
    const illisible = brancheDuProjet(clone, null);
    assert.deepEqual(illisible.branche, "v2");
    assert.match(illisible.problemes[0] ?? "", /not read on the clone's working tree — `\.claude\/brigade\/projet\.json` is not valid JSON/);
  });

  test("a command run outside the kitchen reads the same branch and settings, and an unreadable repository shows none", (t) => {
    const { clone } = projetSurGit(t, { reglages: DU_DEPOT, parDefaut: "main", autres: ["v2"] });
    assert.equal(avecLaBrancheDuDepot({ BRIGADE_REPO_DIR: clone }).BRIGADE_BASE_BRANCH, "v2");
    assert.equal(avecLaBrancheDuDepot({ BRIGADE_REPO_DIR: join(clone, "absent"), BRIGADE_BASE_BRANCH: "main" }).BRIGADE_BASE_BRANCH, "main");
    assert.deepEqual(reglagesPourMontrer({ BRIGADE_REPO_DIR: clone }), DU_DEPOT);
    assert.deepEqual(reglagesALaBase({ clone, base: "main" }), DU_DEPOT);
    assert.deepEqual(reglagesPourMontrer({ BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: "disparue" }), DU_DEPOT, "the line's unknown branch gives way to the working tree's file");
    assert.equal(reglagesPourMontrer({}), null);
  });
});
