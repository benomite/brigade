// #4307 : un `temps_attendu` au-dessus de 10 minutes dont le `calibrage` ne
// donne aucune raison est refusé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lireDecoupage } from "../../src/decouper.ts";

const lire = (autres: Record<string, unknown>) =>
  lireDecoupage(
    JSON.stringify({
      reponse: "tickets",
      motif: "m",
      ordre: "o",
      tickets: [{ titre: "Le rail", contexte: "c", criteres: ["a"], attend: [], zone: ["runtime/src/rail.ts"], modele: "opus", effort: "medium", ...autres }],
    }),
  );

test("`temps_attendu` > 10 avec un `calibrage` sans raison est refusé ; avec une raison, ou à 10, il passe", () => {
  for (const calibrage of ["", "   ", undefined, "Opus, medium.", "Un module."]) {
    const lu = lire({ temps_attendu: 30, ...(calibrage === undefined ? {} : { calibrage }) });
    assert.ok("illisible" in lu, `refusé : ${JSON.stringify(calibrage)}`);
    assert.match(lu.illisible, /temps_attendu|expected time|calibrage|calibration/i);
  }
  const avecRaison = lire({ temps_attendu: 30, calibrage: "Reprise du moteur de cuisson : 30 minutes, car il touche tous les jugements." });
  assert.ok("valeur" in avecRaison, JSON.stringify(avecRaison));
  const dix = lire({ temps_attendu: 10, calibrage: "Une feature contenue." });
  assert.ok("valeur" in dix, JSON.stringify(dix));
});
