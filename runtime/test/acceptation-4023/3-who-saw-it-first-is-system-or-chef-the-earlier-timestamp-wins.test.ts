import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { terminerLaPanne } from "../../src/post-mortems/post-mortems.ts";

// #4023 : « qui l'a vu en premier » : le plus tôt des deux horodatages gagne ; un seul des deux suffit.
const MINUTE = 60_000;
const DEBUT = Date.parse("2026-11-22T10:00:00.000Z");
const a = (minutes: number | null) => (minutes === null ? null : new Date(DEBUT + minutes * MINUTE).toISOString());
const cas = (id: string, systeme: number | null, chef: number | null) => ({
  id, debut: a(0)!, fin: a(60)!, cause: "net", detecteeParLeSysteme: a(systeme), signaleeParLeChef: a(chef), corrigePar: "restart", ticketDuCorrectif: "#1",
});

test("system first, chef first, and only one of the two", (t) => {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-pm-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  assert.equal(terminerLaPanne(dossier, "box", cas("o-sys", 2, 9))?.vuEnPremier, "system");
  assert.equal(terminerLaPanne(dossier, "box", cas("o-chef", 9, 2))?.vuEnPremier, "chef");
  assert.equal(terminerLaPanne(dossier, "box", cas("o-seul-systeme", 5, null))?.vuEnPremier, "system");
  assert.equal(terminerLaPanne(dossier, "box", cas("o-seul-chef", null, 5))?.vuEnPremier, "chef");
});
