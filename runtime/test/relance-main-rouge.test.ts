// Une base rouge relance ses jobs en échec une fois avant de retenir quoi que
// ce soit (#2323) : une relance qui part rend ses checks en cours, une relance
// déjà faite (par cette station, une autre, ou avant un redémarrage) ne se
// refait pas, et un check sans job de GitHub Actions reste rouge.
import assert from "node:assert/strict";
import { test } from "node:test";
import { relanceDeLaBase } from "../src/relance-main-rouge.ts";

const job = (run: number, job = 1) => `https://github.com/acme/brigade/actions/runs/${run}/job/${job}`;

function faux(tentatives: Record<number, number> = {}) {
  const relances: number[] = [];
  const avertis: string[] = [];
  const github = {
    tentativeDuRun: async (run: number) => tentatives[run] ?? 1,
    relancerLesEchecs: async (run: number) => {
      relances.push(run);
      tentatives[run] = (tentatives[run] ?? 1) + 1;
    },
  };
  return { relances, avertis, relancer: relanceDeLaBase(github, (texte) => void avertis.push(texte), "A") };
}

test("a red job at its first attempt is re-run once, and reads as pending: the re-run holds nothing", async () => {
  const { relances, avertis, relancer } = faux();
  const lus = await relancer([
    { name: "tests (1/2)", outcome: "red", url: job(7, 1) },
    { name: "tests (2/2)", outcome: "red", url: job(7, 2) },
    { name: "gates", outcome: "green", url: job(7, 3) },
  ]);
  assert.deepEqual(relances, [7]);
  assert.deepEqual(lus.map((c) => c.outcome), ["pending", "pending", "green"]);
  assert.equal(avertis.length, 1);
});

test("a run still red after its re-run holds as before, and is not re-run again", async () => {
  const { relances, relancer } = faux();
  await relancer([{ name: "tests", outcome: "red", url: job(7) }]);
  const lus = await relancer([{ name: "tests", outcome: "red", url: job(7) }]);
  assert.deepEqual(relances, [7]);
  assert.deepEqual(lus.map((c) => c.outcome), ["red"]);
});

test("a run another station or an earlier start already re-ran is not re-run: GitHub counts its attempts", async () => {
  const { relances, relancer } = faux({ 7: 2 });
  const lus = await relancer([{ name: "tests", outcome: "red", url: job(7) }]);
  assert.deepEqual(relances, []);
  assert.deepEqual(lus.map((c) => c.outcome), ["red"]);
});

test("a red check with no Actions job, or a re-run GitHub refuses, stays red and says why", async () => {
  const avertis: string[] = [];
  const relancer = relanceDeLaBase(
    { tentativeDuRun: async () => 1, relancerLesEchecs: async () => { throw new Error("HTTP 403"); } },
    (texte) => void avertis.push(texte),
    "A",
  );
  const lus = await relancer([{ name: "status", outcome: "red" }, { name: "tests", outcome: "red", url: job(8) }]);
  assert.deepEqual(lus.map((c) => c.outcome), ["red", "red"]);
  assert.match(avertis.join("\n"), /run 8 not re-run: HTTP 403/);
});
