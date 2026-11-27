// Les rôles qui écrivent pour un humain portent une seule consigne d'écriture : environ 80 % d'ASD-STE100
// (#3769). Les consignes du runtime l'importent.
import assert from "node:assert/strict";
import { test } from "node:test";
import { consigneDeJugement } from "../src/juger.ts";
import { CONSIGNE_STE } from "../src/ste.ts";

test("la consigne de jugement du manager porte la consigne ASD-STE100", () => {
  const consigne = consigneDeJugement({ depot: "o/r", issue: { number: 1, title: "t", body: "b", labels: [] }, commentaires: [] });
  assert.ok(consigne.includes(CONSIGNE_STE));
});

test("la consigne dit les cinq règles : phrases courtes, une idée, voix active, un mot par objet, rien de retiré", () => {
  for (const regle of ["ASD-STE100", "phrases courtes", "une idée par phrase", "voix active", "docs/glossary.md", "aucun fait, chiffre ni réserve"]) assert.ok(CONSIGNE_STE.includes(regle), regle);
});
