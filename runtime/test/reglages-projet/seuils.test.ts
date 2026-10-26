// Les seuils de dérive, de correction et de profil que porte le dépôt du
// projet (#1671), dans `.claude/brigade/projet.json` : le fichier les accepte
// et refuse ce qui n'en est pas ; ils passent avant ce que la box tenait,
// clé par clé, et une box sans le fichier garde ses gestes `station`.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { lireReglagesDuCorrectif } from "../../src/correctif/reglages.ts";
import { poserDecision, suivreDecisions } from "../../src/decisions.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { lireReglagesDesProfils } from "../../src/profils/reglages.ts";
import { lireLeDepot, variablesDuDepot } from "../../src/reglages-projet/en-vigueur.ts";
import { appliquerLeChangement, changementsDits } from "../../src/reglages-projet/proposer.ts";
import { ReglageRefuse, reglagesDuTexte, texteDuFichier, validerReglagesProjet, type ReglagesProjet } from "../../src/reglages-projet/reglages.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { aArreter, git, repertoireTemporaire } from "../outils.ts";

const COMPLETS: ReglagesProjet = {
  integrationBranch: "v2",
  drift: { contextKb: 400, gatesSeconds: 120, growthPercent: 25, merges: 8, repoMb: 300, tests: 5000, testsSeconds: 600, ticketTokens: 3_000_000, lostTokens: 1_000_000, firstTryPercent: 60, firstTryWindow: 12 },
  correction: { threshold: 4, window: 30 },
  profile: { window: 40, minTickets: 6, gapPoints: 15 },
};

const OBLIGATOIRES = { BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium" };

function journalDeStation(t: TestContext, decisions: Record<string, string>) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  for (const [nom, valeur] of Object.entries({ ...OBLIGATOIRES, ...decisions })) poserDecision(journal, { projet: "espace", nom, valeur, auteur: "chef" });
  return journal;
}

function refus(reglages: unknown): { motif: string; cle: string; message: string } {
  try {
    validerReglagesProjet(reglages);
  } catch (erreur) {
    if (erreur instanceof ReglageRefuse) return { motif: erreur.motif, cle: erreur.cle, message: erreur.message };
    throw erreur;
  }
  assert.fail(`accepté : ${JSON.stringify(reglages)}`);
}

test("projet.json accepts the drift, correction and profile thresholds, in one fixed form, and reads them back", () => {
  assert.deepEqual(validerReglagesProjet(COMPLETS), COMPLETS);
  const texte = texteDuFichier(COMPLETS);
  assert.deepEqual(reglagesDuTexte(texte), COMPLETS);
  assert.match(texte, /"correction": \{\n {4}"threshold": 4,\n {4}"window": 30\n {2}\}/);
  // Chacun est facultatif ; une famille vide n'est pas écrite.
  assert.deepEqual(validerReglagesProjet({ integrationBranch: "v2", drift: { tests: 10 }, profile: {} }), { integrationBranch: "v2", drift: { tests: 10 } });
});

test("an unknown or invalid threshold is refused, and named", () => {
  assert.equal(refus({ integrationBranch: "v2", drift: "high" }).cle, "drift");
  const inconnu = refus({ integrationBranch: "v2", drift: { loc: 5 } });
  assert.equal(inconnu.cle, "drift.loc");
  assert.match(inconnu.message, /is not a drift threshold: expected `contextKb`/);
  for (const valeur of [0, -1, "5", null, Number.NaN]) assert.equal(refus({ integrationBranch: "v2", drift: { repoMb: valeur } }).cle, "drift.repoMb", String(valeur));
  for (const valeur of [1.5, 0]) assert.equal(refus({ integrationBranch: "v2", drift: { tests: valeur } }).cle, "drift.tests", String(valeur));
  assert.match(refus({ integrationBranch: "v2", correction: { threshold: 1 } }).message, /must be an integer of 2 or more/);
  assert.equal(refus({ integrationBranch: "v2", profile: { gapPoints: 101 } }).cle, "profile.gapPoints");
  assert.deepEqual(validerReglagesProjet({ integrationBranch: "v2", profile: { gapPoints: 12.5 } }).profile, { gapPoints: 12.5 });
  // Leurs noms ne valent qu'à leur place (`ticketTokens` n'est pas un jeton).
  assert.equal(refus({ integrationBranch: "v2", ticketTokens: 5 }).motif, "secret");
  assert.equal(refus({ integrationBranch: "v2", drift: { apiToken: 5 } }).motif, "secret");
});

