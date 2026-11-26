// #4226, critère 3 : au troisième refus, un seul commentaire est posté sur le ticket ; il liste chaque essai et les checks encore rouges.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FauxGitHub } from "../faux-github.ts";

const TICKET = 7;
const MOTIFS = ["Problem number 1.", "Problem number 2.", "Problem number 3."];

test("the third refusal posts exactly one comment, which lists every try and the checks still red", async () => {
  const faux = new FauxGitHub();
  faux.feu(TICKET);
  let refus = 0;
  const a = faux.station("A", {
    juger: async (_ticket, pr) => {
      refus += 1;
      if (refus === 3) faux.ciRouge.add(pr.number);
      return { verdict: "request-changes", motif: MOTIFS[refus - 1] ?? "more" };
    },
    avertir: () => {},
  });
  for (let tour = 0; tour < 12 && refus < 3; tour += 1) {
    await a.tour();
    await a.calme();
  }
  for (let tour = 0; tour < 3; tour += 1) {
    await a.tour();
    await a.calme();
  }
  const parc = (faux.commentaires.get(TICKET) ?? []).filter(({ body }) => MOTIFS.every((motif) => body.includes(motif)));
  assert.equal(parc.length, 1, "exactly one comment lists the three tries");
  assert.match(parc[0]!.body, /\btests\b/, "it names the check that is still red");
  assert.match(parc[0]!.body, /parked/i);
});
