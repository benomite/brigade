// #4307 : le texte de calibrage d'un ticket lancé montre modèle, effort et
// temps attendu ensemble, par exemple `sonnet / medium / 10 min`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDuTicket, lireDecoupage } from "../../src/decouper.ts";

test("le corps du ticket dit `sonnet / medium / 10 min`", () => {
  const lu = lireDecoupage(
    JSON.stringify({
      reponse: "tickets",
      motif: "m",
      ordre: "o",
      tickets: [{ titre: "Le rail", contexte: "c", criteres: ["a"], attend: [], zone: ["runtime/src/rail.ts"], modele: "sonnet", effort: "medium", temps_attendu: 10, calibrage: "Un module." }],
    }),
  );
  assert.ok("valeur" in lu && lu.valeur.quoi === "tickets", JSON.stringify(lu));
  const prevu = lu.valeur.tickets[0];
  assert.ok(prevu);
  assert.match(corpsDuTicket(30, 1, prevu), /`sonnet` \/ `medium` \/ `10 min`|sonnet` ?\/ ?`medium` ?\/ ?`?10 min|sonnet \/ medium \/ 10 min/);
});
