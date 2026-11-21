// #4005, critère 3 : le déclencheur « pris et repris sans livrer » du superviseur compte ces relancements.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { stationDuDepot, type GitHubDuTour, type Lancer } from "../../src/brigade-github.ts";
import { suivreLeTour } from "../../src/superviseur/tour.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotRepris, fauxClient } from "../faux-github.ts";

const TICKET = 4001;
const BRANCHE = `cook/${TICKET}-github`;

test("the supervisor's taken-again-and-again count rises with each relaunch on a red CI where the cook adds nothing", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "acceptation-4005-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(TICKET);
  faux.prs.push({ number: 4004, issue: TICKET, branche: BRANCHE, sha: "c".repeat(40), state: "open", merged: false, enRetard: false, enConflit: false, mergeePar: null, fichiers: [] });
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 12, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const tour = suivreLeTour(() => new Date("2026-11-21T18:30:00Z"));
  const github = tour.envelopper({ ...fauxClient(faux), ci: async () => [{ name: "runtime-windows", conclusion: "failure", outcome: "red", url: "https://github.com/faux/depot/actions/runs/7/job/41" }] } as unknown as GitHubDuTour);
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github: github as never, depot: depotRepris(repertoire, "a".repeat(40)), flux: repertoire, lancer, avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);

  await station.tour();
  await station.calme();
  assert.deepEqual(tour.faits().prises, [{ ticket: TICKET, prises: 1 }]);

  await station.tour();
  await station.calme();
  assert.deepEqual(tour.faits().prises, [{ ticket: TICKET, prises: 2 }]);
});
