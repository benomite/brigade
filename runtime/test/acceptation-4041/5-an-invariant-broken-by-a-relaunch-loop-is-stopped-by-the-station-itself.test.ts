// #4041, critère 5 : quand un invariant casse à cause d'une boucle de relances, la station l'arrête d'elle-même : parqué
// (#4129, d'abord WAITING) avec sa raison, ou la carte du secret.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHEF_TODO, LABEL_PARKED } from "../../src/github-etat/etats.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

test("when invariant 2 breaks on a relaunch loop, the station parks the ticket with its reason, or to the secret card", async () => {
  const faux = new FauxGitHub();
  faux.feu(894, CALIBRE);
  const pr = faux.prOuverte(["runtime/src/a.ts"], "cook/894-abcdef01");
  pr.issue = 894;
  faux.ciRouge.add(pr.number);
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, cuisiner: async () => ({ echec: "same failure" }) });
  for (let i = 0; i < 6; i++) {
    await a.tour();
    await a.calme();
  }
  const ticket = faux.ticket(894);
  const dits = (faux.commentaires.get(894) ?? []).map((c) => c.body);
  assert.ok(dits.some((c) => c.includes("Invariant 2 broke")), "the invariant broke and said so");
  const enAttente = ticket.labels.has(LABEL_PARKED) && dits.some((c) => /\bparked\b/i.test(c) && /\bbecause\b|\breason\b/i.test(c));
  const carteDuSecret = ticket.labels.has(CHEF_TODO) && dits.some((c) => /\b(secret|account)\b/i.test(c));
  assert.ok(enAttente || carteDuSecret, `the station stopped the loop itself, labels: ${[...ticket.labels].join(",")}\n${dits.join("\n---\n")}`);
  assert.equal(faux.cuissons.filter(({ issue }) => issue === 894).length <= 1, true, "no further relaunch");
});
