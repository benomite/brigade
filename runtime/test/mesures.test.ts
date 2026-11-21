// Le relevé des mesures : ce que le journal dit de la lourdeur du projet,
// livraison mergée par livraison mergée, et ce que le chef en lit. Le journal
// est écrit à la main : aucune cuisine ne tourne ici.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { decrireReleve, trancher } from "../src/mesures.ts";
import { mergedDeliveries, type Delivery } from "../src/projections/measures.ts";
import { horloge, JOUR_HORLOGE, lancer, repertoireTemporaire } from "./outils.ts";

const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const MESURES = join(import.meta.dirname, "../src/montrer-mesures.ts");

type Cuisson = { tours: number; ms: number; modele?: string; effort?: string; station?: string; outcome?: "ok" | "failed" };

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  let runs = 0;
  const cuire = (ticket: number | null, { tours, ms, modele = "sonnet", effort = "low", station = "box/claude", outcome = "ok" }: Cuisson) => {
    const run = `run-${++runs}`;
    noter({ type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station, model: modele, effort } }, ticket);
    noter({ type: "cook.exited", payload: { run, outcome, code: outcome === "ok" ? 0 : 1, signal: null, turns: tours, tokens: 1000, durationMs: ms } }, ticket);
  };
  const juger = (ticket: number, measures: Record<string, number> | undefined, verdict: "green" | "red" = "green") =>
    noter(
      {
        type: "pass.judged",
        payload: {
          run: `run-${runs}`,
          pr: `https://exemple.test/pull/${ticket}`,
          number: ticket,
          sha: `sha-${ticket}`,
          verdict,
          gates: { outcome: verdict, code: verdict === "green" ? 0 : 1, failures: [], tail: "", ...(measures ? { measures } : {}) },
          ci: { outcome: "none", checks: [] },
          review: { outcome: "skipped", run: null, summary: null, findings: [] },
          findings: [],
          judgeModified: false,
          noDiff: false,
        },
      },
      ticket,
    );
  const merger = (ticket: number) => noter({ type: "merge.done", payload: { pr: `https://exemple.test/pull/${ticket}`, sha: `sha-${ticket}`, by: "pass", reconciled: false } }, ticket);
  // Une livraison entière : un cook, des gates vertes, le merge.
  const livrer = (ticket: number, measures: Record<string, number> | undefined, cuisson: Cuisson = { tours: 10, ms: 60_000 }) => {
    cuire(ticket, cuisson);
    juger(ticket, measures);
    merger(ticket);
  };
  return { repertoire, journal, base: journal.base, noter, cuire, juger, merger, livrer };
}

const livraison = (measures: Record<string, number>, reste: Partial<Delivery> = {}): Delivery => ({ ticket: 1, at: `${JOUR_HORLOGE}T10:00:00.000Z`, measures, state: measures, gatesS: null, cooks: [], ...reste });

test("une livraison mergée porte les mesures de ses dernières gates, la durée de toutes, et ses cooks", (t) => {
  const { base, cuire, juger, merger } = cuisine(t);
  cuire(17, { tours: 30, ms: 600_000 });
  juger(17, { tests: 200, gates_s: 8 }, "red");
  cuire(17, { tours: 12, ms: 120_000, modele: "opus", effort: "high" });
  juger(17, { tests: 203, gates_s: 9 });
  merger(17);

  assert.deepEqual(mergedDeliveries(base), [
    {
      ticket: 17,
      at: `${JOUR_HORLOGE}T10:00:06.000Z`,
      measures: { tests: 203, gates_s: 9 },
      state: { tests: 203, gates_s: 9 },
      gatesS: 17,
      cooks: [
        { calibration: "sonnet/low", turns: 30, durationMs: 600_000, tokens: 1000, delivered: true },
        { calibration: "opus/high", turns: 12, durationMs: 120_000, tokens: 1000, delivered: true },
      ],
    },
  ]);
});

