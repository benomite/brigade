// #3865, critère 1 : un ticket n'attend un autre que par une ligne `Depends on #N` de son corps.
// Test d'acceptation gelé (#3725) : la porte de prise sur un faux GitHub, comme boucle-attente.test.ts.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import type { GitHub } from "../../src/github.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "../faux-github.ts";

const CALIBRE = ["fire", "model:opus", "effort:medium"];

function station(t: TestContext, avant: (faux: FauxGitHub) => void) {
  const repertoire = mkdtempSync(join(tmpdir(), "acceptation-3865-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  avant(faux);
  let cooks = 0;
  const lancer: Lancer = ({ flux }) => {
    cooks += 1;
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "Done.\n<livrable>\nNothing.\n</livrable>" })}\n`);
    return { fin: Promise.resolve({ code: 1, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const sauts = new Map<number, string>();
  const github: GitHub = { ...fauxClient(faux) };
  const ouverte = stationDuDepot({ ...STATION_DU_DEPOT, github, depot: depotNeuf(repertoire), manager: () => ({ model: "opus", effort: "high" }), flux: repertoire, lancer, avertir: () => {}, sauter: (ticket, ligne) => void sauts.set(ticket, ligne) });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  const tour = async () => {
    sauts.clear();
    await ouverte.tour();
    await ouverte.calme();
  };
  return { faux, tour, sauts };
}

test("a ticket waits for #10 on its `Depends on #10` line, and not for #11, which its prose only builds on", async (t) => {
  const s = station(t, (faux) => {
    faux.feu(10, CALIBRE, "body");
    faux.feu(11, CALIBRE, "body");
    faux.feu(20, CALIBRE, "Builds on #11, waiting for #11.\n\nDepends on #10");
  });
  await s.tour();
  assert.match(s.sauts.get(20) ?? "", /waiting for #10\b/);
  assert.doesNotMatch(s.sauts.get(20) ?? "", /#11/);
});
