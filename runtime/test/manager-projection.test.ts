// La projection du manager : son interrupteur, et où en est chaque issue qu'il
// a regardée — sa décision, ce qu'il a posé, ce qu'il a dit.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { decisionsDuManager, ecarteesDuManager, etatDuManager, issueDuManager, issuesEnAttente, manager, remiseDe, remisesEnAttente } from "../src/projections/manager.ts";
import { horloge, repertoireTemporaire, JOUR_HORLOGE } from "./outils.ts";

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
  assert.deepEqual(etatDuManager(base), { active: true, since: `${JOUR_HORLOGE}T10:00:00.000Z`, by: "chef" });

  noter({ type: "manager.disabled", payload: {} }, null, "chef");
  assert.deepEqual(etatDuManager(base), { active: false, since: `${JOUR_HORLOGE}T10:00:01.000Z`, by: "chef" });
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
    lacking: null,
    at: `${JOUR_HORLOGE}T10:00:00.000Z`,
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

test("une issue rendue par le chef ne garde rien de sa décision : seul ce que le manager y avait posé reste, le temps de le retirer", (t) => {
  const { base, noter, juger } = histoire(t);
  juger("fire");
  noter({ type: "manager.labeled", payload: { labels: ["fire", "model:sonnet"] } });
  noter({ type: "manager.set-aside", payload: { reason: "chef-changed", fired: false } });

  noter({ type: "manager.handed-back", payload: {} }, 30, "chef");

  assert.equal(issueDuManager(base, 30), null);
  assert.deepEqual(remiseDe(base, 30), { ticket: 30, at: `${JOUR_HORLOGE}T10:00:03.000Z`, labels: ["fire", "model:sonnet"] });

  noter({ type: "manager.withdrew", payload: { labels: ["model:sonnet"] } });
  assert.deepEqual(remisesEnAttente(base), [{ ticket: 30, at: `${JOUR_HORLOGE}T10:00:03.000Z`, labels: null }]);

  // Rejugée : la remise est soldée, et rien de ce qui avait été posé avant elle ne traverse.
  juger("fire", "e2");
  assert.equal(remiseDe(base, 30), null);
  assert.deepEqual(issueDuManager(base, 30)?.posed, []);
});

test("les issues écartées se lisent à part, la plus récente d'abord", (t) => {
  const { base, noter, juger } = histoire(t);
  noter({ type: "manager.set-aside", payload: { reason: "roadmap", fired: false } }, 1);
  juger("fire");
  noter({ type: "manager.set-aside", payload: { reason: "question", fired: false } }, 12);

  assert.deepEqual(ecarteesDuManager(base, 5).map((issue) => [issue.ticket, issue.reason]), [[12, "question"], [1, "roadmap"]]);
});

test("un `chef-changed` porte ce qui manquait à l'issue, et reste dit quand seul `fire` y bouge", (t) => {
  const { base, noter, juger } = histoire(t);
  juger("fire");
  noter({ type: "manager.labeled", payload: { labels: ["fire"] } });
  noter({ type: "manager.set-aside", payload: { reason: "chef-changed", fired: false, lacking: ["fire"] } });
  assert.deepEqual(issueDuManager(base, 30)?.lacking, ["fire"]);
  assert.equal(issueDuManager(base, 30)?.commented, false);
  noter({ type: "manager.commented", payload: {} });

  noter({ type: "manager.set-aside", payload: { reason: "chef-changed", fired: true, lacking: ["model:"] } });

  assert.deepEqual(issueDuManager(base, 30)?.lacking, ["model:"]);
  assert.equal(issueDuManager(base, 30)?.commented, true);

  // Un écart d'avant ce champ, ou d'un autre motif, n'en porte pas.
  noter({ type: "manager.set-aside", payload: { reason: "question", fired: true } });
  assert.equal(issueDuManager(base, 30)?.lacking, null);
  assert.equal(issueDuManager(base, 30)?.commented, false);
});

test("une issue écartée ou d'un jugement illisible attend le chef ; fermée, elle le dit, jusqu'à sa réouverture ou sa décision suivante", (t) => {
  const { base, noter, juger } = histoire(t);
  const attendues = () => issuesEnAttente(base).map(({ ticket, decision, reason, closed }) => [ticket, decision, reason, closed]);
  noter({ type: "manager.set-aside", payload: { reason: "question", fired: false } });
  noter({ type: "manager.failed", payload: { run: "juge-31-a", fingerprint: "e1", reason: "aucun objet JSON" } }, 31);
  juger("refused");
  noter({ type: "manager.set-aside", payload: { reason: "decision", fired: false } }, 32);
  // Jugée, l'issue #30 n'attend plus à ce titre.
  assert.deepEqual(attendues(), [[31, "failed", "aucun objet JSON", false], [32, "aside", "decision", false]]);

  noter({ type: "manager.closed", payload: {} }, 31);
  noter({ type: "manager.closed", payload: {} }, 32);
  assert.deepEqual(attendues().map(([ticket, , , closed]) => [ticket, closed]), [[31, true], [32, true]]);

  noter({ type: "manager.reopened", payload: {} }, 31);
  // Une décision ne se prend que sur une issue ouverte.
  noter({ type: "manager.set-aside", payload: { reason: "question", fired: false } }, 32);
  assert.deepEqual(attendues().map(([ticket, , , closed]) => [ticket, closed]), [[31, false], [32, false]]);
});
