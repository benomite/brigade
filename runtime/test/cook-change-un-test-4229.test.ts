// #4229, critère 2 : la livraison d'un cook qui change un fichier de test existant passe par la station jusqu'à la pass, sans blocage ni renvoi pour ce motif.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { stationDuDepot, type Lancer } from "../src/brigade-github.ts";
import { consigneDeRelecture } from "../src/reviewer.ts";
import { LABEL_IN_PASS } from "../src/github-etat/etats.ts";
import { FauxGitHub, fauxClient, STATION_DU_DEPOT } from "./faux-github.ts";

const DIFF = ["diff --git a/lib/calcul.test.ts b/lib/calcul.test.ts", "--- a/lib/calcul.test.ts", "+++ b/lib/calcul.test.ts", "@@ -1 +1 @@", "-test('adds', () => assert.equal(somme(2, 3), 6));", "+test('adds', () => assert.equal(somme(2, 3), 5));", ""].join("\n");

test("a cook that changes an existing test file in its PR reaches the pass: no block, no send-back, no failed cook", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "cook-change-un-test-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(31);
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "Done.\n<livrable>\nFixed the test.\n</livrable>" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 30, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const depot = {
    connait: () => true,
    preparer: async (run: string) => ({ worktree: join(repertoire, run), branche: `cook/${run}` }),
    reprendre: async (run: string) => join(repertoire, run),
    retirer: () => {},
    ranger: async () => null,
    pousser: () => {},
    commits: () => 1,
    changes: () => ["lib/calcul.test.ts"],
    diff: () => DIFF,
  };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github: fauxClient(faux), depot, flux: repertoire, lancer, maintenant: () => new Date("2026-11-21T09:07:00Z"), avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);
  await station.tour();
  await station.calme();
  const corps = (faux.commentaires.get(31) ?? []).map((c) => c.body).join("\n");
  assert.equal(faux.ticket(31).labels.has(LABEL_IN_PASS), true);
  assert.ok(faux.prs.some((pr) => pr.issue === 31 && pr.state === "open"));
  assert.doesNotMatch(corps, /brigade:echec|calcul\.test\.ts|test was modified/);
});

test("the review brief of a delivery that changes a test file does not treat that change as a blocking finding", () => {
  // `testsGeles` is what the station used to hand the brief when a test file moved after its freeze.
  const mission = { depot: "o/r", base: "main", ticket: { number: 31, title: "t", body: "b" }, commentaires: [], compteRendu: null, diff: { fichiers: ["lib/calcul.test.ts"], texte: DIFF }, criteres: ["It adds"], testsGeles: { fichiers: ["lib/calcul.test.ts"], diff: DIFF } };
  const brief = consigneDeRelecture(mission as Parameters<typeof consigneDeRelecture>[0]);
  assert.match(brief, /lib\/calcul\.test\.ts/);
  assert.doesNotMatch(brief, /gelé|frozen|Acceptance-Tests/i);
});
