// #3898 : la cuisine ne relance les jobs en échec qu'une fois par commit — un
// second rouge sur le même commit ne lance pas une seconde relance —, et un
// check dont la relance est due ou tourne retient les merges jusqu'à ce qu'il
// conclue.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ouvrirGitHub } from "../../src/github.ts";
import { relanceDeLaBase, retientLesMerges, type GitHubDeLaRelance } from "../../src/relance-main-rouge.ts";
import { DEPOT, fauxGh } from "../outils.ts";

const job = (run: number, job = 1) => `https://github.com/acme/brigade/actions/runs/${run}/job/${job}`;
const C1 = "c".repeat(40);
const C2 = "d".repeat(40);

type Run = { tentative: number; termine: boolean; commit: string };
function faux(runs: Record<number, Run>) {
  const relances: number[] = [];
  const avertis: string[] = [];
  const github: GitHubDeLaRelance = {
    etatDuRun: async (run) => ({ ...(runs[run] as Run) }),
    relancerLesEchecs: async (run) => {
      relances.push(run);
      runs[run] = { ...(runs[run] as Run), tentative: (runs[run]?.tentative ?? 1) + 1, termine: false };
    },
  };
  return { runs, relances, avertis, relancer: relanceDeLaBase(github, (texte) => void avertis.push(texte), "A") };
}

test("a second red on the same commit, after its re-run, starts no second re-run; another commit's red still is re-run once", async () => {
  const { runs, relances, avertis, relancer } = faux({ 7: { tentative: 1, termine: true, commit: C1 }, 8: { tentative: 1, termine: false, commit: C1 } });
  // Le run 7 est rouge ; le run 8, du même commit, tourne encore.
  assert.deepEqual((await relancer([{ name: "tests", outcome: "red", url: job(7) }, { name: "app", outcome: "pending", url: job(8) }])).map((c) => c.outcome), ["pending", "pending"]);
  assert.deepEqual(relances, [7]);
  // La relance du run 7 passe au vert ; le run 8 finit rouge à sa première tentative.
  runs[7] = { tentative: 2, termine: true, commit: C1 };
  runs[8] = { tentative: 1, termine: true, commit: C1 };
  assert.deepEqual((await relancer([{ name: "tests", outcome: "green", url: job(7) }, { name: "app", outcome: "red", url: job(8) }])).map((c) => c.outcome), ["green", "red"]);
  assert.deepEqual((await relancer([{ name: "tests", outcome: "green", url: job(7) }, { name: "app", outcome: "red", url: job(8) }])).map((c) => c.outcome), ["green", "red"]);
  assert.deepEqual(relances, [7]);
  assert.equal(avertis.filter((texte) => texte.includes("not re-run again")).length, 1);
  assert.match(avertis.at(-1) ?? "", /run 8 is red on ccccccc, whose failed jobs were already re-run once/);
  // Un nouveau commit sur main a sa relance.
  runs[9] = { tentative: 1, termine: true, commit: C2 };
  assert.deepEqual((await relancer([{ name: "app", outcome: "red", url: job(9) }])).map((c) => c.outcome), ["pending"]);
  assert.deepEqual(relances, [7, 9]);
});

test("the red runs of one commit seen in the same turn are re-run together, once", async () => {
  const { relances, relancer } = faux({ 7: { tentative: 1, termine: true, commit: C1 }, 8: { tentative: 1, termine: true, commit: C1 } });
  const base = [{ name: "tests", outcome: "red" as const, url: job(7) }, { name: "app", outcome: "red" as const, url: job(8) }];
  // Les deux se relancent, et retiennent les merges tant que leur relance tourne.
  assert.deepEqual((await relancer(base)).map((c) => [c.outcome, c.relance]), [["pending", true], ["pending", true]]);
  assert.deepEqual((await relancer(base)).map((c) => [c.outcome, c.relance]), [["pending", true], ["pending", true]]);
  assert.deepEqual(relances, [7, 8]);
});

test("a station that starts after the commit's re-run reads it from GitHub: the commit's other red run is not re-run", async () => {
  const { relances, relancer } = faux({ 7: { tentative: 2, termine: true, commit: C1 }, 8: { tentative: 1, termine: true, commit: C1 } });
  const lus = await relancer([{ name: "tests", outcome: "red", url: job(7) }, { name: "app", outcome: "red", url: job(8) }]);
  assert.deepEqual(lus.map((c) => c.outcome), ["red", "red"]);
  assert.deepEqual(relances, []);
});

test("a check whose re-run is due or runs holds merges until it concludes, even read again without its link", async () => {
  const { runs, relancer } = faux({ 7: { tentative: 1, termine: true, commit: C1 } });
  const [relu] = await relancer([{ name: "tests", outcome: "red", url: job(7) }]);
  assert.deepEqual(relu, { name: "tests", outcome: "pending", url: job(7), relance: true });
  assert.equal(retientLesMerges(relu ?? { outcome: "green" }), true);
  // GitHub rend le job relancé en cours, sans lien (GraphQL) ou avec celui du run relancé.
  assert.deepEqual(await relancer([{ name: "tests", outcome: "pending" }]), [{ name: "tests", outcome: "pending", relance: true }]);
  assert.deepEqual(await relancer([{ name: "tests", outcome: "pending", url: job(7, 2) }]), [{ name: "tests", outcome: "pending", url: job(7, 2), relance: true }]);
  // Un check en cours d'un autre run (un nouveau commit) n'est pas la relance.
  assert.deepEqual(await relancer([{ name: "tests", outcome: "pending", url: job(12) }]), [{ name: "tests", outcome: "pending", url: job(12) }]);
  // Vert, il ne retient plus rien, et un nouveau check en cours du même nom non plus.
  runs[7] = { tentative: 2, termine: true, commit: C1 };
  assert.deepEqual(await relancer([{ name: "tests", outcome: "green" }]), [{ name: "tests", outcome: "green" }]);
  assert.deepEqual(await relancer([{ name: "tests", outcome: "pending" }]), [{ name: "tests", outcome: "pending" }]);
  assert.equal(retientLesMerges({ name: "tests", outcome: "green" }), false);
  assert.equal(retientLesMerges({ name: "tests", outcome: "pending" }), false);
  assert.equal(retientLesMerges({ name: "tests", outcome: "red" }), true);
});

function sonde(t: TestContext) {
  const gh = fauxGh(t);
  return { gh, github: ouvrirGitHub({ depot: DEPOT, bin: gh.bin }) };
}

test("a GitHub Actions run says the commit it judges; without it, no commit is made up", async (t) => {
  const { gh, github } = sonde(t);
  gh.repondre(`repos/${DEPOT}/actions/runs/123`, { corps: { run_attempt: 1, status: "completed", head_sha: C1 } });
  gh.repondre(`repos/${DEPOT}/actions/runs/124`, { corps: { run_attempt: 2, status: "in_progress" } });
  assert.deepEqual(await github.etatDuRun(123), { tentative: 1, termine: true, commit: C1 });
  assert.deepEqual(await github.etatDuRun(124), { tentative: 2, termine: false });
});
