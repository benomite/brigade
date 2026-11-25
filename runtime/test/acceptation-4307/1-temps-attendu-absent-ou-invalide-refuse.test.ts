// #4307 : une réponse du manager dont un ticket n'a pas de `temps_attendu`, ou
// un qui n'est pas un entier de 1 à 120, est refusée avec une erreur claire.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lireDecoupage } from "../../src/decouper.ts";

const ticket = (autres: Record<string, unknown>) => ({
  titre: "Le rail compte",
  contexte: "Le compte n'existe pas.",
  criteres: ["`run rail` affiche le compte"],
  attend: [],
  zone: ["runtime/src/rail.ts"],
  modele: "sonnet",
  effort: "medium",
  calibrage: "Un module.",
  ...autres,
});
const lire = (t: Record<string, unknown>) => lireDecoupage(JSON.stringify({ reponse: "tickets", motif: "m", ordre: "o", tickets: [t] }));

test("un ticket sans `temps_attendu`, ou au `temps_attendu` hors 1..120 ou non entier, est refusé", () => {
  const valide = lire(ticket({ temps_attendu: 10 }));
  assert.ok("valeur" in valide, `un temps valide est lu : ${JSON.stringify(valide)}`);

  const sans = lire(ticket({}));
  assert.ok("illisible" in sans, "sans temps_attendu");
  assert.match(sans.illisible, /temps_attendu/);

  for (const mauvais of [0, -5, 121, 1000, 2.5, "10", null, Number.NaN, true]) {
    const lu = lire(ticket({ temps_attendu: mauvais }));
    assert.ok("illisible" in lu, `refusé : ${JSON.stringify(mauvais)}`);
    assert.match(lu.illisible, /temps_attendu/);
  }
  for (const bon of [1, 2, 10, 120]) {
    const lu = lire(ticket({ temps_attendu: bon, calibrage: "Un module, parce que le cœur du produit change." }));
    assert.ok("valeur" in lu, `lu : ${bon}`);
  }
});
