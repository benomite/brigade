// Un élément que l'app ne sait pas lire — une box plus récente que l'app — ne gâte que sa carte : le rail se dessine.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { comprendre, rail, tableau, type Faits } from "../src/faits.ts";

const base = (rail: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ etat: "ouverte", lu: "2026-10-27T08:00:00Z", dernierTick: null, compteurs: { rail: rail.length, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail, ...extra });
const normal = { ticket: 1, etat: "en attente", titre: "Normal", url: "https://github.com/o/r/issues/1" };
const SANS_RELANCE = { ticket: 22, etat: "WAITING", titre: "Set aside", url: "https://github.com/o/r/issues/22", tiers: { quoi: "a station", qui: "chef", depuis: null, relance: null, aLArrivee: "x" } };
const DIT = "the app could not read this card — update the app to fix it";

const lu = (sortie: string): Faits => {
  const faits = comprendre(sortie);
  assert.ok(!("informe" in faits), "informe" in faits ? faits.informe : "");
  return faits;
};
const cartes = (faits: Faits) => rail(faits).colonnes.flatMap((colonne) => colonne.cartes);

describe("un élément illisible", () => {
  test("un suivi WAITING sans date ne gâte que sa carte du rail", () => {
    const faits = lu(base([normal, SANS_RELANCE]));
    const toutes = cartes(faits);
    const sienne = toutes.find(({ ticket }) => ticket === 22);
    assert.equal(sienne?.ligne, DIT);
    assert.equal(sienne?.titre, "Set aside");
    assert.notEqual(toutes.find(({ ticket }) => ticket === 1)?.ligne, DIT);
    assert.equal(tableau(faits).rail.colonnes.length, rail(faits).colonnes.length);
  });

  test("un élément de `attend` ou de `livres` illisible ne gâte que sa carte", () => {
    const faits = lu(base([normal], { attend: [{ ticket: 5, titre: "A", url: 3 }], livres: [{ ticket: 6, titre: "L", url: null, livre: "pas une heure", station: null, pr: null }] }));
    const toutes = cartes(faits);
    assert.equal(toutes.find(({ ticket }) => ticket === 5)?.ligne, DIT);
    assert.equal(toutes.find(({ ticket }) => ticket === 6)?.ligne, DIT);
    assert.notEqual(toutes.find(({ ticket }) => ticket === 1)?.ligne, DIT);
  });

  test("sans numéro de ticket, il n'y a pas de carte : la forme est refusée, et dit pourquoi", () => {
    const faits = comprendre(base([normal, { etat: "pris" }]));
    assert.ok("informe" in faits && faits.informe.includes("rail[1].ticket"));
  });
});
