import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { FaitGardeFous, Issue, Plafonds } from "../src/evenements/garde-fous.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { arretsRecents, cooksEnCours, etatDesGardeFous } from "../src/projections/garde-fous.ts";
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
