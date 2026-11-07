// La qualité des tickets récents, sur la fenêtre des mesures de temps (#2678).
import assert from "node:assert/strict";
import { test } from "node:test";
import { classer, mesurerQualite, partDuPremierCoup, REPARATIONS_PAR_MERGE_MAX, reparationsParMerge, SEUIL_PREMIER_COUP_PAR_DEFAUT, seuilPremierCoup, type QualiteDuTicket } from "../src/mesure-qualite.ts";
import { ticketsRecents } from "../src/temps-max/mesure.ts";
import type { TempsTicket } from "../src/temps-ticket/ligne-status.ts";

const heure = (h: number) => new Date(Date.UTC(2026, 10, 5, 0) + h * 3_600_000).toISOString();
const t = (ticket: number, mergedAt?: string): TempsTicket => ({ ticket, cuisson: 60, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0, ...(mergedAt === undefined ? {} : { mergedAt }) });
const net: QualiteDuTicket = { renvois: [], cooksRates: 0 };
const qualites = (entrees: [number, QualiteDuTicket][]) => new Map(entrees);
// Douze tickets sans date : la fenêtre en garde les dix derniers, 3 à 12.
const douze = Array.from({ length: 12 }, (_, i) => t(i + 1));
const tousNets = qualites(douze.map(({ ticket }) => [ticket, net]));

test("the quality measures read the very tickets the time measures read", () => {
  // 14 tickets : le premier la veille, les 13 autres dans la journée du dernier.
  const temps = [t(1, heure(-30)), ...Array.from({ length: 13 }, (_, i) => t(i + 2, heure(i)))];
  const qualite = mesurerQualite(temps, qualites(temps.map(({ ticket }) => [ticket, net])));
  assert.deepEqual(qualite.tickets, ticketsRecents(temps).map(({ ticket }) => ticket));
  assert.deepEqual(qualite.tickets, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.equal(qualite.mesures, 13);
});

test("a window with send-backs: the tickets sent back are not first-try, their reasons ranked", () => {
  const q = new Map(tousNets);
  q.set(4, { renvois: ["tests missing", "out of zone"], cooksRates: 0 });
  q.set(7, { renvois: ["tests missing"], cooksRates: 0 });
  q.set(1, { renvois: ["outside the window"], cooksRates: 0 });
  const qualite = mesurerQualite(douze, q);
  assert.equal(qualite.premierCoup, 0.8);
  assert.equal(qualite.sousLeSeuil, false);
  assert.deepEqual(qualite.motifsDeRenvoi, [
    { nom: "tests missing", fois: 2 },
    { nom: "out of zone", fois: 1 },
  ]);
});

test("a window with failed cooks: a ticket with a cook that delivered nothing is not first-try", () => {
  const q = new Map(tousNets);
  for (const ticket of [3, 5, 8, 9]) q.set(ticket, { renvois: [], cooksRates: 1 });
  const qualite = mesurerQualite(douze, q);
  assert.equal(qualite.premierCoup, 0.6);
  assert.equal(qualite.sousLeSeuil, true);
  assert.deepEqual(qualite.motifsDeRenvoi, []);
});

test("a window with neither: every ticket first-try, no repair, nothing ranked", () => {
  const qualite = mesurerQualite(douze, tousNets);
  assert.equal(qualite.premierCoup, 1);
  assert.equal(qualite.sousLeSeuil, false);
  assert.equal(qualite.reparations, 0);
  assert.equal(qualite.reparationsParMerge, 0);
  assert.equal(qualite.tropDeReparations, false);
  assert.deepEqual(qualite.checksCasses, []);
});

test("an empty window: the rates are unknown, neither 0 nor 100%, and nothing is divided by zero", () => {
  for (const qualite of [mesurerQualite([], new Map()), mesurerQualite(douze, new Map())]) {
    assert.equal(qualite.mesures, 0);
    assert.equal(qualite.premierCoup, null);
    assert.equal(qualite.sousLeSeuil, null);
    assert.equal(qualite.reparationsParMerge, null);
    assert.equal(qualite.tropDeReparations, null);
  }
  assert.equal(mesurerQualite(douze, new Map()).inconnus, 10);
  assert.equal(partDuPremierCoup([]), null);
  assert.equal(reparationsParMerge(0, 0), null);
});

test("the epic's figures, 7 repairs of main over 74 merged PRs: about 0.095 per merge, just under the one-per-ten limit", () => {
  const parMerge = reparationsParMerge(7, 74);
  assert.ok(parMerge !== null && Math.abs(parMerge - 0.095) < 0.001);
  assert.equal(REPARATIONS_PAR_MERGE_MAX, 0.1);
  assert.ok(parMerge < REPARATIONS_PAR_MERGE_MAX);
  // Un de plus, 8 sur 74, et la limite est franchie.
  assert.ok((reparationsParMerge(8, 74) ?? 0) > REPARATIONS_PAR_MERGE_MAX);
});

test("the checks that broke main, counted over the repairs of the window", () => {
  const q = new Map(tousNets);
  q.set(5, { renvois: [], cooksRates: 0, reparation: ["types (runtime)", "tests (app)"] });
  q.set(9, { renvois: [], cooksRates: 0, reparation: ["tests (app)"] });
  q.set(2, { renvois: [], cooksRates: 0, reparation: ["outside the window"] });
  const qualite = mesurerQualite(douze, q);
  assert.equal(qualite.reparations, 2);
  assert.equal(qualite.reparationsParMerge, 0.2);
  assert.equal(qualite.tropDeReparations, true);
  assert.deepEqual(qualite.checksCasses, [
    { nom: "tests (app)", fois: 2 },
    { nom: "types (runtime)", fois: 1 },
  ]);
});

test("the first-try threshold: 70% when the project sets none, the project's own when it sets a valid one", () => {
  assert.equal(SEUIL_PREMIER_COUP_PAR_DEFAUT, 70);
  for (const projet of [undefined, null, [], {}, { premierCoupMinPourcent: -1 }, { premierCoupMinPourcent: 101 }, { premierCoupMinPourcent: "80" }]) assert.equal(seuilPremierCoup(projet), 70);
  assert.equal(seuilPremierCoup({ premierCoupMinPourcent: 85 }), 85);
  const q = new Map(tousNets);
  q.set(3, { renvois: ["tests missing"], cooksRates: 0 });
  q.set(4, { renvois: [], cooksRates: 2 });
  // 80 % du premier coup : au-dessus du défaut, sous le seuil du projet.
  assert.equal(mesurerQualite(douze, q).sousLeSeuil, false);
  const exigeant = mesurerQualite(douze, q, { premierCoupMinPourcent: 85 });
  assert.equal(exigeant.seuilPremierCoup, 85);
  assert.equal(exigeant.sousLeSeuil, true);
});

test("ranking: most frequent first, ties in the order first seen", () => {
  assert.deepEqual(classer(["b", "a", "a", "c", "b", "a"]), [
    { nom: "a", fois: 3 },
    { nom: "b", fois: 2 },
    { nom: "c", fois: 1 },
  ]);
  assert.deepEqual(classer([]), []);
});
