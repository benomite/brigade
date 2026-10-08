import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { FaitGardeFous, Issue, Plafonds } from "../src/evenements/garde-fous.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { arretsRecents, consommation, cooksEnCours, etatDesGardeFous } from "../src/projections/garde-fous.ts";
import { horloge, repertoireTemporaire } from "./outils.ts";

const PLAFONDS: Plafonds = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (fait: FaitGardeFous, ticket: number | null = null, author = "runtime") =>
    journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const lancer = (run: string, ticket: number) =>
    noter({ type: "cook.launched", payload: { run, limits: PLAFONDS, stream: `runs/${run}.jsonl` } }, ticket);
  const finir = (run: string, ticket: number, outcome: Issue) =>
    noter({ type: "cook.exited", payload: { run, outcome, code: outcome === "ok" ? 0 : 1, signal: null, turns: 3, tokens: 40, durationMs: 5 } }, ticket);
  return { journal, base: journal.base, noter, lancer, finir };
}

test("avant tout réglage, les plafonds sont inconnus et la cuisine est ouverte", (t) => {
  const { base } = cuisine(t);

  assert.deepEqual(etatDesGardeFous(base), {
    limits: null,
    breakerThreshold: null,
    failures: 0,
    breakerOpenedAt: null,
    stoppedAt: null,
  });
});

test("les réglages journalisés sont ceux que le chef lit", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "guard.configured", payload: { limits: PLAFONDS, breakerThreshold: 3 } });

  const etat = etatDesGardeFous(base);
  assert.deepEqual(etat.limits, PLAFONDS);
  assert.equal(etat.breakerThreshold, 3);
});

test("un cook lancé est en cours jusqu'à sa fin", (t) => {
  const { base, lancer, finir } = cuisine(t);
  lancer("a", 7);
  lancer("b", 8);

  assert.deepEqual(cooksEnCours(base), [
    { run: "a", ticket: 7, launchedAt: "2026-10-08T10:00:00.000Z", limits: PLAFONDS, stream: "runs/a.jsonl" },
    { run: "b", ticket: 8, launchedAt: "2026-10-08T10:00:01.000Z", limits: PLAFONDS, stream: "runs/b.jsonl" },
  ]);

  finir("a", 7, "ok");
  assert.deepEqual(cooksEnCours(base).map((cook) => cook.run), ["b"]);
});

test("un cook interrompu par la mort du runtime n'est plus en cours", (t) => {
  const { base, lancer, noter } = cuisine(t);
  lancer("a", 7);
  noter({ type: "cook.interrupted", payload: { run: "a" } }, 7);

  assert.deepEqual(cooksEnCours(base), []);
});

test("les échecs d'affilée se comptent : garde-fou et erreur comptent, une réussite remet à zéro", (t) => {
  const { base, lancer, finir } = cuisine(t);
  const echecs = () => etatDesGardeFous(base).failures;
  for (const [run, issue, attendu] of [
    ["a", "failed", 1],
    ["b", "guard", 2],
    ["c", "stop", 2],
    ["d", "neutral", 2],
    ["e", "ok", 0],
    ["f", "guard", 1],
  ] as const) {
    lancer(run, 7);
    finir(run, 7, issue);
    assert.equal(echecs(), attendu, `après ${issue}`);
  }
});

test("une interruption par redémarrage n'est pas un échec", (t) => {
  const { base, lancer, noter } = cuisine(t);
  lancer("a", 7);
  noter({ type: "cook.interrupted", payload: { run: "a" } }, 7);

  assert.equal(etatDesGardeFous(base).failures, 0);
});

test("le disjoncteur ouvert et le « stop » tiennent jusqu'à « reprendre », qui remet tout à zéro", (t) => {
  const { base, noter, lancer, finir } = cuisine(t);
  lancer("a", 7);
  finir("a", 7, "failed");
  noter({ type: "breaker.opened", payload: { failures: 1, threshold: 1 } });
  noter({ type: "kitchen.stopped", payload: {} }, null, "chef");

  assert.deepEqual(
    { ...etatDesGardeFous(base), limits: undefined, breakerThreshold: undefined },
    { failures: 1, breakerOpenedAt: "2026-10-08T10:00:02.000Z", stoppedAt: "2026-10-08T10:00:03.000Z", limits: undefined, breakerThreshold: undefined },
  );

  noter({ type: "kitchen.resumed", payload: {} }, null, "chef");

  const etat = etatDesGardeFous(base);
  assert.deepEqual([etat.failures, etat.breakerOpenedAt, etat.stoppedAt], [0, null, null]);
});

test("« reprendre » ne touche pas aux réglages", (t) => {
  const { base, noter } = cuisine(t);
  noter({ type: "guard.configured", payload: { limits: PLAFONDS, breakerThreshold: 3 } });
  noter({ type: "kitchen.resumed", payload: {} }, null, "chef");

  assert.equal(etatDesGardeFous(base).breakerThreshold, 3);
});

