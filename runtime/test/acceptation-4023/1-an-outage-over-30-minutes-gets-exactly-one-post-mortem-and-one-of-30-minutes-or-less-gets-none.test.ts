import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { lirePostMortems, terminerLaPanne } from "../../src/post-mortems/post-mortems.ts";

// #4023 : une panne qui finit au-delà de 30 minutes laisse un post-mortem, une de 30 minutes ou moins n'en laisse aucun.
const MINUTE = 60_000;
const DEBUT = Date.parse("2026-11-22T10:00:00.000Z");
const panne = (id: string, minutes: number) => ({
  id, debut: new Date(DEBUT).toISOString(), fin: new Date(DEBUT + minutes * MINUTE).toISOString(),
  cause: "disk full", detecteeParLeSysteme: new Date(DEBUT + MINUTE).toISOString(), signaleeParLeChef: null, corrigePar: "restart", ticketDuCorrectif: "#4100",
});

test("an outage that ends at 30 min 1 s has one post-mortem, one that ends at exactly 30 min or at 29 min has none", (t) => {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-pm-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  terminerLaPanne(dossier, "box", panne("o-29", 29));
  terminerLaPanne(dossier, "box", panne("o-30", 30));
  assert.equal(lirePostMortems(dossier, "box").length, 0, "30 minutes or less creates none");
  const juste = { ...panne("o-31", 30), fin: new Date(DEBUT + 30 * MINUTE + 1000).toISOString() };
  terminerLaPanne(dossier, "box", juste);
  const lus = lirePostMortems(dossier, "box");
  assert.equal(lus.length, 1, "strictly over 30 minutes creates exactly one");
});
