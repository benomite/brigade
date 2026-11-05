// Une base rouge relance ses jobs en échec une fois avant de retenir quoi que
// ce soit (#2323) : une relance due ou qui tourne rend ses checks en cours, une
// relance verte ne retient rien, une relance encore rouge retient comme avant,
// et une relance déjà faite (par cette station, une autre, ou avant un
// redémarrage) ne se refait pas. Une relance refusée se retente au tour suivant.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LimiteGitHubAtteinte } from "../src/limite-github.ts";
import { relanceDeLaBase, type GitHubDeLaRelance } from "../src/relance-main-rouge.ts";

const job = (run: number, job = 1) => `https://github.com/acme/brigade/actions/runs/${run}/job/${job}`;

// Un GitHub où chaque run a sa tentative et son état ; une relance le remet en
// cours, jusqu'à ce que le test le finisse.
function faux(runs: Record<number, { tentative: number; termine: boolean }> = {}) {
  const relances: number[] = [];
  const lectures: number[] = [];
  const avertis: string[] = [];
  const refus = new Set<number>();
  const github: GitHubDeLaRelance = {
    etatDuRun: async (run) => {
      lectures.push(run);
      return { ...(runs[run] ?? { tentative: 1, termine: true }) };
    },
    relancerLesEchecs: async (run) => {
      if (refus.has(run)) throw new Error(`HTTP 403: run ${run} cannot be re-run`);
      relances.push(run);
      runs[run] = { tentative: (runs[run]?.tentative ?? 1) + 1, termine: false };
    },
  };
  const finir = (run: number) => void (runs[run] = { tentative: runs[run]?.tentative ?? 1, termine: true });
  return { relances, lectures, avertis, refus, finir, relancer: relanceDeLaBase(github, (texte) => void avertis.push(texte), "A") };
}

test("a red job at its first attempt is re-run once, and reads as pending while the re-run runs: nothing is held", async () => {
  const { relances, avertis, relancer } = faux();
  const base = [
    { name: "tests (1/2)", outcome: "red" as const, url: job(7, 1) },
    { name: "tests (2/2)", outcome: "red" as const, url: job(7, 2) },
    { name: "gates", outcome: "green" as const, url: job(7, 3) },
  ];
  assert.deepEqual((await relancer(base)).map((c) => c.outcome), ["pending", "pending", "green"]);
  // GitHub dit encore les jobs rouges au tour suivant : la relance tourne, rien ne retient.
  assert.deepEqual((await relancer(base)).map((c) => c.outcome), ["pending", "pending", "green"]);
  assert.deepEqual(relances, [7]);
  assert.deepEqual(avertis, ["brigade : base red on A — the failed jobs of run 7 are re-run once before any merge is held"]);
});

test("a re-run that turns green holds nothing, and is not re-run", async () => {
  const { relances, finir, relancer } = faux();
  await relancer([{ name: "tests", outcome: "red", url: job(7) }]);
  finir(7);
  const lus = await relancer([{ name: "tests", outcome: "green", url: job(7) }]);
  assert.deepEqual(lus.map((c) => c.outcome), ["green"]);
  assert.deepEqual(relances, [7]);
});

test("a run still red after its re-run holds as before, is not re-run again, and is no longer read", async () => {
  const { relances, lectures, finir, relancer } = faux();
  await relancer([{ name: "tests", outcome: "red", url: job(7) }]);
  finir(7);
  for (let tour = 0; tour < 3; tour += 1) {
    const lus = await relancer([{ name: "tests", outcome: "red", url: job(7) }]);
    assert.deepEqual(lus.map((c) => c.outcome), ["red"]);
  }
  assert.deepEqual(relances, [7]);
  // Lu à la relance et une fois fini ; ensuite, rouge sans plus d'appel.
  assert.deepEqual(lectures, [7, 7]);
});

test("a run another station or an earlier start already re-ran once is not re-run: GitHub counts its attempts", async () => {
  const { relances, relancer } = faux({ 7: { tentative: 2, termine: true } });
  const lus = await relancer([{ name: "tests", outcome: "red", url: job(7) }]);
  assert.deepEqual(relances, []);
  assert.deepEqual(lus.map((c) => c.outcome), ["red"]);
});

test("a run whose other jobs still run is re-run once it is over, and holds nothing meanwhile", async () => {
  const { relances, finir, relancer } = faux({ 7: { tentative: 1, termine: false } });
  assert.deepEqual((await relancer([{ name: "tests", outcome: "red", url: job(7) }])).map((c) => c.outcome), ["pending"]);
  assert.deepEqual(relances, []);
  finir(7);
  assert.deepEqual((await relancer([{ name: "tests", outcome: "red", url: job(7) }])).map((c) => c.outcome), ["pending"]);
  assert.deepEqual(relances, [7]);
});

test("a re-run GitHub refuses holds this turn, says why once, and is retried the next turn", async () => {
  const { relances, avertis, refus, relancer } = faux();
  refus.add(8);
  const base = [{ name: "tests", outcome: "red" as const, url: job(8) }];
  assert.deepEqual((await relancer(base)).map((c) => c.outcome), ["red"]);
  assert.deepEqual((await relancer(base)).map((c) => c.outcome), ["red"]);
  assert.equal(avertis.length, 1);
  assert.match(avertis[0] ?? "", /run 8 not re-run yet, retried next turn: HTTP 403/);
  refus.delete(8);
  assert.deepEqual((await relancer(base)).map((c) => c.outcome), ["pending"]);
  assert.deepEqual(relances, [8]);
});

test("a red check with no Actions job stays red, and GitHub limiting its calls stops the turn", async () => {
  const { relances, relancer } = faux();
  assert.deepEqual((await relancer([{ name: "status", outcome: "red" }])).map((c) => c.outcome), ["red"]);
  assert.deepEqual(relances, []);
  const limite = relanceDeLaBase(
    {
      etatDuRun: async () => {
        throw new LimiteGitHubAtteinte(0, 0);
      },
      relancerLesEchecs: async () => {},
    },
    () => {},
    "A",
  );
  await assert.rejects(limite([{ name: "tests", outcome: "red", url: job(9) }]), LimiteGitHubAtteinte);
});

test("a red informational Windows check on main (#2087) is never re-run, while a red `tests` check still is once (#2323)", async () => {
  const { relances, lectures, relancer } = faux();
  const lus = await relancer([
    { name: "windows tests (3/8)", outcome: "red", url: job(10, 1) },
    { name: "windows app tests", outcome: "red", url: job(11, 1) },
    { name: "tests", outcome: "red", url: job(12, 1) },
  ]);
  assert.deepEqual(lus.map((c) => c.outcome), ["red", "red", "pending"]);
  assert.deepEqual(relances, [12]);
  assert.deepEqual(lectures, [12]);
});
