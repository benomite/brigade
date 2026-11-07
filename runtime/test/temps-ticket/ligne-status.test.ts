// The ticket-times line of `status`.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { direLesTempsDesTickets, lesTempsDesTickets, ligneDesTempsDesTickets, type TempsTicket } from "../../src/temps-ticket/ligne-status.ts";
import { repertoireTemporaire } from "../outils.ts";

const m = (n: number) => n * 60;
const t = (ticket: number, cuisson: number, cuissonTests: number, attentePasse: number, revue: number, ci: number, merge: number): TempsTicket => ({
  ticket, claimedAt: "2026-11-01T10:00:00Z", mergedAt: "2026-11-01T10:00:00Z", cuisson: m(cuisson), cuissonTests: m(cuissonTests), attentePasse: m(attentePasse), revue: m(revue), ci: m(ci), merge: m(merge),
});

test("no measured ticket: one short sentence", () => {
  assert.equal(direLesTempsDesTickets([]), "tickets: no measured ticket yet");
});

test("the line gives median, slowest and the split by phase, with no max", () => {
  const lignes = [t(1, 8, 3, 2, 1, 1, 0), t(2, 8, 3, 2, 1, 1, 0), t(2301, 25, 5, 3, 1, 1, 1)];
  const sans = lignes.map(({ claimedAt, mergedAt, ...r }) => r);
  assert.equal(
    direLesTempsDesTickets(sans),
    "tickets: median 12m (slowest #2301 31m) | cook 8m (tests 3m) · pass 2m · review 1m · CI 1m · merge 0m",
  );
});

test("only the last 10 count", () => {
  const tous = Array.from({ length: 12 }, (_, i) => t(i + 1, i === 0 ? 100 : 1, 0, 0, 0, 0, 0)).map(({ claimedAt, mergedAt, ...r }) => r);
  assert.match(direLesTempsDesTickets(tous), /median 1m \(slowest #3 1m\)/);
});

test("reads both files; a missing file still gives a line", (tc) => {
  const depot = repertoireTemporaire(tc);
  assert.equal(ligneDesTempsDesTickets(depot), "tickets: no measured ticket yet");
  assert.equal(ligneDesTempsDesTickets(undefined), "tickets: no measured ticket yet");
  const dossier = join(depot, ".claude", "brigade");
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, "temps-tickets.json"), JSON.stringify([{ ticket: 5, attentePrise: 360, cuisson: 600, cuissonTests: 60, attentePasse: 0, revue: 0, ci: 0, merge: 0 }]));
  writeFileSync(join(dossier, "projet.json"), JSON.stringify({ lostTimeMaxMin: 5 }));
  assert.match(ligneDesTempsDesTickets(depot), /median 16m \(slowest #5 16m\)/);
});

test("the published times: valid records and the project's lost-time threshold, the default without files", (tc) => {
  assert.deepEqual(lesTempsDesTickets(undefined), { enregistrements: [], lostTimeMaxMin: 2 });
  const depot = repertoireTemporaire(tc);
  const dossier = join(depot, ".claude", "brigade");
  mkdirSync(dossier, { recursive: true });
  const bon = t(7, 5, 1, 1, 1, 1, 1);
  writeFileSync(join(dossier, "temps-tickets.json"), JSON.stringify([bon, { ticket: 8 }]));
  writeFileSync(join(dossier, "projet.json"), JSON.stringify({ lostTimeMaxMin: 3 }));
  assert.deepEqual(lesTempsDesTickets(depot), { enregistrements: [bon], lostTimeMaxMin: 3 });
});
