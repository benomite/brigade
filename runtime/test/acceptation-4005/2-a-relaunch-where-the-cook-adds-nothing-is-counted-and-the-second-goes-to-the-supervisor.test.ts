// #4005, critère 2 : un relancement où le cook n'ajoute rien est compté ; au second sur le même check rouge, le ticket va au superviseur et n'est pas relancé.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ECHECS_ATTEINTS } from "../../src/github.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotRepris, fauxClient } from "../faux-github.ts";

const TICKET = 4001;
const BRANCHE = `cook/${TICKET}-github`;

test("a relaunch on a red CI where the cook adds nothing is counted; at the second for the same red check the ticket goes to the supervisor and is not relaunched", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "acceptation-4005-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(TICKET);
  faux.prs.push({ number: 4004, issue: TICKET, branche: BRANCHE, sha: "c".repeat(40), state: "open", merged: false, enRetard: false, enConflit: false, mergeePar: null, fichiers: [] });
  let lancements = 0;
  const lancer: Lancer = ({ flux }) => {
    lancements += 1;
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 12, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const github = { ...fauxClient(faux), ci: async () => [{ name: "runtime-windows", conclusion: "failure", outcome: "red", url: "https://github.com/faux/depot/actions/runs/7/job/41" }] };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github, depot: depotRepris(repertoire, "a".repeat(40)), flux: repertoire, lancer, avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);
  const corps = () => (faux.commentaires.get(TICKET) ?? []).map((c) => c.body);

  await station.tour();
  await station.calme();
  assert.equal(corps().filter((c) => c.startsWith("<!-- brigade:echec")).length, 1, "the first relaunch is counted");
  assert.equal(faux.ticket(TICKET).labels.has(ECHECS_ATTEINTS), false);

  await station.tour();
  await station.calme();
  assert.equal(corps().filter((c) => c.startsWith("<!-- brigade:echec")).length, 2, "the second relaunch is counted");
  assert.equal(faux.ticket(TICKET).labels.has(ECHECS_ATTEINTS), true, "the ticket is put aside for the supervisor");

  for (let i = 0; i < 3; i += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(lancements, 2, "no third cook is launched");
});
