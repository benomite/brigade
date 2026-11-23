import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { lirePostMortems, terminerLaPanne } from "../../src/post-mortems/post-mortems.ts";

// #4023 : stockés durablement, par projet et par panne ; rejouer la création ne double rien.
const DEBUT = Date.parse("2026-11-22T10:00:00.000Z");
const panne = (id: string) => ({
  id, debut: new Date(DEBUT).toISOString(), fin: new Date(DEBUT + 50 * 60_000).toISOString(),
  cause: "disk full", detecteeParLeSysteme: null, signaleeParLeChef: new Date(DEBUT + 60_000).toISOString(), corrigePar: "restart", ticketDuCorrectif: "#4100",
});

test("the same outage created twice leaves one post-mortem, kept per project across a re-read", (t) => {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-pm-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  terminerLaPanne(dossier, "box", panne("o-1"));
  terminerLaPanne(dossier, "box", panne("o-1"));
  assert.equal(lirePostMortems(dossier, "box").length, 1, "re-running creates no second one");
  terminerLaPanne(dossier, "autre", panne("o-1"));
  assert.equal(lirePostMortems(dossier, "autre").length, 1, "the same outage id in another project is its own post-mortem");
  assert.equal(lirePostMortems(dossier, "box").length, 1);
  terminerLaPanne(dossier, "box", panne("o-2"));
  assert.equal(lirePostMortems(dossier, "box").length, 2, "another outage of the project is another post-mortem");
});
