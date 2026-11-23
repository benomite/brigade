// Invariant 4 du rail (#4026) : un check rouge sur la base est relancé une
// fois, avant toute autre chose.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Reveil } from "../../src/superviseur/declencheur.ts";
import { jouerLeRun, relancerLesRouges } from "../../src/superviseur/gestes.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";
import { FauxDepot } from "../superviseur/faux-depot.ts";

// Au plus 30 min, une relance sans résultat retient le tour.
const RESULTAT_DE_LA_RELANCE_MS = 30 * 60_000;

const fixer = (faux: FauxGitHub, outcome: "green" | "red" | "pending") => {
  (faux as { base: string }).base = outcome;
};

test("the tick of the rerun and the ticks while it runs do nothing else; its red result lets the tick go on, without a second rerun", async () => {
  const faux = new FauxGitHub();
  fixer(faux, "red");
  faux.feu(1, CALIBRE);
  const relances: string[][] = [];
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, cuisiner: async () => ({ echec: "not the point" }), relancerLaBase: async (rouges) => void relances.push(rouges.map(({ name }) => name ?? "?")) });
  await a.tour();
  await a.calme();
  assert.deepEqual(relances, [["tests"]]);
  assert.deepEqual(faux.cuissons, [], "nothing else on the tick of the rerun");
  fixer(faux, "pending");
  await a.tour();
  await a.calme();
  assert.deepEqual(faux.cuissons, [], "nothing while the rerun runs");
  fixer(faux, "red");
  await a.tour();
  await a.calme();
  assert.deepEqual(relances, [["tests"]], "rerun once");
  assert.equal(faux.cuissons.length, 1, "the rerun's result is in: the tick goes on");
});

test("a pending base that no rerun started holds nothing, and a rerun that gives no result holds the tick no longer than its bound", async () => {
  const faux = new FauxGitHub();
  fixer(faux, "pending");
  faux.feu(1, CALIBRE);
  let maintenant = Date.parse("2026-11-10T08:00:00.000Z");
  const relances: number[] = [];
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, cuisiner: async () => ({ echec: "not the point" }), relancerLaBase: async () => void relances.push(maintenant), maintenant: () => new Date(maintenant) });
  await a.tour();
  await a.calme();
  assert.equal(faux.cuissons.length, 1, "no rerun, nothing held");
  fixer(faux, "red");
  await a.tour();
  await a.calme();
  fixer(faux, "pending");
  maintenant += RESULTAT_DE_LA_RELANCE_MS - 1;
  await a.tour();
  await a.calme();
  assert.equal(faux.cuissons.length, 1, "held while its rerun runs");
  maintenant += 2;
  await a.tour();
  await a.calme();
  assert.equal(relances.length, 1);
  assert.equal(faux.cuissons.length, 2, "past its bound, the rerun holds the tick no longer");
});

test("checks that are no GitHub Actions jobs are told apart by name: a second red check is rerun too", async () => {
  const faux = new FauxGitHub();
  fixer(faux, "red");
  const relances: string[][] = [];
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: () => {}, relancerLaBase: async (rouges) => void relances.push(rouges.map(({ name }) => name ?? "?")) });
  await a.tour();
  faux.checksDeLaBaseSeule = [{ name: "windows tests", outcome: "red" }];
  await a.tour();
  await a.tour();
  assert.deepEqual(relances, [["tests"], ["windows tests"]]);
});

test("without a rerun of its own, the station reruns the failed jobs of the red Actions checks; a red check that is no Actions job holds nothing and is not said", async () => {
  const faux = new FauxGitHub();
  faux.checksDeLaBaseSeule = [{ name: "tests (linux)", outcome: "red", url: "https://github.com/faux/depot/actions/runs/7/job/31" } as never];
  faux.feu(1, CALIBRE);
  const avertis: string[] = [];
  const a = faux.station("A", { places: 1, sauter: () => {}, avertir: (texte) => avertis.push(texte), cuisiner: async () => ({ echec: "not the point" }) });
  await a.tour();
  await a.calme();
  assert.equal(faux.appels.filter(({ quoi }) => quoi === "relancerLesEchecs").length, 1);
  assert.deepEqual(faux.cuissons, []);
  assert.match(avertis.join("\n"), /invariant 4 broke on A — main is red \(tests \(linux\)\); the supervisor reran the failed jobs of main \(tests \(linux\); run 7\)/);
  const b = new FauxGitHub();
  fixer(b, "red");
  b.feu(1, CALIBRE);
  const station = b.station("B", { places: 1, sauter: () => {}, avertir: (texte) => assert.doesNotMatch(texte, /invariant/), cuisiner: async () => ({ echec: "not the point" }) });
  await station.tour();
  await station.calme();
  assert.equal(b.cuissons.length, 1, "nothing to rerun: nothing held");
});

test("the supervisor's rerun gesture reruns through the same function as the invariant", async () => {
  assert.equal(await relancerLesRouges({ relancerLesEchecs: async () => assert.fail("no Actions job") }, "main", [{ name: "lint", url: null }]), null);
  const depot = new FauxDepot();
  depot.issue(40, ["fire"]);
  depot.checkRouge("tests (linux)", 7);
  const reveil: Reveil = { cause: "takes", takes: 3, ticket: 40 };
  const trace = await jouerLeRun({ github: depot.client(), depot: "acme/shop", branche: "main", maintenant: new Date("2026-11-20T10:00:00.000Z") }, reveil, { saw: "main red", gesture: { gesture: "rerun", ticket: 40 } });
  assert.equal(trace.outcome, "done", trace.comment ?? "");
  assert.deepEqual(depot.relances(), [7]);
});
