// Les réglages du closer que porte le dépôt du projet (#1684) : son calibrage,
// sa condition de départ, ses plafonds de tokens et de lignes retirées, dans
// `.claude/brigade/projet.json`. Le fichier les accepte et refuse ce qui n'en
// est pas ; chaque station qui sert le projet les applique au rapatriement
// suivant de la branche d'intégration, sans redémarrage ni geste sur la box,
// et deux stations appliquent les mêmes ; ils passent avant ce que la box
// tenait, et `closing --json` comme `station` disent d'où vient chaque valeur.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { principal as fermeture } from "../../src/closing/command.ts";
import { poserDecision, suivreDecisions } from "../../src/decisions.ts";
import type { LectureDeFermeture } from "../../src/fermeture-lecture/lecture.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { principal as station } from "../../src/montrer-station.ts";
import { appliquerLeChangement, changementsDits } from "../../src/reglages-projet/proposer.ts";
import { lireLeDepot } from "../../src/reglages-projet/en-vigueur.ts";
import { ecrireReglagesProjet, FICHIER, ReglageRefuse, reglagesDuTexte, texteDuFichier, validerReglagesProjet, type ReglagesProjet } from "../../src/reglages-projet/reglages.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { aArreter, appeler, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const AVEC_CLOSER: ReglagesProjet = {
  integrationBranch: "v2",
  closer: { calibration: { model: "sonnet", effort: "medium" }, cooksBelow: 2, maxTokens: 300_000, maxRemovedLines: 200 },
};

// Le refus que l'écriture oppose à ces réglages : son motif et sa clé.
function refus(reglages: unknown): { motif: string; cle: string; message: string } {
  try {
    validerReglagesProjet(reglages);
  } catch (erreur) {
    if (erreur instanceof ReglageRefuse) return { motif: erreur.motif, cle: erreur.cle, message: erreur.message };
    throw erreur;
  }
  assert.fail(`accepté : ${JSON.stringify(reglages)}`);
}

// Ce sans quoi le runtime ne lit pas ses décisions : le calibrage du manager
// et du reviewer.
const OBLIGATOIRES = { BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium" };

// Le journal d'une station du projet, où le chef a posé ses décisions sur la
// box. Fermé avant que son répertoire ne parte.
function journalDeStation(t: TestContext, decisions: Record<string, string>) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  aArreter(t, () => journal.fermer());
  for (const [nom, valeur] of Object.entries({ ...OBLIGATOIRES, ...decisions })) poserDecision(journal, { projet: "espace", nom, valeur, auteur: "chef" });
  return { repertoire, journal };
}

test("projet.json accepts the closer's settings, written in one fixed form, and reads them back", (t) => {
  const repertoire = repertoireTemporaire(t);
  git(repertoire, "init", "-q");
  // Dans le désordre : le fichier, lui, a un ordre fixe.
  const ecrits = ecrireReglagesProjet(repertoire, { closer: { maxRemovedLines: 200, maxTokens: 300_000, cooksBelow: 2, calibration: { effort: "medium", model: "sonnet" } }, integrationBranch: "v2" });
  assert.deepEqual(ecrits, AVEC_CLOSER);
  const texte = readFileSync(join(repertoire, FICHIER), "utf8");
  assert.equal(texte, texteDuFichier(AVEC_CLOSER));
  assert.match(texte, /"closer": \{\n {4}"calibration": \{\n {6}"model": "sonnet",\n {6}"effort": "medium"\n {4}\},\n {4}"cooksBelow": 2,\n {4}"maxTokens": 300000,\n {4}"maxRemovedLines": 200\n {2}\}\n\}\n$/);
  assert.deepEqual(reglagesDuTexte(texte), AVEC_CLOSER);
  // Chacun est facultatif ; un closer vide n'est pas écrit.
  assert.deepEqual(validerReglagesProjet({ integrationBranch: "v2", closer: { maxTokens: 1 } }), { integrationBranch: "v2", closer: { maxTokens: 1 } });
  assert.deepEqual(validerReglagesProjet({ integrationBranch: "v2", closer: {} }), { integrationBranch: "v2" });
});

