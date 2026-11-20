// A delivery with the same sha and the same blocking reason as an earlier review starts no new review (#3961).
import assert from "node:assert/strict";
import { test } from "node:test";
import { brancheDuTicket } from "../../src/brigade-github.ts";
import { corpsDeLaReponse } from "../../src/desaccord-cook.ts";
import { FauxGitHub } from "../faux-github.ts";

const MOTIF = "The new export has no caller up to ouvrirStation.";

test("a delivery with the same sha and the same blocking reason as an earlier review starts no new review", async () => {
  const faux = new FauxGitHub();
  faux.feu(7);
  const jugees: string[] = [];
  // The cook disagrees on the PR and delivers again without touching the head: same sha, same reason.
  const a = faux.station("A", {
    cuisiner: async () => {
      const ouverte = faux.prs.findLast((pr) => pr.issue === 7 && pr.state === "open");
      if (ouverte !== undefined) faux.poster(ouverte.number, "A", corpsDeLaReponse(ouverte.sha, "Already addressed."));
      return { branche: brancheDuTicket(7) };
    },
    juger: async (_ticket, pr) => {
      jugees.push(pr.sha);
      return { verdict: "request-changes", motif: MOTIF };
    },
    avertir: () => {},
  });
  for (let tour = 0; tour < 12; tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.ok(jugees.length >= 1, "the first delivery is reviewed");
  for (const sha of new Set(jugees)) {
    const fois = jugees.filter((jugee) => jugee === sha).length;
    assert.equal(fois, 1, `the sha ${sha.slice(0, 7)} was reviewed ${fois} times for the same blocking reason`);
  }
});
