// Un élément que l'app ne sait pas lire — une box plus récente que l'app — ne gâte que sa carte : le rail se dessine.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { understand, rail, board, type Facts } from "../src/facts.ts";

const base = (rail: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ etat: "ouverte", lu: "2026-10-27T08:00:00Z", compteurs: { rail: rail.length, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail, ...extra });
const normal = { ticket: 1, etat: "en attente", titre: "Normal", url: "https://github.com/o/r/issues/1" };
const WITHOUT_RELAUNCH = { ticket: 22, etat: "WAITING", titre: "Set aside", url: "https://github.com/o/r/issues/22", tiers: { quoi: "a station", qui: "chef", depuis: null, relance: null, aLArrivee: "x" } };
const SAYS = "the app could not read this card — update the app to fix it";

const readOne = (output: string): Facts => {
  const facts = understand(output);
  assert.ok(!("informe" in facts), "informe" in facts ? facts.informe : "");
  return facts;
};
const cards = (facts: Facts) => rail(facts).colonnes.flatMap((column) => column.cartes);

describe("un élément illisible", () => {
  test("un suivi WAITING sans date ne gâte que sa carte du rail", () => {
    const facts = readOne(base([normal, WITHOUT_RELAUNCH]));
    const allEntries = cards(facts);
    const itsOwnOne = allEntries.find(({ ticket }) => ticket === 22);
    assert.equal(itsOwnOne?.ligne, SAYS);
    assert.equal(itsOwnOne?.titre, "Set aside");
    assert.notEqual(allEntries.find(({ ticket }) => ticket === 1)?.ligne, SAYS);
    assert.equal(board(facts).rail.colonnes.length, rail(facts).colonnes.length);
  });

  test("un élément de `attend` ou de `livres` illisible ne gâte que sa carte", () => {
    const facts = readOne(base([normal], { attend: [{ ticket: 5, titre: "A", url: 3 }], livres: [{ ticket: 6, titre: "L", url: null, livre: "pas une heure", station: null, pr: null }] }));
    const allEntries = cards(facts);
    assert.equal(allEntries.find(({ ticket }) => ticket === 5)?.ligne, SAYS);
    assert.equal(allEntries.find(({ ticket }) => ticket === 6)?.ligne, SAYS);
    assert.notEqual(allEntries.find(({ ticket }) => ticket === 1)?.ligne, SAYS);
  });

  test("sans numéro de ticket, il n'y a pas de carte : la forme est refusée, et dit pourquoi", () => {
    const facts = understand(base([normal, { etat: "pris" }]));
    assert.ok("informe" in facts && facts.informe.includes("rail[1].ticket"));
  });
});
