// The #3955 loop: send-back 2/2, relaunch, send-back on the same sha (#3961).
import assert from "node:assert/strict";
import { test } from "node:test";
import { HORS_CUISINE } from "../../src/github.ts";
import { LABEL_PARKED } from "../../src/github-etat/etats.ts";
// Chez le superviseur : parqué par ses échecs, depuis #4129.
const chezLeSuperviseur = (labels: Set<string>) => labels.has(LABEL_PARKED);
import { corpsDeLaReponse } from "../../src/desaccord-cook.ts";
import { FauxGitHub } from "../faux-github.ts";

const MOTIF = "The delivery has no test that fails on the base.";
const renvois = (faux: FauxGitHub) => (faux.commentaires.get(7) ?? []).filter(({ body }) => body.startsWith("<!-- brigade:renvoi n="));

test("the #3955 sequence ends with the ticket at the supervisor after at most one more review", async () => {
  const faux = new FauxGitHub();
  faux.feu(7);
  const jugees: string[] = [];
  let relance = false;
  const a = faux.station("A", {
    // Before the relaunch the cook pushes a new head each time; after it, the head no longer changes.
    cuisiner: async () => {
      const ouverte = faux.prs.findLast((pr) => pr.issue === 7 && pr.state === "open");
      if (ouverte !== undefined && !relance) ouverte.sha = faux.sha();
      if (ouverte !== undefined && relance) faux.poster(ouverte.number, "A", corpsDeLaReponse(ouverte.sha, "Already addressed."));
      return { branche: ouverte?.branche ?? `cook/7` };
    },
    juger: async (_ticket, pr) => {
      jugees.push(pr.sha);
      return { verdict: "request-changes", motif: jugees.length === 1 ? "A first, different problem." : MOTIF };
    },
    avertir: () => {},
  });
  for (let tour = 0; tour < 10 && renvois(faux).length < 2; tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(renvois(faux).length, 2, "send-back 2/2");
  const avant = jugees.length;
  relance = true;
  const dernier = Date.parse(renvois(faux).at(-1)!.createdAt);
  faux.retraits.set(7, [...(faux.retraits.get(7) ?? []), { label: HORS_CUISINE, createdAt: new Date(dernier + 500).toISOString() }]);
  for (let tour = 0; tour < 15 && !chezLeSuperviseur(faux.ticket(7).labels); tour += 1) {
    await a.tour();
    await a.calme();
  }
  assert.ok(chezLeSuperviseur(faux.ticket(7).labels), `the ticket is at the supervisor: ${[...faux.ticket(7).labels].join(", ")}`);
  assert.ok(jugees.length - avant <= 1, `${jugees.length - avant} reviews after the relaunch`);
});