test("a proposed change sets or withdraws the thresholds one by one, and says each", () => {
  const apres = validerReglagesProjet(appliquerLeChangement(COMPLETS, { drift: { tests: null, repoMb: 250 }, correction: { window: null, threshold: null } }));
  assert.equal(apres.drift?.tests, undefined);
  assert.equal(apres.drift?.repoMb, 250);
  assert.equal(apres.drift?.merges, 8);
  assert.equal(apres.correction, undefined);
  assert.deepEqual(changementsDits(COMPLETS, apres), ["drift threshold `repoMb`: 300 → 250", "drift threshold `tests`: 5000 → none", "correction threshold `threshold`: 4 → none", "correction threshold `window`: 30 → none"]);
});

test("the readers of the runtime read the repository's thresholds over the box's, key by key, and fall back to the box without them", () => {
  const box = { BRIGADE_DRIFT_TESTS: "100", BRIGADE_DRIFT_MERGES: "3", BRIGADE_CORRECTION_THRESHOLD: "5", BRIGADE_PROFILE_WINDOW: "10" };
  const seul = { ...box, ...variablesDuDepot({ integrationBranch: "v2", drift: { tests: 5000 }, profile: { window: 40, gapPoints: 15 } }) };
  assert.equal(seul.BRIGADE_DRIFT_TESTS, "5000");
  assert.equal(seul.BRIGADE_DRIFT_MERGES, "3");
  assert.equal(lireReglagesDuCorrectif(seul).seuil, 5);
  assert.deepEqual(lireReglagesDesProfils(seul), { fenetre: 40, tickets: 5, ecart: 15 });
  // Sans le fichier, ce que la box tient.
  assert.deepEqual(variablesDuDepot(null), {});
  assert.deepEqual(lireReglagesDuCorrectif({ ...box, ...variablesDuDepot(COMPLETS) }), { seuil: 4, fenetre: 30 });
});

test("a station applies projet.json's drift thresholds at its next fetch over its box's decisions, and its gestures keep working without the file", (t) => {
  const projet = projetSurGit(t, { reglages: { integrationBranch: "v2" } });
  const journal = journalDeStation(t, { BRIGADE_DRIFT_TICKET_TOKENS: "900", BRIGADE_DRIFT_FIRST_TRY_PERCENT: "70" });
  const depot = lireLeDepot({ BRIGADE_REPO_DIR: projet.clone, BRIGADE_BASE_BRANCH: "v2", BRIGADE_DRIFT_TESTS: "100" });
  const decisions = suivreDecisions(journal.base, depot.env, () => {}, depot.suivis);
  // Le dépôt ne dit rien : la box, ses décisions et son environnement.
  assert.equal(decisions.seuils().ticketTokens, 900);
  assert.equal(decisions.seuils().firstTryPercent, 70);
  assert.equal(decisions.seuils().tests, 100);

  projet.merger("v2", texteDuFichier({ integrationBranch: "v2", drift: { ticketTokens: 5000, tests: 7 } }));
  assert.equal(decisions.seuils().ticketTokens, 900);
  git(projet.clone, "fetch", "-q", "origin");
  const lus = decisions.seuils();
  assert.deepEqual([lus.ticketTokens, lus.tests, lus.firstTryPercent], [5000, 7, 70]);

  projet.merger("v2", texteDuFichier({ integrationBranch: "v2" }));
  git(projet.clone, "fetch", "-q", "origin");
  assert.deepEqual([decisions.seuils().ticketTokens, decisions.seuils().tests], [900, 100]);
});
