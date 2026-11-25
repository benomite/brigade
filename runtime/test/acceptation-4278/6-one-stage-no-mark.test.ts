// #4278, critère 6 : un ticket à une étape n'affiche aucune marque d'étape. Contrat : `decrireEtape(etat)` renvoie `""`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decrireEtape, etapesDuTicket } from "../../src/etapes-du-ticket.ts";

test("a ticket with no declared stages has one stage and an empty mark", () => {
  const etapes = etapesDuTicket({ projet: {}, sorte: "bug" });
  assert.equal(etapes.length, 1);
  assert.equal(decrireEtape({ etapes, courante: 0, essais: 0 }), "");
});
