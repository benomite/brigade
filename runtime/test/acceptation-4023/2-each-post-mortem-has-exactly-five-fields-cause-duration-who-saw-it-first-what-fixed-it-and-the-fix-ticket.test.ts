import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { lirePostMortems, terminerLaPanne } from "../../src/post-mortems/post-mortems.ts";

// #4023 : cinq champs, ni plus ni moins.
const DEBUT = Date.parse("2026-11-22T10:00:00.000Z");

test("a post-mortem carries cause, duration, who saw it first, what fixed it and the fix ticket, and nothing else", (t) => {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-pm-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  terminerLaPanne(dossier, "box", {
    id: "o-1", debut: new Date(DEBUT).toISOString(), fin: new Date(DEBUT + 45 * 60_000).toISOString(),
    cause: "disk full", detecteeParLeSysteme: new Date(DEBUT + 60_000).toISOString(), signaleeParLeChef: null, corrigePar: "log rotation", ticketDuCorrectif: "#4100",
  });
  const [pm] = lirePostMortems(dossier, "box");
  assert.ok(pm, "a post-mortem exists");
  assert.deepEqual(Object.keys(pm).sort(), ["cause", "corrige", "duree", "ticket", "vuEnPremier"]);
  assert.equal(pm.cause, "disk full");
  assert.equal(pm.duree, "45 min");
  assert.equal(pm.vuEnPremier, "system");
  assert.equal(pm.corrige, "log rotation");
  assert.equal(pm.ticket, "#4100");
});
