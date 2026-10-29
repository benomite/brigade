// La carte d'une livraison verte à relire — elle change ses juges, ou ce que
// le projet s'ouvre (#1877) : elle dit en mots simples ce qu'elle change, et
// que sa relecture n'a rien trouvé de bloquant ; un seul bouton, « Merge ». Et
// elle n'atteint le chef qu'une fois relue de bout en bout : tant que son
// second juge ne l'a pas jugée, qu'il l'a établie non affaiblie, ou que le
// triage lit encore sa carte, elle est à la cuisine.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { attentesDuChef } from "../../src/attend.ts";
import { carteDuTicket } from "../../src/carte-todo/cartes.ts";
import { validerCarte } from "../../src/carte-todo/forme.ts";
import type { Fait } from "../../src/evenements.ts";
import type { Gates, VerdictDuSecondJuge } from "../../src/events/pass.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { lireRail } from "../../src/projections/rail.ts";
import { jourDecale, repertoireTemporaire } from "../outils.ts";

const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const STATION = "box/claude";
const PR = "https://exemple.test/pull/17";
const GATES: Gates = { outcome: "green", code: 0, failures: [], tail: "" };

type Livree = { juges?: Array<{ file: string; added: number; removed: number }>; declarations?: string[] };

// Une cuisine où le ticket #17 est livré vert, et arrêté par la pass parce
// qu'il touche à ses juges ou à ses déclarations.
function cuisine(t: TestContext, { juges = [], declarations = [] }: Livree) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const noter = (fait: Fait, author = "pass") => journal.ajouter({ project: "brigade", ticket: 17, author, ...fait });
  noter({ type: "ticket.arrived", payload: { title: "Ticket 17", priority: null, createdAt: "2026-10-01T00:00:17Z", url: "https://exemple.test/17", card: { waitsFor: [], zone: [], problems: [] } } }, "github");
  noter({ type: "ticket.taken", payload: { station: STATION, leaseUntil: `${jourDecale(30)}T00:00:00.000Z` } }, `station:${STATION}`);
  noter({ type: "cook.launched", payload: { run: "17-aa", limits: LIMITES, stream: "runs/17-aa.jsonl", branch: "cook/17-aa", worktree: "worktrees/17-aa" } }, "runtime");
  noter({ type: "cook.exited", payload: { run: "17-aa", outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } }, "runtime");
  noter({ type: "ticket.passing", payload: { station: STATION } }, `station:${STATION}`);
  noter({ type: "pass.started", payload: { run: "17-aa", pr: PR, number: 17, sha: "sha-17" } });
  noter({
    type: "pass.judged",
    payload: {
      run: "17-aa",
      pr: PR,
      number: 17,
      sha: "sha-17",
      verdict: "green",
      gates: GATES,
      ci: { outcome: "green", checks: [] },
      review: { outcome: "green", run: "review-17-x", summary: "Le diff fait ce que le ticket demande.", findings: [] },
      findings: [],
      judgeModified: juges.length > 0,
      ...(juges.length > 0 ? { judges: juges } : {}),
      declarations,
      noDiff: false,
    },
  });
  noter({ type: "pass.held", payload: { reason: "review-required", cause: declarations.length > 0 ? `declaration-modified: ${declarations.join(", ")}` : "judge-modified" } });
  const juger = (verdict: VerdictDuSecondJuge, change?: string, sha = "sha-17") =>
    noter({
      type: "pass.second-judged",
      payload: { run: "17-aa", sha, judge: "second-judge-17-x", model: "opus", effort: "high", reviewer: { model: "sonnet", effort: "medium" }, review: "review-17-x", verdict, reason: "Raison du second juge.", ...(change === undefined ? {} : { change }) },
    });
  // La carte `gesture` que la pass propose avec un verdict qui retient : au triage.
  const proposer = () => noter({ type: "todo.held", payload: { kind: "gesture", statement: "Weakened, says the second judge: …", capture: null, choices: null } });
  return {
    juger,
    proposer,
    // La porte la refuse : le triage l'a laissée passer sans la trancher, ou il n'y en a pas.
    refuser: () => noter({ type: "todo.refused", payload: { kind: "gesture", statement: "Weakened, says the second judge: …", capture: null, choices: null, reason: "“gesture” is not a TODO card" } }),
    attend: () => attentesDuChef(journal.base, lireRail(journal.base)).some((attente) => attente.ticket === 17),
    carte: () => carteDuTicket(journal.base, 17)?.carte,
  };
}

const GATES_SH = [{ file: ".claude/brigade/gates.sh", added: 5, removed: 2 }];
const WORKFLOW = [{ file: ".github/workflows/runtime-windows.yml", added: 8, removed: 2 }];

