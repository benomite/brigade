// La projection du manager : son interrupteur, et où en est chaque issue qu'il
// a regardée — sa décision, ce qu'il a posé, ce qu'il a dit.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { decisionsDuManager, etatDuManager, issueDuManager, manager } from "../src/projections/manager.ts";
import { horloge, repertoireTemporaire } from "./outils.ts";

function histoire(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge(), projections: [manager] });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = 30, author = "manager") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const juger = (verdict: "fire" | "refused", fingerprint = "e1") =>
    noter({
      type: "manager.judged",
      payload:
        verdict === "fire"
          ? { run: "juge-30-a", fingerprint, verdict, kind: "ticket", reason: "Un livrable, des critères vérifiables.", missing: null, model: "sonnet", effort: "low", calibration: "Correctif mécanique." }
          : { run: "juge-30-a", fingerprint, verdict, kind: "epic", reason: "Plusieurs livrables.", missing: "La découper.", model: null, effort: null, calibration: null },
    });
  return { journal, base: journal.base, noter, juger };
}

test("sans fait, le manager est éteint ; allumé puis éteint, il dit depuis quand et par qui", (t) => {
  const { base, noter } = histoire(t);
  assert.equal(etatDuManager(base), null);

  noter({ type: "manager.enabled", payload: {} }, null, "chef");
  assert.deepEqual(etatDuManager(base), { active: true, since: "2026-10-08T10:00:00.000Z", by: "chef" });

  noter({ type: "manager.disabled", payload: {} }, null, "chef");
  assert.deepEqual(etatDuManager(base), { active: false, since: "2026-10-08T10:00:01.000Z", by: "chef" });
});

test("une issue jugée exécutable porte sa décision, puis ce que le manager y a posé et dit", (t) => {
  const { base, noter, juger } = histoire(t);
  assert.equal(issueDuManager(base, 30), null);

  juger("fire");
  assert.deepEqual(issueDuManager(base, 30), {
    ticket: 30,
    decision: "fire",
    fingerprint: "e1",
    kind: "ticket",
    reason: "Un livrable, des critères vérifiables.",
    missing: null,
    model: "sonnet",
    effort: "low",
    calibration: "Correctif mécanique.",
    run: "juge-30-a",
    fired: false,
    at: "2026-10-08T10:00:00.000Z",
    labels: null,
    commented: false,
    posed: [],
  });

  noter({ type: "manager.labeled", payload: { labels: ["fire", "model:sonnet", "effort:low"] } });
  noter({ type: "manager.commented", payload: {} });
  const issue = issueDuManager(base, 30);
  assert.deepEqual(issue?.labels, ["fire", "model:sonnet", "effort:low"]);
  assert.deepEqual(issue?.posed, ["fire", "model:sonnet", "effort:low"]);
  assert.equal(issue?.commented, true);
});

test("une décision neuve repart de zéro, mais le manager se souvient de ce qu'il a posé", (t) => {
  const { base, noter, juger } = histoire(t);
  juger("fire");
  noter({ type: "manager.labeled", payload: { labels: ["fire"] } });
  noter({ type: "manager.commented", payload: {} });

  noter({ type: "manager.set-aside", payload: { reason: "chef-changed", fired: false } });

  const issue = issueDuManager(base, 30);
  assert.equal(issue?.decision, "aside");
  assert.equal(issue?.reason, "chef-changed");
  assert.equal(issue?.fingerprint, null);
  assert.equal(issue?.model, null);
  assert.equal(issue?.labels, null);
  assert.equal(issue?.commented, false);
  assert.deepEqual(issue?.posed, ["fire"]);
});

test("un refus et un jugement illisible gardent leur motif et l'état jugé", (t) => {
  const { base, noter, juger } = histoire(t);

  juger("refused", "e2");
  assert.deepEqual(
    (({ decision, kind, missing, fingerprint }) => ({ decision, kind, missing, fingerprint }))(issueDuManager(base, 30)!),
    { decision: "refused", kind: "epic", missing: "La découper.", fingerprint: "e2" },
  );

  noter({ type: "manager.failed", payload: { run: "juge-30-b", fingerprint: "e3", reason: "réponse illisible" } });
  assert.deepEqual(
    (({ decision, reason, run, fingerprint }) => ({ decision, reason, run, fingerprint }))(issueDuManager(base, 30)!),
    { decision: "failed", reason: "réponse illisible", run: "juge-30-b", fingerprint: "e3" },
  );
});

test("une issue écartée alors qu'elle porte `fire` le dit", (t) => {
  const { base, noter } = histoire(t);
  noter({ type: "manager.set-aside", payload: { reason: "epic", fired: true } });
  assert.equal(issueDuManager(base, 30)?.fired, true);
});

test("les dernières décisions se lisent de la plus récente à la plus ancienne", (t) => {
  const { base, noter, juger } = histoire(t);
  juger("fire");
  noter({ type: "manager.set-aside", payload: { reason: "roadmap", fired: false } }, 1);
  noter({ type: "manager.set-aside", payload: { reason: "question", fired: false } }, 12);

  assert.deepEqual(decisionsDuManager(base, 2).map((issue) => issue.ticket), [12, 1]);
});

test("rejouer le journal rend le même état", (t) => {
  const { journal, base, noter, juger } = histoire(t);
  noter({ type: "manager.enabled", payload: {} }, null, "chef");
  juger("fire");
  noter({ type: "manager.labeled", payload: { labels: ["fire"] } });
  const avant = [etatDuManager(base), issueDuManager(base, 30)];

  journal.reconstruire();

  assert.deepEqual([etatDuManager(base), issueDuManager(base, 30)], avant);
});