test("chaque arrêt par garde-fou se retrouve avec son ticket et son motif, le plus récent d'abord", (t) => {
  const { base, noter, lancer, finir } = cuisine(t);
  lancer("a", 7);
  noter({ type: "guard.tripped", payload: { run: "a", reason: "turns", limit: 100, observed: 101 } }, 7);
  finir("a", 7, "guard");
  lancer("b", 8);
  finir("b", 8, "ok");
  lancer("c", 9);
  noter({ type: "guard.tripped", payload: { run: "c", reason: "stop", limit: null, observed: null } }, 9);

  assert.deepEqual(arretsRecents(base, 10), [
    { run: "c", ticket: 9, at: "2026-10-08T10:00:06.000Z", reason: "stop", limit: null, observed: null },
    { run: "a", ticket: 7, at: "2026-10-08T10:00:01.000Z", reason: "turns", limit: 100, observed: 101 },
  ]);
  assert.equal(arretsRecents(base, 1).length, 1);
});

test("le cook d'une relance du manager qui livre ne remet pas les échecs à zéro : c'est le verdict de la pass qui compte", (t) => {
  const { base, noter, lancer, finir } = cuisine(t);
  lancer("17-a", 17);
  finir("17-a", 17, "failed");
  noter({ type: "cook.launched", payload: { run: "17-b", limits: PLAFONDS, stream: "runs/17-b.jsonl", relaunch: true } }, 17);
  finir("17-b", 17, "ok");
  assert.equal(etatDesGardeFous(base).failures, 1);

  noter({ type: "relaunch.judged", payload: { run: "17-b", verdict: "red" } }, 17);
  assert.equal(etatDesGardeFous(base).failures, 2);
});

test("une relance du manager que la pass juge verte remet les échecs à zéro, et un cook de relance qui échoue compte comme un autre", (t) => {
  const { base, noter, finir } = cuisine(t);
  const relancer = (run: string) => noter({ type: "cook.launched", payload: { run, limits: PLAFONDS, stream: `runs/${run}.jsonl`, relaunch: true } }, 17);
  relancer("17-a");
  finir("17-a", 17, "guard");
  relancer("17-b");
  finir("17-b", 17, "failed");
  assert.equal(etatDesGardeFous(base).failures, 2);

  relancer("17-c");
  finir("17-c", 17, "ok");
  noter({ type: "relaunch.judged", payload: { run: "17-c", verdict: "green" } }, 17);
  assert.equal(etatDesGardeFous(base).failures, 0);
});

test("à plusieurs cooks, « d'affilée » se compte dans l'ordre des lancements : une réussite n'efface que les échecs des cooks lancés avant elle", (t) => {
  const { base, lancer, finir } = cuisine(t);
  const echecs = () => etatDesGardeFous(base).failures;
  for (const run of ["vieux", "a", "b", "c"]) lancer(run, 7);

  finir("a", 7, "failed");
  finir("b", 7, "guard");
  // Le vieux cook était parti avant eux : sa réussite ne dit rien des suivants.
  finir("vieux", 7, "ok");
  assert.equal(echecs(), 2);
  // Trois cooks qui échouent une fois chacun valent un cook qui échoue trois fois.
  finir("c", 7, "failed");
  assert.equal(echecs(), 3);

  // Un cook lancé après eux, et qui réussit, les efface tous.
  lancer("d", 7);
  lancer("e", 7);
  finir("d", 7, "ok");
  assert.equal(echecs(), 0);
  finir("e", 7, "failed");
  assert.equal(echecs(), 1);
});

test("après « reprendre », seuls comptent les échecs jugés depuis", (t) => {
  const { base, noter, lancer, finir } = cuisine(t);
  lancer("a", 7);
  lancer("b", 7);
  finir("a", 7, "failed");
  noter({ type: "kitchen.resumed", payload: {} }, null, "chef");
  assert.equal(etatDesGardeFous(base).failures, 0);

  finir("b", 7, "failed");
  assert.equal(etatDesGardeFous(base).failures, 1);
});

test("le relevé agrégé additionne les cooks en cours et ceux qui ont fini dans la fenêtre, relectures et jugements compris", (t) => {
  const { base, noter, finir } = cuisine(t);
  const lancer = (run: string, ticket: number | null, station: string) =>
    noter({ type: "cook.launched", payload: { run, limits: PLAFONDS, stream: `runs/${run}.jsonl`, station } }, ticket);
  assert.deepEqual(consommation(base, "2026-10-08T00:00:00.000Z"), { runs: 0, reviews: 0, judgments: 0, turns: 0, tokens: 0 });

  lancer("vieux", 7, "box/claude"); // 10:00:00
  finir("vieux", 7, "ok"); // 10:00:01 — 3 tours, 40 tokens
  lancer("fini", 8, "box/claude");
  finir("fini", 8, "failed"); // 10:00:03
  lancer("relit", 8, "reviewer");
  noter({ type: "cook.progressed", payload: { run: "relit", turns: 2, tokens: 500 } }, 8);
  noter({ type: "cook.progressed", payload: { run: "relit", turns: 5, tokens: 900 } }, 8);
  lancer("juge", null, "manager");
  lancer("mort", 9, "box/claude");
  noter({ type: "cook.progressed", payload: { run: "mort", turns: 1, tokens: 60 } }, 9);
  noter({ type: "cook.interrupted", payload: { run: "mort" } }, 9); // 10:00:10

  assert.deepEqual(consommation(base), { runs: 2, reviews: 1, judgments: 1, turns: 5, tokens: 900 });
  assert.deepEqual(consommation(base, "2026-10-08T10:00:02.000Z"), { runs: 4, reviews: 1, judgments: 1, turns: 9, tokens: 1000 });
  assert.deepEqual(consommation(base, "2026-10-08T10:00:00.000Z"), { runs: 5, reviews: 1, judgments: 1, turns: 12, tokens: 1040 });
});
