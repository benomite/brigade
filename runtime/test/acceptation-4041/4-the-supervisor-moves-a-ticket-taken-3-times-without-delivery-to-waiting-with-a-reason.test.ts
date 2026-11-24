// #4041, critère 4 : un ticket pris 3 fois sans livraison passe en WAITING avec une raison écrite, sans geste du chef.
import assert from "node:assert/strict";
import { test } from "node:test";
import { A_LA_MAIN } from "../../src/brigade-github.ts";
import { LABEL_WAITING } from "../../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

test("a ticket taken 3 times without delivery goes to WAITING with a written reason, the chef does nothing", async () => {
  const faux = new FauxGitHub();
  faux.feu(894, CALIBRE);
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, cuisiner: async () => ({ echec: "the cook stopped without a delivery" }) });
  for (let i = 0; i < 8; i++) {
    await a.tour();
    await a.calme();
  }
  const ticket = faux.ticket(894);
  assert.ok(ticket.labels.has(LABEL_WAITING), `the ticket is WAITING, labels: ${[...ticket.labels].join(",")}`);
  assert.equal(ticket.labels.has(A_LA_MAIN), false, "no card for the chef");
  const dits = (faux.commentaires.get(894) ?? []).map((c) => c.body);
  assert.ok(dits.some((c) => /waiting/i.test(c) && /\bbecause\b|\breason\b/i.test(c)), `a written reason on the ticket:\n${dits.join("\n---\n")}`);
  const prises = faux.cuissons.filter(({ issue }) => issue === 894).length;
  for (let i = 0; i < 3; i++) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.cuissons.filter(({ issue }) => issue === 894).length, prises, "the loop is stopped");
});
