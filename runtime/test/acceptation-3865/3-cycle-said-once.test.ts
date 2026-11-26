// #3865, critère 3 : deux tickets qui dépendent l'un de l'autre ne sont jamais tous deux retenus ; le cycle est dit une fois, avec les deux numéros.
// Garde : la base défait déjà la boucle et la dit une fois ; le test le garde. La porte de prise sur un faux GitHub, comme boucle-attente.test.ts.
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

test("#18 and #28 depend on each other: not both held, and the cycle is said once with both numbers", async (t) => {
  const s = station(t, (faux) => {
    faux.feu(18, CALIBRE, "Depends on #28");
    faux.feu(28, CALIBRE, "Depends on #18");
  });
  await s.tour();
  const tenus = [18, 28].filter((n) => (s.sauts.get(n) ?? "").includes("waiting for"));
  assert.ok(tenus.length < 2, "both tickets are held");
  await s.tour();
  const dits = [18, 28].flatMap((n) => (s.faux.commentaires.get(n) ?? []).map((c) => c.body)).filter((b) => /#18/.test(b) && /#28/.test(b));
  assert.equal(dits.length, 1, `the cycle must be said exactly once, got ${dits.length}`);
});
