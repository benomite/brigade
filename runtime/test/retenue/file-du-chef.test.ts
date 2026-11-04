// La retenue branchée sur la boucle (#2281), sur l'ancien chemin : le rail se
// lit au journal. Quand elle commence, une seule ligne entre dans la file du
// chef — le bloc `awaiting` de `status`, d'où la TODO se lit —, qui nomme la
// cause et le geste ; les passes suivantes ne la doublent pas ; elle tombe
// quand la cuisine sert de nouveau.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { decrireEtat, lireEtat } from "../../src/etat.ts";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal, type Journal } from "../../src/journal.ts";
import { brancherRetenue, type Transition } from "../../src/retenue/brancher.ts";
import { retenueEnCours } from "../../src/retenue/lire.ts";
import type { CauseReveil, Runtime } from "../../src/runtime.ts";
import { jourDecale, repertoireTemporaire } from "../outils.ts";

const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const STATION = "box/claude";
const A = (hhmmss: string) => `2026-11-04T${hhmmss}.000Z`;
const pr = (ticket: number) => `https://exemple.test/pull/${ticket}`;

// Une cuisine dont le test tient l'horloge, et la retenue branchée sur un
// runtime dont le test donne les réveils.
function cuisine(t: TestContext) {
  let instant = A("00:00:00");
  const journal: Journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(instant) });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const a = (hhmmss: string) => {
    instant = A(hhmmss);
  };
  const arriver = (ticket: number) =>
    noter(
      { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-11-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}`, card: { waitsFor: [], zone: [`zone-${ticket}`], problems: [] } } },
      ticket,
      "github",
    );
  const cuisiner = (ticket: number) => {
    noter({ type: "ticket.taken", payload: { station: STATION, leaseUntil: `${jourDecale(60)}T00:00:00.000Z` } }, ticket, `station:${STATION}`);
    noter({ type: "cook.launched", payload: { run: `${ticket}-aa`, limits: LIMITES, stream: `runs/${ticket}-aa.jsonl`, branch: `cook/${ticket}-aa`, worktree: `worktrees/${ticket}-aa` } }, ticket);
    noter({ type: "cook.exited", payload: { run: `${ticket}-aa`, outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } }, ticket);
    noter({ type: "ticket.passing", payload: { station: STATION } }, ticket, `station:${STATION}`);
    noter({ type: "pass.started", payload: { run: `${ticket}-aa`, pr: pr(ticket), number: ticket, sha: `sha-${ticket}` } }, ticket, "pass");
  };
  const servir = (ticket: number) => {
    noter({ type: "merge.done", payload: { pr: pr(ticket), sha: `sha-${ticket}`, by: "pass", reconciled: false } }, ticket, "pass");
    noter({ type: "ticket.served", payload: {} }, ticket);
  };
  noter({ type: "runtime.started", payload: { pid: 1, host: "box" } } as Fait);
  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });

  const ecouteurs: Array<(cause: CauseReveil) => void> = [];
  const runtime: Runtime = { projet: "brigade", journal, surReveil: (ecouter) => (ecouteurs.push(ecouter), () => {}), arreter: () => {} };
  const transitions: Transition[] = [];
  const dites: string[] = [];
  brancherRetenue(runtime, { maintenant: () => new Date(instant), dire: (ligne) => dites.push(ligne), surTransition: (transition) => transitions.push(transition) });
  // Un réveil de la boucle, à l'heure dite.
  const passer = (hhmmss: string) => {
    a(hhmmss);
    for (const ecouter of ecouteurs) ecouter("tick");
  };
  const faits = (type: string) => journal.base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = ? ORDER BY seq", type).map(({ payload }) => JSON.parse(payload));
  // La file du chef, telle que `status` la dit : ses lignes de retenue.
  const lignesDeRetenue = () => decrireEtat(lireEtat(journal, new Date(instant)), new Date(instant)).filter((ligne) => /^ {2}kitchen {2}for /.test(ligne));
  return { noter, a, arriver, cuisiner, servir, passer, faits, lignesDeRetenue, transitions, dites, journal };
}

test("la retenue commence : une seule ligne entre dans la file du chef, avec sa cause ; les passes suivantes de la même retenue ne la doublent pas", (t) => {
  const c = cuisine(t);
  c.arriver(12);
  c.arriver(13);
  c.passer("00:29:00");
  assert.equal(c.faits("kitchen.held").length, 0);
  assert.deepEqual(c.lignesDeRetenue(), []);

  c.passer("00:30:00");
  c.passer("00:35:00");
  c.passer("01:00:00");
  const [tenue, ...autres] = c.faits("kitchen.held");
  assert.equal(autres.length, 0);
  assert.deepEqual(tenue, { since: A("00:00:00"), tickets: [12, 13], cause: { kind: "unknown" }, gesture: null, change: false });
  assert.deepEqual(c.transitions.map(({ type }) => type), ["started"]);
  assert.equal(c.dites.length, 1);

  const lignes = c.lignesDeRetenue();
  assert.equal(lignes.length, 1);
  assert.match(lignes[0] ?? "", /^ {2}kitchen {2}for 1 h 00 {2}HELD: nothing served while 2 tickets wait \(#12, #13\) — cause unknown: .* — no gesture known/);
  // Dans les faits pour l'app, la file la compte comme une décision.
  const etat = lireEtat(c.journal, new Date(A("01:00:00")));
  assert.deepEqual(etat.attend.filter(({ quoi }) => quoi === "retenue").length, 1);
});

test("la cuisine sert de nouveau : la ligne de la retenue sort de la file du chef, et la levée s'écrit une fois", (t) => {
  const c = cuisine(t);
  c.arriver(12);
  c.arriver(13);
  c.passer("00:45:00");
  assert.equal(c.lignesDeRetenue().length, 1);

  // #12 part au cook puis en pass : rien n'est servi, la retenue tient.
  c.a("00:50:00");
  c.cuisiner(12);
  c.passer("00:55:00");
  assert.equal(c.faits("kitchen.held").length, 1);
  assert.equal(c.lignesDeRetenue().length, 1);

  c.a("01:10:00");
  c.servir(12);
  c.passer("01:10:00");
  c.passer("01:15:00");
  assert.deepEqual(c.faits("kitchen.hold-lifted"), [{ since: A("00:00:00"), reason: "served" }]);
  assert.deepEqual(c.lignesDeRetenue(), []);
  assert.equal(retenueEnCours(c.journal.base), null);
  assert.deepEqual(c.transitions.map(({ type }) => type), ["started", "lifted"]);

  // 30 min plus tard sans service, #13 attendant toujours : une nouvelle retenue, comptée depuis ce service.
  c.passer("01:40:00");
  assert.equal(c.faits("kitchen.held").length, 2);
  assert.equal(retenueEnCours(c.journal.base)?.since, A("01:10:00"));
  assert.equal(c.lignesDeRetenue().length, 1);
});

test("la base rouge au journal : la ligne nomme ce qui y échoue et le geste ; une autre cause la remplace sans la doubler, et garde son début", (t) => {
  const c = cuisine(t);
  c.arriver(12);
  c.a("00:10:00");
  c.noter({ type: "base.checked", payload: { sha: "ba5e0006ffffffff", outcome: "red", gates: { outcome: "red", code: 1, failures: ["FAIL  test (windows-latest)", "FAIL  lint"], tail: "" }, tickets: [] } }, null, "pass");
  c.passer("00:31:00");
  const [rouge] = c.faits("kitchen.held");
  assert.deepEqual(rouge.cause, { kind: "base-red", sha: "ba5e0006ffffffff", checks: ["test (windows-latest)", "lint"] });
  assert.match(rouge.gesture, /fix the base by hand/);
  assert.match(c.lignesDeRetenue()[0] ?? "", /cause: the base is red on ba5e000, failing: test \(windows-latest\), lint — to lift: fix the base by hand/);

  // Le disjoncteur s'ouvre : la cause change, la ligne reste une.
  c.a("00:40:00");
  c.noter({ type: "breaker.opened", payload: { failures: 3, threshold: 3 } });
  c.passer("00:41:00");
  c.passer("00:42:00");
  const tenues = c.faits("kitchen.held");
  assert.equal(tenues.length, 2);
  assert.deepEqual([tenues[1].cause.kind, tenues[1].since, tenues[1].change], ["breaker", A("00:00:00"), true]);
  assert.match(tenues[1].gesture, /`Resume` button on the breaker line of TODO/);
  const lignes = c.lignesDeRetenue();
  assert.equal(lignes.length, 1);
  assert.match(lignes[0] ?? "", /cause: the breaker is open since \d\d:\d\d, no cook leaves — to lift: look at what fails/);
  assert.deepEqual(c.transitions.map(({ type }) => type), ["started", "changed"]);
});

test("rien n'attend la cuisine — un rail vide, un ticket qui attend le merge du chef, ou la cuisine arrêtée par le chef : aucune retenue", (t) => {
  const c = cuisine(t);
  c.passer("02:00:00");
  assert.equal(c.faits("kitchen.held").length, 0);

  // Une livraison verte que la pass laisse au chef : c'est lui qu'elle attend, pas la cuisine.
  c.arriver(12);
  c.cuisiner(12);
  c.noter({ type: "pass.held", payload: { reason: "review-required" } } as never, 12, "pass");
  c.passer("03:00:00");
  assert.equal(c.faits("kitchen.held").length, 0);

  // Un ticket prenable, mais la cuisine arrêtée par le chef : elle n'a pas à servir.
  c.arriver(13);
  c.passer("03:31:00");
  assert.equal(c.faits("kitchen.held").length, 1);
  c.noter({ type: "kitchen.stopped", payload: {} }, null, "chef");
  c.passer("03:32:00");
  assert.deepEqual(c.faits("kitchen.hold-lifted").map(({ reason }) => reason), ["stopped"]);
  assert.deepEqual(c.lignesDeRetenue(), []);
});
