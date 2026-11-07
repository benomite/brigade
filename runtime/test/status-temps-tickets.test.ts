// The "Ticket time" line of `status`, read from the `resume` of temps-tickets.json.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ligneDuTempsDesTickets, SANS_MESURE } from "../src/status-temps-tickets.ts";
import { repertoireTemporaire } from "./outils.ts";

const ecrire = (depot: string, contenu: unknown) => {
  mkdirSync(join(depot, ".claude", "brigade"), { recursive: true });
  writeFileSync(join(depot, ".claude", "brigade", "temps-tickets.json"), JSON.stringify(contenu));
};

test("a fixture resume gives median and p75 and the slowest phase, with no max", (tc) => {
  const depot = repertoireTemporaire(tc);
  ecrire(depot, { tickets: [], resume: { n: 12, medianMin: 14, p75Min: 47, perduMedianMin: 7.7, lostTimeMaxMin: 2, phaseLaPlusLongue: { phase: "cuisson", medianMin: 9 }, perteLaPlusLourde: { nom: "waiting for a claim", medianMin: 4.8, partPct: 57 } } });
  assert.equal(ligneDuTempsDesTickets(depot), "Ticket time: median 14 min, p75 47 min, slowest phase cuisson (median 9 min)");
});

test("no temps-tickets.json: the 'no measure yet' line", (tc) => {
  assert.equal(ligneDuTempsDesTickets(repertoireTemporaire(tc)), SANS_MESURE);
  assert.equal(ligneDuTempsDesTickets(undefined), SANS_MESURE);
});

test("a file without resume, or unreadable: the 'no measure yet' line", (tc) => {
  const depot = repertoireTemporaire(tc);
  ecrire(depot, { tickets: [] });
  assert.equal(ligneDuTempsDesTickets(depot), SANS_MESURE);
  ecrire(depot, [{ ticket: 1 }]);
  assert.equal(ligneDuTempsDesTickets(depot), SANS_MESURE);
  writeFileSync(join(depot, ".claude", "brigade", "temps-tickets.json"), "{nope");
  assert.equal(ligneDuTempsDesTickets(depot), SANS_MESURE);
});