test("touching its judges, it does not reach the chef before its second judge has judged it", (t) => {
  const { attend, carte } = cuisine(t, { juges: WORKFLOW });
  assert.equal(attend(), false);
  assert.equal(carte(), undefined);
});

test("judged on another commit, the second judge's verdict does not count for this delivery", (t) => {
  const { juger, attend } = cuisine(t, { juges: WORKFLOW });
  juger("weakened", "skips a test", "sha-ancien");
  assert.equal(attend(), false);
});

test("established not weakened, touching only its judges: the pass takes it back as an ordinary delivery — nothing for the chef", (t) => {
  const { juger, attend } = cuisine(t, { juges: WORKFLOW });
  juger("not-weakened", "runs the Windows tests on v2 too");
  assert.equal(attend(), false);
});

test("weakened: while the triage reads its second judge's card, it stays in the kitchen; once let through, the chef gets one card, one button", (t) => {
  const { juger, proposer, refuser, attend, carte } = cuisine(t, { juges: WORKFLOW });
  juger("weakened", "skips 5 Windows-only flaky tests, listed in #1850");
  proposer();
  assert.equal(attend(), false);

  refuser();
  const vue = carte();
  assert.ok(vue);
  assert.equal(vue.type, "merge");
  assert.equal(vue.resume, "The delivery of #17 changes how deliveries are checked: it skips 5 Windows-only flaky tests, listed in #1850. Its review found nothing blocking, but it loosens a check, which only you can accept.");
  assert.equal(vue.question, null);
  assert.deepEqual(vue.choix, [{ texte: "Merge", suite: "merge" }]);
  assert.equal(vue.secondaire.texte, "ask the second");
});

test("its second judge could not tell: the card says so, with its one button", (t) => {
  const { juger, refuser, proposer, carte } = cuisine(t, { juges: GATES_SH });
  juger("cannot-establish", "It changes how the gates run the runtime tests.");
  proposer();
  refuser();
  assert.equal(carte()?.resume, "The delivery of #17 changes how deliveries are checked: it changes how the gates run the runtime tests. Its review found nothing blocking, but no one could tell whether it loosens a check.");
  assert.deepEqual(carte()?.choix, [{ texte: "Merge", suite: "merge" }]);
});

test("what the second judge wrote is used only if it reads as plain words; otherwise fixed words say which judges it changes", (t) => {
  for (const change of [undefined, "drops `|| true` from the gates", "skips a test. Then another. And a third", "x".repeat(200)]) {
    const { juger, refuser, proposer, carte } = cuisine(t, { juges: [...WORKFLOW, ...GATES_SH] });
    juger("weakened", change);
    proposer();
    refuser();
    const vue = carte();
    assert.equal(vue?.resume, "The delivery of #17 changes the CI that checks every delivery and the gates every delivery must pass. Its review found nothing blocking, but it loosens a check, which only you can accept.", String(change));
    assert.ok(vue && validerCarte(vue).valide);
  }
});

test("touching only what the project opens up, no second judge: the card names it, and the merge is the chef's", (t) => {
  const { attend, carte } = cuisine(t, { declarations: [".claude/brigade/reseau"] });
  assert.equal(attend(), true);
  assert.equal(carte()?.resume, "The delivery of #17 changes the hosts its cooks may reach. Its review found nothing blocking, and only you can merge it.");
  assert.deepEqual(carte()?.choix, [{ texte: "Merge", suite: "merge" }]);
  assert.equal(carte()?.question, null);
});

test("touching what the project opens up and its judges: it waits for its second judge, even established not weakened — the pass never merges a declaration", (t) => {
  const { juger, attend, carte } = cuisine(t, { juges: GATES_SH, declarations: [".claude/brigade/reseau", ".claude/brigade/secrets"] });
  assert.equal(attend(), false);
  juger("not-weakened", "adds a check to the gates");
  assert.equal(attend(), true);
  assert.equal(carte()?.resume, "The delivery of #17 changes the hosts its cooks may reach, the secrets its cooks receive and how deliveries are checked: it adds a check to the gates. Its review found nothing blocking, and only you can merge it.");
});

test("stopped for its judges by a verdict that does not say so — a log from before the second judge: no second judge will judge it, it stays the chef's", (t) => {
  const { attend, carte } = cuisine(t, {});
  assert.equal(attend(), true);
  assert.equal(carte()?.resume, "The delivery of #17 changes how deliveries are checked. Its review found nothing blocking, and only you can merge it.");
  assert.deepEqual(carte()?.choix, [{ texte: "Merge", suite: "merge" }]);
});
