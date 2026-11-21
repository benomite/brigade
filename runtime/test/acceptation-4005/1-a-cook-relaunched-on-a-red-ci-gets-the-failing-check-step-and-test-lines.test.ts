// #4005, critère 1 : un cook relancé sur une CI rouge reçoit le check en échec, son étape en échec et les lignes de test en échec de son journal.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotRepris, fauxClient } from "../faux-github.ts";

const TICKET = 4001;
const BRANCHE = `cook/${TICKET}-github`;
const JOB = "https://github.com/faux/depot/actions/runs/7/job/41";
const JOURNAL = [
  "2026-11-21T18:21:00.0000000Z ##[group]Run npm --prefix runtime test",
  "2026-11-21T18:21:01.0000000Z ✔ a test that passes (3ms)",
  "2026-11-21T18:21:02.0000000Z ✖ aucune garde de plus de 2 s hors de la liste d'exceptions, et aucune exception de garde périmée (12ms)",
  "2026-11-21T18:21:03.0000000Z   AssertionError: la garde de runtime/test/zz/lent.test.ts dure 3500 ms",
  "2026-11-21T18:21:04.0000000Z ##[error]Process completed with exit code 1.",
  "",
].join("\n");

test("a cook relaunched on a red CI is given the failing check, its failed step and the failing test lines of its log", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "acceptation-4005-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(TICKET);
  faux.prs.push({ number: 4004, issue: TICKET, branche: BRANCHE, sha: "c".repeat(40), state: "open", merged: false, enRetard: false, enConflit: false, mergeePar: null, fichiers: [] });
  let consigne = "";
  const lancer: Lancer = ({ entree, flux }) => {
    consigne = entree ?? "";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 12, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const github = {
    ...fauxClient(faux),
    ci: async () => [{ name: "runtime-windows", conclusion: "failure", outcome: "red", url: JOB }],
    // L'annotation nomme un fichier : elle ne dit ni l'étape ni les tests.
    annotationsDuCheck: async () => [{ chemin: "runtime/test/garde-duree/garde-duree.test.ts", ligne: 1, titre: "runtime-windows", message: "Process completed with exit code 1." }],
    journalDuCheck: async () => JOURNAL,
    etapesEnEchec: async () => ["Run the runtime tests"],
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github, depot: depotRepris(repertoire, "a".repeat(40)), flux: repertoire, lancer, avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);
  await station.tour();
  await station.calme();

  assert.match(consigne, /runtime-windows/);
  assert.match(consigne, /Run the runtime tests/);
  assert.match(consigne, /✖ aucune garde de plus de 2 s hors de la liste d'exceptions, et aucune exception de garde périmée/);
  assert.match(consigne, /la garde de runtime\/test\/zz\/lent\.test\.ts dure 3500 ms/);
});