test("ni une relecture ni un jugement ne comptent parmi les cooks d'un ticket, et une livraison non mergée n'est pas relevée", (t) => {
  const { base, cuire, juger, livrer } = cuisine(t);
  cuire(17, { tours: 4, ms: 30_000, station: "reviewer" });
  cuire(17, { tours: 2, ms: 10_000, station: "manager" });
  cuire(null, { tours: 2, ms: 10_000 });
  livrer(17, { tests: 203 });
  cuire(18, { tours: 9, ms: 90_000 });
  juger(18, { tests: 210 });

  assert.deepEqual(mergedDeliveries(base).map(({ ticket, cooks }) => [ticket, cooks.length]), [[17, 1]]);
});

test("un ticket servi deux fois fait deux livraisons, chacune avec ses gates et ses cooks", (t) => {
  const { base, livrer } = cuisine(t);
  livrer(17, { tests: 203 }, { tours: 10, ms: 60_000 });
  livrer(17, { tests: 240 }, { tours: 25, ms: 90_000 });

  assert.deepEqual(mergedDeliveries(base).map(({ measures, cooks }) => [measures.tests, cooks.map((cook) => cook.turns)]), [[203, [10]], [240, [25]]]);
});

test("des gates qui ne déclarent rien laissent une livraison sans mesure, jamais à zéro", (t) => {
  const { base, livrer } = cuisine(t);
  livrer(17, undefined);

  assert.deepEqual(mergedDeliveries(base).map(({ measures, gatesS }) => ({ measures, gatesS })), [{ measures: {}, gatesS: null }]);
});

test("une livraison jugée avant une autre et mergée après elle, sans rejeu, ne dit rien de l'état du projet", (t) => {
  const { base, cuire, juger, merger } = cuisine(t);
  // A est jugée verte puis attend ; B est jugée et mergée ; A est mergée telle quelle.
  cuire(17, { tours: 10, ms: 60_000 });
  juger(17, { tests: 916, depot_octets: 2_000_000, gates_s: 9 });
  cuire(18, { tours: 10, ms: 60_000 });
  juger(18, { tests: 930, gates_s: 12 });
  merger(18);
  merger(17);

  const livraisons = mergedDeliveries(base);

  // Le dépôt, lui, n'a été déclaré par personne depuis : A reste ce qu'on en sait de mieux.
  assert.deepEqual(livraisons.map(({ ticket, measures, state }) => ({ ticket, tests: measures.tests, state })), [
    { ticket: 18, tests: 930, state: { tests: 930, gates_s: 12 } },
    { ticket: 17, tests: 916, state: { depot_octets: 2_000_000 } },
  ]);
  assert.deepEqual(trancher(livraisons, 1).map(({ etats, gatesS }) => [etats.tests, gatesS]), [[930, 12], [null, 9]]);
});

test("rejouée sur la base qui a avancé, la même livraison dit de nouveau l'état du projet", (t) => {
  const { base, noter, cuire, juger, merger } = cuisine(t);
  cuire(17, { tours: 10, ms: 60_000 });
  juger(17, { tests: 916 });
  cuire(18, { tours: 10, ms: 60_000 });
  juger(18, { tests: 930 });
  merger(18);
  noter({ type: "pass.replayed", payload: { sha: "sha-17", base: "base-2", gates: { outcome: "green", code: 0, failures: [], tail: "", measures: { tests: 946 } }, findings: [] } }, 17);
  merger(17);

  assert.deepEqual(mergedDeliveries(base).map(({ state }) => state.tests), [930, 946]);
});

