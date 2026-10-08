// La projection de la pass : où en est chaque livraison, les renvois
// consommés, et le grant `merge` avec ses usages.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { etatDuGrant, grantActif, lirePass, pass, passDuTicket, renvoiEnAttente, usagesDuGrant } from "../src/projections/pass.ts";
import { horloge, repertoireTemporaire } from "./outils.ts";

const PR = "https://github.com/o/r/pull/40";

function histoire(t: TestContext) {
  // La pass seule : ce que les autres projections font des mêmes faits se
  // teste chez elles.
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge(), projections: [pass] });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = 17, author = "pass") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const lancer = (run: string, branche = run) =>
    noter({ type: "cook.launched", payload: { run, limits: { turns: 1, durationMs: 1, tokens: 1, idleMs: 1 }, stream: `runs/${run}.jsonl`, branch: `cook/${branche}`, worktree: `worktrees/${branche}` } });
  const livrer = (run: string, branche = run) => {
    lancer(run, branche);
    noter({ type: "cook.reported", payload: { run, ending: "done", reason: null, summary: null, branch: `cook/${branche}`, pr: PR } });
  };
  const juger = (run: string, verdict: "green" | "red", findings: string[] = []) => {
    noter({ type: "pass.started", payload: { run, pr: PR, number: 40, sha: `sha-${run}` } });
    const gates = { outcome: verdict, code: 0, failures: [], tail: "" };
    return noter({ type: "pass.judged", payload: { run, pr: PR, number: 40, sha: `sha-${run}`, verdict, gates, ci: { outcome: "none", checks: [] }, findings, judgeModified: false } });
  };
  return { journal, base: journal.base, noter, lancer, livrer, juger };
}

test("sans fait, il n'y a pas de grant ; activé puis révoqué, il dit depuis quand et par qui", (t) => {
  const { base, noter } = histoire(t);
  assert.equal(etatDuGrant(base, "merge"), null);
  assert.equal(grantActif(base, "merge"), false);

  noter({ type: "grant.activated", payload: { action: "merge" } }, null, "chef");
  assert.deepEqual(etatDuGrant(base, "merge"), { action: "merge", active: true, since: "2026-10-08T10:00:00.000Z", by: "chef" });
  assert.equal(grantActif(base, "merge"), true);

  noter({ type: "grant.revoked", payload: { action: "merge" } }, null, "chef");
  assert.deepEqual(etatDuGrant(base, "merge"), { action: "merge", active: false, since: "2026-10-08T10:00:01.000Z", by: "chef" });
});

test("une livraison suit ses phases : cuisinée, livrée, jugée, mergée", (t) => {
  const { base, noter, lancer, livrer, juger } = histoire(t);
  const phase = () => passDuTicket(base, 17)?.phase;

  lancer("a");
  assert.equal(phase(), "cooking");
  livrer("a");
  assert.deepEqual([phase(), passDuTicket(base, 17)?.pr], ["delivered", PR]);
  noter({ type: "pass.started", payload: { run: "a", pr: PR, number: 40, sha: "sha-a" } });
  assert.deepEqual([phase(), passDuTicket(base, 17)?.startedAt], ["judging", "2026-10-08T10:00:03.000Z"]);
  const verdict = juger("a", "green");
  // L'attente de la CI se compte depuis le premier jugement de la livraison.
  assert.deepEqual([phase(), passDuTicket(base, 17)?.startedAt, passDuTicket(base, 17)?.verdictSeq], ["green", "2026-10-08T10:00:03.000Z", verdict?.seq]);
  noter({ type: "grant.used", payload: { action: "merge", pr: PR, number: 40, sha: "sha-a", base: "v2", verdict: verdict?.seq ?? 0 } });
  assert.equal(phase(), "merging");
  assert.deepEqual(usagesDuGrant(base, 10).map((u) => [u.ticket, u.pr, u.sha, u.base, u.verdict, u.outcome]), [[17, PR, "sha-a", "v2", verdict?.seq, null]]);
  noter({ type: "merge.done", payload: { pr: PR, sha: "sha-a", by: "pass", reconciled: false } });
  assert.equal(phase(), "merged");
  assert.equal(usagesDuGrant(base, 10)[0]?.outcome, "done");
});

