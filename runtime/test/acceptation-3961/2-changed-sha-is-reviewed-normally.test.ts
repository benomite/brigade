// A delivery whose sha changed is reviewed normally (#3961).
import assert from "node:assert/strict";
import { test } from "node:test";
import { FauxGitHub } from "../faux-github.ts";

const MOTIF = "The new export has no caller up to ouvrirStation.";

// brigade:guard
test("a delivery whose sha changed is reviewed normally, even for the same blocking reason", async () => {
  const faux = new FauxGitHub();
  faux.feu(7);
  const jugees: string[] = [];
  // The default fake cook pushes a new head on each delivery.
  const a = faux.station("A", {
    juger: async (_ticket, pr) => {
      jugees.push(pr.sha);
      return jugees.length >= 2 ? { verdict: "approve", motif: "" } : { verdict: "request-changes", motif: MOTIF };
    },
    avertir: () => {},
  });
  for (let tour = 0; tour < 10; tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.ok(new Set(jugees).size >= 2, `each head is reviewed: ${jugees.map((sha) => sha.slice(0, 7)).join(", ")}`);
  assert.equal(new Set(jugees).size, jugees.length, "no head is reviewed twice");
  assert.ok(faux.mergee(7) !== undefined, "the changed delivery was judged and, approved, merged");
});