test("une tranche vaut l'état que laisse sa dernière livraison, et la médiane de ce qui se répète", () => {
  const tranches = trancher(
    [
      livraison({ tests: 203, gates_s: 8 }, { gatesS: 8, cooks: [{ calibration: "sonnet/low", turns: 10, durationMs: 92_000, tokens: null, delivered: true }] }),
      livraison({ tests: 210, gates_s: 20 }, { gatesS: 20, cooks: [{ calibration: "sonnet/low", turns: 30, durationMs: 180_000, tokens: null, delivered: true }] }),
      livraison({}, { at: "2026-10-09T08:00:00.000Z" }),
      livraison({ tests: 622, gates_s: 21 }, { at: "2026-10-09T09:00:00.000Z", gatesS: 21, cooks: [{ calibration: "sonnet/low", turns: 40, durationMs: 79_000, tokens: null, delivered: true }, { calibration: "opus/high", turns: 18, durationMs: 0, tokens: null, delivered: true }] }),
    ],
    3,
  );

  assert.deepEqual(
    tranches.map(({ premier, dernier, jusquAu, etats, gatesS, partGates, tours }) => ({ premier, dernier, jusquAu, tests: etats.tests, gatesS, partGates, tours: [...tours] })),
    [
      // La troisième livraison ne déclare rien : l'état est celui de la deuxième.
      { premier: 1, dernier: 3, jusquAu: "2026-10-09T08:00:00.000Z", tests: 210, gatesS: 14, partGates: 0.09, tours: [["sonnet/low", { mediane: 20, tickets: 2 }]] },
      // Monté d'un calibrage : tous ses tours, sous celui avec lequel il a fini.
      { premier: 4, dernier: 4, jusquAu: "2026-10-09T09:00:00.000Z", tests: 622, gatesS: 21, partGates: 0.21, tours: [["opus/high", { mediane: 58, tickets: 1 }]] },
    ],
  );
});

test("le chef lit les mesures dans le temps : une ligne par tranche, la pente, les tours par calibrage", (t) => {
  const { base, livrer } = cuisine(t);
  livrer(1, { tests: 203, tests_s: 1.1, gates_s: 9, depot_octets: 1_200_000, contexte_octets: 6100, doc_octets: 212_000 }, { tours: 31, ms: 216_000, modele: "opus", effort: "high" });
  livrer(2, { tests: 287, tests_s: 1.9, gates_s: 11, depot_octets: 1_500_000, contexte_octets: 6100, doc_octets: 268_000 }, { tours: 12, ms: 209_000 });
  livrer(3, undefined, { tours: 14, ms: 100_000 });
  livrer(4, { tests: 622, tests_s: 6.2, gates_s: 21, depot_octets: 2_900_000, contexte_octets: 9400, doc_octets: 511_000 }, { tours: 58, ms: 170_000, modele: "opus", effort: "high" });

  assert.deepEqual(decrireReleve({ projet: "brigade", livraisons: mergedDeliveries(base) }, 2), [
    "report     brigade — 4 merges in the log, in slices of 2",
    "           4 since the last closing (none in the log) · 4 since the last security review (none in the log)",
    "           only the deliveries the pass judged count, and the cooks in the log — not the account's consumption",
    "",
    "merges  up to       tests  test suite  gates  gates share  repo    context  docs",
    `1-2     ${JOUR_HORLOGE}  287    1.9 s       10 s   5%           1.5 MB  6.1 KB   268 KB`,
    `3-4     ${JOUR_HORLOGE}  622    6.2 s       21 s   11%          2.9 MB  9.4 KB   511 KB`,
    "slope               ×2.2   ×3.3        ×2.1                ×1.9    ×1.5     ×1.9",
    "",
    "turns      per ticket, median by calibration (in parentheses: over how many tickets)",
    "merges  opus/high  sonnet/low",
    "1-2     31 (1)     12 (1)",
    "3-4     58 (1)     14 (1)",
    "",
    "tokens     per ticket, median by calibration (in parentheses: over how many tickets), and the costliest of the slice",
    "merges  opus/high                 sonnet/low",
    "1-2     1,000 (1) · max #1 1,000  1,000 (1) · max #2 1,000",
    "3-4     1,000 (1) · max #4 1,000  1,000 (1) · max #3 1,000",
    "",
    "launches   no ticket launched more than once, and no launch without a delivery, behind these merges",
    "",
  ]);
});