test("un merge qui échoue rend la décision à reprendre, et l'usage du grant garde sa trace", (t) => {
  const { base, noter, livrer, juger } = histoire(t);
  livrer("a");
  const verdict = juger("a", "green");
  const intention = { type: "grant.used", payload: { action: "merge", pr: PR, number: 40, sha: "sha-a", base: "v2", verdict: verdict?.seq ?? 0 } } as const;
  noter(intention);
  noter({ type: "merge.failed", payload: { pr: PR, sha: "sha-a", reason: "interrupted" } });

  assert.equal(passDuTicket(base, 17)?.phase, "green");

  noter(intention);
  noter({ type: "merge.done", payload: { pr: PR, sha: "sha-a", by: "pass", reconciled: true } });
  assert.deepEqual(usagesDuGrant(base, 10).map((u) => u.outcome), ["done", "failed"]);
});

test("un renvoi se compte, garde ses findings, et attend tant qu'aucun cook n'a livré", (t) => {
  const { base, noter, lancer, livrer, juger } = histoire(t);
  livrer("a");
  juger("a", "red", ["Gates rouges."]);
  assert.equal(renvoiEnAttente(base, 17), null);
  noter({ type: "pass.returned", payload: { n: 1, findings: ["Gates rouges."] } });

  const renvoi = renvoiEnAttente(base, 17);
  assert.deepEqual([renvoi?.returns, renvoi?.findings, renvoi?.branch, renvoi?.worktree, renvoi?.pr, renvoi?.sha], [1, ["Gates rouges."], "cook/a", "worktrees/a", PR, "sha-a"]);

  // Le cook de renvoi part, sur la même branche : s'il échoue, le renvoi reste à faire.
  lancer("b", "a");
  assert.deepEqual([renvoiEnAttente(base, 17)?.run, renvoiEnAttente(base, 17)?.pr], ["b", PR]);

  livrer("b", "a");
  assert.equal(renvoiEnAttente(base, 17), null);
  assert.deepEqual([passDuTicket(base, 17)?.phase, passDuTicket(base, 17)?.returns, passDuTicket(base, 17)?.startedAt], ["delivered", 1, null]);
});

test("une pass arrêtée ou remontée dit pourquoi", (t) => {
  const { base, noter, livrer, juger } = histoire(t);
  livrer("a");
  juger("a", "green");
  noter({ type: "pass.held", payload: { reason: "no-grant" } });
  assert.deepEqual([passDuTicket(base, 17)?.phase, passDuTicket(base, 17)?.reason], ["held", "no-grant"]);

  noter({ type: "pass.escalated", payload: { reason: "ci-silent" } });
  assert.deepEqual([passDuTicket(base, 17)?.phase, passDuTicket(base, 17)?.reason], ["escalated", "ci-silent"]);
});

test("un ticket qui quitte le rail emporte sa pass ; les usages du grant restent", (t) => {
  const { base, noter, livrer, juger } = histoire(t);
  livrer("a");
  const verdict = juger("a", "green");
  noter({ type: "grant.used", payload: { action: "merge", pr: PR, number: 40, sha: "sha-a", base: "v2", verdict: verdict?.seq ?? 0 } });
  noter({ type: "merge.done", payload: { pr: PR, sha: "sha-a", by: "pass", reconciled: false } });

  noter({ type: "ticket.left", payload: { reason: "closed" } }, 17, "github");

  assert.deepEqual(lirePass(base), []);
  assert.equal(usagesDuGrant(base, 10).length, 1);
});

test("des faits illisibles n'empêchent pas le journal de se rejouer", (t) => {
  const { journal, base, noter } = histoire(t);
  const illisible = (type: string, payload: unknown, ticket: number | null = 17) => noter({ type, payload } as unknown as Fait, ticket);
  illisible("grant.activated", {});
  illisible("cook.launched", { run: 3 });
  illisible("pass.judged", { verdict: 12 }, null);
  illisible("grant.used", { action: "merge" });
  illisible("pass.returned", { n: "deux", findings: "aucun" });

  journal.reconstruire();

  assert.deepEqual([etatDuGrant(base, "merge"), lirePass(base), usagesDuGrant(base, 10)], [null, [], []]);
});
