// #4041, critère 4 : un ticket pris 3 fois sans livraison est parqué (#4129, d'abord WAITING) avec une raison écrite,
// sans geste du chef.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHEF_TODO, LABEL_PARKED } from "../../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

test("a ticket taken 3 times without delivery is parked with a written reason, the chef does nothing", async () => {
  const faux = new FauxGitHub();
  faux.feu(894, CALIBRE);
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, cuisiner: async () => ({ echec: "the cook stopped without a delivery" }) });
  for (let i = 0; i < 8; i++) {
    await a.tour();
    await a.calme();
  }
  const ticket = faux.ticket(894);
  assert.ok(ticket.labels.has(LABEL_PARKED), `the ticket is parked, labels: ${[...ticket.labels].join(",")}`);
  assert.equal(ticket.labels.has(CHEF_TODO), false, "no card for the chef");
  const dits = (faux.commentaires.get(894) ?? []).map((c) => c.body);
  assert.ok(dits.some((c) => /\bparked\b/i.test(c) && /\bbecause\b|\breason\b/i.test(c)), `a written reason on the ticket:\n${dits.join("\n---\n")}`);
  const prises = faux.cuissons.filter(({ issue }) => issue === 894).length;
  for (let i = 0; i < 3; i++) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.cuissons.filter(({ issue }) => issue === 894).length, prises, "the loop is stopped");
});