// Un clone dont la branche d'intégration (`origin/main`) porte un merge par ticket, comme la station GitHub les
// fait : `measures` y lit ses merges, le journal n'en voyant plus depuis #2061 (#2707).
function cloneMerge(t: TestContext, tickets: number[]): string {
  const clone = repertoireTemporaire(t);
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: clone, env });
  tickets.forEach((ticket, rang) =>
    execFileSync("git", ["commit", "-q", "--allow-empty", "-m", `Merge pull request #${ticket} from o/cook/${ticket}-github`], { cwd: clone, env: { ...env, GIT_COMMITTER_DATE: `${JOUR_HORLOGE}T1${rang}:00:00Z` } }),
  );
  execFileSync("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], { cwd: clone, env });
  return clone;
}

test("sans merge ou sans cook calibré, le relevé le dit au lieu de montrer des zéros", () => {
  assert.deepEqual(decrireReleve({ projet: "brigade", livraisons: [] }), ["report     brigade — no merge in the log: nothing to report"]);

  const lignes = decrireReleve({ projet: "brigade", livraisons: [livraison({})] });

  assert.deepEqual(lignes.slice(4), [
    "merges  up to       tests  test suite  gates  gates share  repo  context  docs",
    `1       ${JOUR_HORLOGE}  —      —           —      —            —     —        —`,
    "slope",
    "",
    "turns      no calibrated cook behind these merges",
    "",
    "tokens     nothing to measure: no calibrated cook, or none with known tokens, behind these merges",
    "",
    "launches   no ticket launched more than once, and no launch without a delivery, behind these merges",
    "",
  ]);
});

