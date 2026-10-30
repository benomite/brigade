// La règle du rail et la politique du carnet que porte le dépôt du projet
// (#1673) : le bail, les chemins communs, l'issue de feuille de route, et les
// cinq réglages des leçons, dans `.claude/brigade/projet.json`. Ils passent
// avant ce que la box tenait, un par un ; sans eux, la box, puis le défaut.
import assert from "node:assert/strict";
import { test } from "node:test";
import { configRail } from "../../src/alimenter.ts";
import { lirePlafondDesLecons } from "../../src/apprentissage/injection.ts";
import { environnementDecide } from "../../src/decisions.ts";
import { configManager } from "../../src/manager.ts";
import { appliquerLeChangement, changementsDits } from "../../src/reglages-projet/proposer.ts";
import { ReglageRefuse, reglagesDuTexte, texteDuFichier, validerReglagesProjet, type ReglagesProjet } from "../../src/reglages-projet/reglages.ts";
import { lireSeuils } from "../../src/seuils/seuils.ts";

const COMPLET: ReglagesProjet = {
  integrationBranch: "v2",
  commonPaths: ["docs", "CHANGELOG.md"],
  rail: { leaseSeconds: 900, roadmapIssue: 42 },
  lessons: { injected: 0, promotionRetros: 4, provisionalExpiryTickets: 30, promotedExpiryTickets: 40, sendbackPromotionGap: 0 },
};

function refus(reglages: unknown): ReglageRefuse {
  try {
    validerReglagesProjet(reglages);
  } catch (erreur) {
    if (erreur instanceof ReglageRefuse) return erreur;
    throw erreur;
  }
  assert.fail(`accepté : ${JSON.stringify(reglages)}`);
}

// Le calibrage du manager est une décision du chef : il vient du journal, non de la box.
const CALIBRAGE = { BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "low" } as never;

const BOX = {
  BRIGADE_GITHUB_REPO: "o/r",
  BRIGADE_LEASE_SECONDS: "111",
  BRIGADE_COMMON_PATHS: "scripts",
  BRIGADE_ROADMAP_ISSUE: "7",
  BRIGADE_INJECTED_LESSONS: "5",
  BRIGADE_PROMOTION_RETROS: "2",
  BRIGADE_PROVISIONAL_EXPIRY_TICKETS: "11",
  BRIGADE_PROMOTED_EXPIRY_TICKETS: "12",
  BRIGADE_SENDBACK_PROMOTION_GAP: "3",
};

test("projet.json accepts the rail and lessons settings, in one fixed form, each optional", () => {
  const texte = texteDuFichier(COMPLET);
  assert.deepEqual(reglagesDuTexte(texte), COMPLET);
  assert.match(texte, /"commonPaths": \[\n {4}"docs",/);
  assert.deepEqual(validerReglagesProjet({ integrationBranch: "v2", rail: { roadmapIssue: 3 } }), { integrationBranch: "v2", rail: { roadmapIssue: 3 } });
  assert.deepEqual(validerReglagesProjet({ integrationBranch: "v2", commonPaths: [], lessons: {} }), { integrationBranch: "v2" });
});

test("an unknown or invalid rail or lessons setting is refused, and named", () => {
  assert.equal(refus({ integrationBranch: "v2", rail: { speed: 3 } }).cle, "rail.speed");
  assert.equal(refus({ integrationBranch: "v2", lessons: 3 }).cle, "lessons");
  for (const valeur of [0, -1, 1.5, "60", null]) assert.equal(refus({ integrationBranch: "v2", rail: { leaseSeconds: valeur } }).cle, "rail.leaseSeconds");
  assert.equal(refus({ integrationBranch: "v2", lessons: { promotionRetros: 0 } }).cle, "lessons.promotionRetros");
  assert.equal(refus({ integrationBranch: "v2", lessons: { sendbackPromotionGap: -1 } }).cle, "lessons.sendbackPromotionGap");
  assert.equal(refus({ integrationBranch: "v2", lessons: { injected: 1.5 } }).cle, "lessons.injected");
});

test("the common paths are paths of the repository, without a comma", () => {
  assert.equal(refus({ integrationBranch: "v2", commonPaths: "docs" }).cle, "commonPaths");
  for (const chemin of ["/etc", "../x", "docs/*.md", "a,b", "", 3]) assert.equal(refus({ integrationBranch: "v2", commonPaths: [chemin] }).cle, "commonPaths.0");
});

test("a proposed change sets, replaces or withdraws them", () => {
  const change = appliquerLeChangement(COMPLET, { rail: { leaseSeconds: 600, roadmapIssue: null }, commonPaths: ["docs"], lessons: { injected: null } });
  const apres = validerReglagesProjet(change);
  assert.deepEqual(apres.rail, { leaseSeconds: 600 });
  assert.equal(apres.lessons?.injected, undefined);
  assert.equal(apres.lessons?.promotionRetros, 4);
  assert.deepEqual(changementsDits(COMPLET, apres), ["common paths: docs, CHANGELOG.md → docs", "rail threshold `leaseSeconds`: 900 → 600", "rail threshold `roadmapIssue`: 42 → none", "lessons threshold `injected`: 0 → none"]);
});

test("what the repository sets wins over the box, setting by setting; without it the box stands, and without both the default", () => {
  const sans = environnementDecide(BOX, CALIBRAGE, null);
  assert.equal(configRail(sans).dureeBailMs, 111_000);
  assert.deepEqual(configRail(sans).communs, ["scripts"]);
  assert.equal(configManager(sans).roadmap, 7);
  assert.equal(lirePlafondDesLecons(sans), 5);
  assert.deepEqual(lireSeuils(sans), { promotion: 2, expirationPromue: 12, expirationProvisoire: 11, ecartRenvoi: 3 });

  const avec = environnementDecide(BOX, CALIBRAGE, COMPLET);
  assert.equal(configRail(avec).dureeBailMs, 900_000);
  assert.deepEqual(configRail(avec).communs, ["docs", "CHANGELOG.md"]);
  assert.equal(configManager(avec).roadmap, 42);
  assert.equal(lirePlafondDesLecons(avec), 0);
  assert.deepEqual(lireSeuils(avec), { promotion: 4, expirationPromue: 40, expirationProvisoire: 30, ecartRenvoi: 0 });

  const partiel = environnementDecide(BOX, CALIBRAGE, { integrationBranch: "v2", rail: { leaseSeconds: 900 } });
  assert.equal(configRail(partiel).dureeBailMs, 900_000);
  assert.deepEqual(configRail(partiel).communs, ["scripts"], "a setting the file leaves out stays the box's");
  assert.equal(lireSeuils(partiel).promotion, 2);

  const nue = environnementDecide({ BRIGADE_GITHUB_REPO: "o/r" }, {}, null);
  assert.equal(configRail(nue).dureeBailMs, 1_800_000);
  assert.equal(configManager(environnementDecide({ BRIGADE_GITHUB_REPO: "o/r" }, CALIBRAGE, null)).roadmap, null);
  assert.equal(lirePlafondDesLecons(nue), 20);
});