test("an unknown or invalid setting of the closer is refused, and named, as for the other fields", () => {
  assert.deepEqual(refus({ integrationBranch: "v2", closer: "sonnet" }).cle, "closer");
  assert.deepEqual(refus({ integrationBranch: "v2", closer: { model: "sonnet" } }).cle, "closer.model");
  assert.match(refus({ integrationBranch: "v2", closer: { model: "sonnet" } }).message, /is not a setting of the closer: expected `calibration`, `cooksBelow`, `maxTokens`, `maxRemovedLines`/);
  assert.deepEqual(refus({ integrationBranch: "v2", closer: { calibration: { model: "sonnet" } } }).cle, "closer.calibration.effort");
  assert.deepEqual(refus({ integrationBranch: "v2", closer: { calibration: { model: "gpt", effort: "high" } } }).cle, "closer.calibration.model");
  for (const nom of ["cooksBelow", "maxTokens", "maxRemovedLines"]) {
    for (const valeur of [0, -3, 1.5, "200", null, 2 ** 53]) {
      const lu = refus({ integrationBranch: "v2", closer: { [nom]: valeur } });
      assert.deepEqual([lu.motif, lu.cle], ["invalide", `closer.${nom}`], `${nom}: ${String(valeur)}`);
      assert.match(lu.message, /must be an integer greater than zero/);
    }
  }
  // Les noms du closer ne valent qu'à leur place : ailleurs, le crible les
  // refuse pour ce qu'ils disent, et sous `closer` un autre nom aussi.
  assert.deepEqual(refus({ integrationBranch: "v2", cooksBelow: 2 }).motif, "limite-machine");
  assert.deepEqual(refus({ integrationBranch: "v2", maxTokens: 2 }).motif, "secret");
  assert.deepEqual(refus({ integrationBranch: "v2", closer: { cooks: 2 } }).motif, "limite-machine");
  assert.deepEqual(refus({ integrationBranch: "v2", closer: { apiToken: "x" } }).motif, "secret");
});

test("a proposed change sets or withdraws the closer's settings one by one, and keeps the others", () => {
  const apres = validerReglagesProjet(appliquerLeChangement(AVEC_CLOSER, { closer: { maxTokens: 100_000, cooksBelow: null } }));
  assert.deepEqual(apres, { integrationBranch: "v2", closer: { calibration: { model: "sonnet", effort: "medium" }, maxTokens: 100_000, maxRemovedLines: 200 } });
  assert.deepEqual(changementsDits(AVEC_CLOSER, apres), ["closer's `cooksBelow`: 2 → none", "closer's `maxTokens`: 300000 → 100000"]);
  // Un autre réglage proposé ne touche pas au closer.
  assert.deepEqual(validerReglagesProjet(appliquerLeChangement(AVEC_CLOSER, { calibrationCeiling: { model: "opus", effort: "high" } })).closer, AVEC_CLOSER.closer);
});

test("two stations serving the project apply the closer's settings of projet.json at their next fetch, with no restart and no box command, over what each box held", (t) => {
  const projet = projetSurGit(t, { reglages: { integrationBranch: "v2" } });
  const autreClone = join(repertoireTemporaire(t), "clone");
  git(join(projet.clone, ".."), "clone", "-q", projet.amont, autreClone);
  // Chaque box tient ses propres réglages du closer : elles diffèrent.
  const stations = [
    { clone: projet.clone, ...journalDeStation(t, { BRIGADE_CLOSING_MODEL: "opus", BRIGADE_CLOSING_EFFORT: "high", BRIGADE_CLOSING_MAX_TOKENS: "900000" }) },
    { clone: autreClone, ...journalDeStation(t, { BRIGADE_CLOSING_MODEL: "haiku", BRIGADE_CLOSING_EFFORT: "low", BRIGADE_CLOSING_COOKS: "4" }) },
  ].map(({ clone, journal }) => {
    const depot = lireLeDepot({ BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: "v2" });
    return { clone, decisions: suivreDecisions(journal.base, {}, () => {}, depot.suivis) };
  });

  assert.deepEqual(stations[0]?.decisions.fermeture(), {
    calibration: { model: "opus", effort: "high" },
    cooksBelow: 1,
    tokens: 900_000,
    removedLines: 500,
    from: { calibration: "station", cooksBelow: "default", tokens: "station", removedLines: "default" },
  });
  assert.deepEqual(stations[1]?.decisions.fermeture().calibration, { model: "haiku", effort: "low" });

  // Une PR mergée sur la branche d'intégration : tant qu'une station ne l'a
  // pas rapatriée, elle s'en tient à ce qu'elle lisait.
  projet.merger("v2", texteDuFichier({ integrationBranch: "v2", closer: { calibration: { model: "sonnet", effort: "medium" }, maxTokens: 300_000 } }));
  assert.deepEqual(stations[0]?.decisions.fermeture().calibration, { model: "opus", effort: "high" });

  // Rapatriée, elle vaut au même suivi : rien n'a redémarré, rien n'a été
  // posé sur la box. Les deux stations appliquent les mêmes valeurs là où le
  // dépôt les fixe ; ce qu'il tait reste à chaque box.
  for (const { clone } of stations) git(clone, "fetch", "-q", "origin");
  const [premiere, seconde] = stations.map(({ decisions }) => decisions.fermeture());
  assert.deepEqual(premiere, {
    calibration: { model: "sonnet", effort: "medium" },
    cooksBelow: 1,
    tokens: 300_000,
    removedLines: 500,
    from: { calibration: "repository", cooksBelow: "default", tokens: "repository", removedLines: "default" },
  });
  assert.deepEqual(seconde, {
    calibration: { model: "sonnet", effort: "medium" },
    cooksBelow: 4,
    tokens: 300_000,
    removedLines: 500,
    from: { calibration: "repository", cooksBelow: "station", tokens: "repository", removedLines: "default" },
  });

  // Une PR qui les retire rend la main à la box.
  projet.merger("v2", texteDuFichier({ integrationBranch: "v2" }));
  for (const { clone } of stations) git(clone, "fetch", "-q", "origin");
  assert.deepEqual(stations[0]?.decisions.fermeture().calibration, { model: "opus", effort: "high" });
  assert.deepEqual(stations[0]?.decisions.fermeture().from?.calibration, "station");
});