test("au-delà de douze tranches, seules les dernières sont montrées, et le relevé le dit", () => {
  const lignes = decrireReleve({ projet: "brigade", livraisons: Array.from({ length: 14 }, () => livraison({ tests: 1 })) }, 1);

  assert.equal(lignes[0], "report     brigade — 14 merges in the log, in slices of 1 (the last 12)");
  assert.deepEqual(lignes.slice(5, 17).map((ligne) => ligne.split(" ")[0]), ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"]);
});

test("la commande montre le relevé sans rien écrire, et refuse un argument qu'elle ne connaît pas", async (t) => {
  const { repertoire, journal, livrer } = cuisine(t);
  // Deux merges au journal, qui ne comptent plus (#2707) ; deux au clone, dont le second a un cook GitHub.
  livrer(1, { tests: 203 });
  livrer(2, { tests: 287 });
  const clone = cloneMerge(t, [3, 4]);
  mkdirSync(join(repertoire, "github-seul"));
  writeFileSync(join(repertoire, "github-seul", "4-github.flux.jsonl"), [{ type: "system", subtype: "init", model: "opus" }, { type: "assistant", message: { id: "m1", usage: { input_tokens: 700, output_tokens: 300 } } }, { type: "result", is_error: false }].map((ligne) => JSON.stringify(ligne)).join("\n"));
  const avant = journal.dernierSeq();

  const commande = lancer(t, MESURES, ["--by", "1"], { BRIGADE_STATE_DIR: repertoire, BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: "main" });
  const refus = lancer(t, MESURES, ["--by", "zéro"], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.match(commande.sortie(), /^report {5}brigade — 2 merges in the log, in slices of 1\n/);
  assert.match(commande.sortie(), new RegExp(String.raw`\n2 {7}${JOUR_HORLOGE} {2}— `));
  assert.match(commande.sortie(), /#4 1,000/);
  assert.equal(journal.dernierSeq(), avant);
  assert.equal(await refus.fin, 2);
  assert.match(refus.sortie(), /usage: BRIGADE_STATE_DIR=/);
});

test("le plafond des gates, franchi sans être jugé, se lit au relevé : sur combien de livraisons, et de combien à la dernière", (t) => {
  const { base, noter, juger, merger, livrer } = cuisine(t);
  const franchir = (ticket: number, cpuSeconds: number, measures?: Record<string, number>) =>
    noter(
      {
        type: "pass.judged",
        payload: {
          run: "run",
          pr: `https://exemple.test/pull/${ticket}`,
          number: ticket,
          sha: `sha-${ticket}`,
          verdict: "green",
          gates: { outcome: "green", code: 1, failures: [], tail: "", overCeiling: { cpuSeconds, limitSeconds: 165, line: "durée des gates : …" }, ...(measures ? { measures } : {}) },
          ci: { outcome: "none", checks: [] },
          review: { outcome: "skipped", run: null, summary: null, findings: [] },
          findings: [],
          judgeModified: false,
          noDiff: false,
        },
      },
      ticket,
    );
  livrer(17, { tests: 200 });
  // Des gates qui ne déclarent aucune mesure — celles du script type — franchissent aussi.
  franchir(18, 233.1);
  merger(18);
  franchir(19, 178.3, { tests: 203 });
  merger(19);
  // Franchi, puis rejugé sous le plafond : ce sont les dernières gates qui disent la livraison.
  franchir(20, 170, { tests: 203 });
  juger(20, { tests: 204 });
  merger(20);

  const livraisons = mergedDeliveries(base);
  assert.deepEqual(livraisons.map((livraison) => livraison.overCeiling?.cpuSeconds), [undefined, 233.1, 178.3, undefined]);
  // Une livraison dont les gates n'ont rien déclaré ne porte toujours aucune mesure.
  assert.deepEqual(livraisons.map((livraison) => livraison.measures), [{ tests: 200 }, {}, { tests: 203 }, { tests: 204 }]);
  assert.equal(
    decrireReleve({ projet: "brigade", livraisons }).at(-1),
    "cap        of the gates exceeded on 2 of 4 deliveries — not judged by the pass; the latest: #19, 178.3 s of CPU for a cap of 165 s (+8%)",
  );
  assert.doesNotMatch(decrireReleve({ projet: "brigade", livraisons: livraisons.slice(0, 1) }).join("\n"), /plafond/);
});

test("le total d'un ticket est son coût sans rétro plus le coût de sa rétro, sans rien compter deux fois", (t) => {
  const { base, noter, cuire, juger, merger } = cuisine(t);
  // Le cook coûte 1000 tokens, rétro comprise (elle est dans son dernier message) ;
  // le rapport du cook dit que la rétro en a coûté 150 : le ticket seul, 850.
  cuire(17, { tours: 10, ms: 60_000 });
  noter({ type: "cook.reported", payload: { run: "run-1", ending: "done", reason: null, summary: "fini", deliverable: "fini", retro: "propose une leçon.", retroTokens: 150, branch: "cook/17", pr: null } }, 17);
  juger(17, undefined);
  merger(17);
  cuire(18, { tours: 10, ms: 60_000 });
  juger(18, undefined);
  merger(18);
  const livraisons = mergedDeliveries(base);

  const [tranche] = trancher(livraisons);
  assert.equal(livraisons[0]?.retroTokens, 150);
  assert.equal(livraisons[1]?.retroTokens, undefined);
  assert.deepEqual([...(tranche?.tokens ?? [])], [["sonnet/low", { mediane: 1000, tickets: 2, plusCher: { ticket: 17, tokens: 1000 } }]]);
  assert.deepEqual(tranche?.retros, [{ ticket: 17, total: 1000, sansRetro: 850, retro: 150 }]);
  const cout = tranche?.retros[0];
  assert.equal(cout?.total, (cout?.sansRetro ?? NaN) + (cout?.retro ?? NaN));
  const lignes = decrireReleve({ projet: "brigade", livraisons });
  assert.ok(lignes.some((ligne) => ligne.startsWith("retro ")));
  assert.ok(lignes.some((ligne) => /^1-2\s+#17\s+1,000\s+850\s+150$/.test(ligne)));
});

test("sans rétro, le relevé ne dit rien d'elle", (t) => {
  const { base, livrer } = cuisine(t);
  livrer(17, undefined);
  const livraisons = mergedDeliveries(base);

  assert.equal("retroTokens" in (livraisons[0] ?? {}), false);
  assert.deepEqual(trancher(livraisons)[0]?.retros, []);
  assert.ok(!decrireReleve({ projet: "brigade", livraisons }).some((ligne) => ligne.startsWith("retro ")));
});