test("`closing --json` and `station` say where each of the closer's values comes from: the repository, the box, or the default", async (t) => {
  const projet = projetSurGit(t, { reglages: { integrationBranch: "v2", closer: { calibration: { model: "sonnet", effort: "medium" }, maxTokens: 300_000 } } });
  const { repertoire, journal } = journalDeStation(t, { BRIGADE_CLOSING_MODEL: "opus", BRIGADE_CLOSING_EFFORT: "high", BRIGADE_CLOSING_MAX_TOKENS: "900000", BRIGADE_CLOSING_MAX_REMOVED_LINES: "50" });
  // Le runtime note ce qu'il applique, comme `closing/run.ts` le fait.
  const decisions = suivreDecisions(journal.base, {}, () => {}, lireLeDepot({ BRIGADE_REPO_DIR: projet.clone, BRIGADE_BASE_BRANCH: "v2" }).suivis);
  journal.ajouter({ project: "espace", ticket: null, author: "closer", type: "closing.configured", payload: decisions.fermeture() });
  const env = { ...ENV_GIT, BRIGADE_STATE_DIR: repertoire, BRIGADE_REPO_DIR: projet.clone, BRIGADE_BASE_BRANCH: "v2" };

  const lue = appeler(fermeture, ["--json"], env);
  assert.equal(await lue.fin, 0, lue.sortie());
  const lecture = JSON.parse(lue.sortie()) as LectureDeFermeture;
  assert.ok(lecture.configured);
  assert.deepEqual(lecture.closer, {
    model: "sonnet",
    effort: "medium",
    cooksBelow: 1,
    tokens: 300_000,
    removedLines: 50,
    from: { calibration: "repository", cooksBelow: "default", tokens: "repository", removedLines: "station" },
  });

  const vue = appeler(station, [], env);
  assert.equal(await vue.fin, 0, vue.sortie());
  const sortie = vue.sortie();
  assert.match(sortie, /^ {2}closer-modele +sonnet — from the project's repository \(\.claude\/brigade\/projet\.json\); set on the box: opus, ignored$/m);
  assert.match(sortie, /^ {2}closer-tokens +300000 — from the project's repository \(\.claude\/brigade\/projet\.json\); set on the box: 900000, ignored$/m);
  assert.match(sortie, /^ {2}closer-retraits +50$/m);
  assert.match(sortie, /^ {2}closer-cooks +not set — the default, 1$/m);
  assert.match(sortie, /^closer in force +closer on `sonnet` \/ `medium` · starts under 1 cook in flight · 300,000 tokens at most · 50 lines removed at most\n {22}calibration from the project's repository \(\.claude\/brigade\/projet\.json\) · start condition the default · token cap from the project's repository \(\.claude\/brigade\/projet\.json\) · removed-lines cap set on the box$/m);

  // Posé sur la box, un réglage que le dépôt fixe est écrit, et dit ignoré.
  const pose = appeler(station, ["closer-effort", "max"], env);
  assert.equal(await pose.fin, 0, pose.sortie());
  assert.match(pose.sortie(), /\nbut the project's repository sets it \(\.claude\/brigade\/projet\.json: medium\): this decision is ignored while it does$/m);
});
