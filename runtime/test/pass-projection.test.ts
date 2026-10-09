// La projection de la pass : où en est chaque livraison, les renvois
// consommés, et le grant `merge` avec ses usages.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { etatDeLaBase, etatDuGrant, grantActif, lirePass, mergesAVerifier, orphelines, pass, passDuTicket, renvoiEnAttente, usagesDuGrant } from "../src/projections/pass.ts";
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
    return noter({ type: "pass.judged", payload: { run, pr: PR, number: 40, sha: `sha-${run}`, verdict, gates, ci: { outcome: "none", checks: [] }, findings, judgeModified: false, review: { outcome: "skipped", run: null, summary: null, findings: [] }, noDiff: false } });
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

test("un cook relancé sur une autre branche est une livraison neuve : ni renvoi, ni PR, ni commit jugé", (t) => {
  const { base, noter, lancer, livrer, juger } = histoire(t);
  livrer("a");
  juger("a", "red", ["Gates rouges."]);
  noter({ type: "pass.returned", payload: { n: 1, findings: ["Gates rouges."] } });

  // Le worktree de la livraison a disparu : la station est repartie de la base.
  lancer("b");

  assert.equal(renvoiEnAttente(base, 17), null);
  const connu = passDuTicket(base, 17);
  assert.deepEqual([connu?.phase, connu?.branch, connu?.sha, connu?.pr, connu?.number, connu?.returns], ["cooking", "cook/b", null, null, null, 1]);
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
  // Mergée, elle ne laisse rien derrière elle.
  assert.deepEqual(orphelines(base), []);
});

test("un ticket qui quitte le rail avec une livraison non mergée la laisse orpheline, jusqu'à ce que la pass l'ait dit", (t) => {
  const { base, noter, lancer, livrer, juger } = histoire(t);
  const partir = (ticket: number, reason: "closed" | "unfired" = "closed") => noter({ type: "ticket.left", payload: { reason } }, ticket, "github");
  livrer("a");
  juger("a", "green");
  noter({ type: "pass.held", payload: { reason: "no-grant" } });
  const depart = partir(17);

  assert.deepEqual(lirePass(base), []);
  assert.deepEqual(orphelines(base), [{ ticket: 17, branch: "cook/a", pr: PR, verdict: "green", reason: "closed", seq: depart?.seq }]);

  // Livrée sans être jugée : son verdict n'est pas celui d'une autre livraison.
  noter({ type: "cook.launched", payload: { run: "b", limits: { turns: 1, durationMs: 1, tokens: 1, idleMs: 1 }, stream: "runs/b.jsonl", branch: "cook/b", worktree: "worktrees/b" } }, 18);
  noter({ type: "cook.reported", payload: { run: "b", ending: "done", reason: null, summary: null, branch: "cook/b", pr: PR } }, 18);
  partir(18, "unfired");
  assert.deepEqual(orphelines(base).map((o) => [o.ticket, o.verdict, o.reason]), [[17, "green", "closed"], [18, null, "unfired"]]);

  // Dite, elle ne l'est plus.
  noter({ type: "pass.abandoned", payload: { branch: "cook/a", pr: PR } });
  assert.deepEqual(orphelines(base).map((o) => o.ticket), [18]);

  // Un premier cook encore en cuisine n'a ni PR ni livraison : sa fin est l'affaire de la station.
  noter({ type: "pass.abandoned", payload: { branch: "cook/b", pr: null } }, 18);
  lancer("c");
  partir(17);
  assert.deepEqual(orphelines(base), []);
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

test("la relecture du reviewer se range sur la livraison sans en changer la phase ; un verdict sans diff se retient, et servi sans merge, le ticket est en phase `served`", (t) => {
  const { base, noter, livrer } = histoire(t);
  livrer("a");
  noter({ type: "pass.started", payload: { run: "a", pr: null, number: null, sha: "sha-a" } });
  const findings = [{ severity: "remark" as const, file: null, text: "Une source manque." }];
  noter({ type: "pass.reviewed", payload: { run: "a", sha: "sha-a", review: "review-17-x", outcome: "green", summary: "L'audit répond.", findings, reason: null, truncated: false } });

  assert.deepEqual([passDuTicket(base, 17)?.phase, passDuTicket(base, 17)?.noDiff], ["judging", false]);
  assert.deepEqual(passDuTicket(base, 17)?.review, { cook: "a", sha: "sha-a", run: "review-17-x", outcome: "green", summary: "L'audit répond.", findings, reason: null });

  const skipped = { outcome: "skipped" as const, code: null, failures: [], tail: "" };
  const review = { outcome: "green" as const, run: "review-17-x", summary: "L'audit répond.", findings };
  noter({ type: "pass.judged", payload: { run: "a", pr: null, number: null, sha: "sha-a", verdict: "green", gates: skipped, ci: { outcome: "skipped", checks: [] }, review, findings: [], judgeModified: false, noDiff: true } });
  assert.deepEqual([passDuTicket(base, 17)?.phase, passDuTicket(base, 17)?.noDiff, passDuTicket(base, 17)?.number], ["green", true, null]);

  noter({ type: "pass.served", payload: { verdict: 1 } });
  assert.equal(passDuTicket(base, 17)?.phase, "served");

  // Une relecture illisible se retient aussi : elle ne se refait pas.
  noter({ type: "pass.reviewed", payload: { run: "a", sha: "sha-a", review: "review-17-y", outcome: "unreadable", summary: null, findings: [], reason: "aucune réponse", truncated: false } });
  assert.deepEqual([passDuTicket(base, 17)?.review?.outcome, passDuTicket(base, 17)?.review?.reason, passDuTicket(base, 17)?.phase], ["unreadable", "aucune réponse", "served"]);
});

test("la base qui avance sous une livraison verte : sans rejeu, son merge reste à vérifier ; rejouée verte, elle tient sur cette base-là ; rejouée rouge, le verdict tombe", (t) => {
  const { base, noter, livrer, juger } = histoire(t);
  const connu = () => passDuTicket(base, 17);
  const vu = { sha: "sha-a", base: "base-2", from: "base-1", behind: 1 };
  const gates = (outcome: "green" | "red") => ({ outcome, code: outcome === "green" ? 0 : 1, failures: [], tail: "" });
  livrer("a");
  juger("a", "green");

  noter({ type: "pass.base-moved", payload: { ...vu, overlap: ["a.ts"], replay: true } });
  assert.deepEqual([connu()?.phase, connu()?.movedBase, connu()?.checkedBase], ["replaying", "base-2", null]);
  noter({ type: "pass.replayed", payload: { sha: "sha-a", base: "base-2", gates: gates("green"), findings: [] } });
  assert.deepEqual([connu()?.phase, connu()?.verdict, connu()?.checkedBase], ["green", "green", "base-2"]);
  // Mergée après un rejeu vert, elle n'a rien à faire vérifier.
  assert.equal(connu()?.unverified, false);
  noter({ type: "merge.done", payload: { pr: PR, sha: "sha-a", by: "pass", reconciled: false, unverified: false } });
  assert.deepEqual(mergesAVerifier(base), []);

  livrer("b");
  juger("b", "green");
  // Un verdict neuf ne garde rien de ce qui valait pour le précédent.
  assert.deepEqual([connu()?.movedBase, connu()?.checkedBase], [null, null]);
  noter({ type: "pass.base-moved", payload: { ...vu, sha: "sha-b", overlap: ["a.ts"], replay: true } });
  noter({ type: "pass.replayed", payload: { sha: "sha-b", base: "base-2", gates: gates("red"), findings: ["Rencontre avec `v2`."] } });
  assert.deepEqual([connu()?.phase, connu()?.verdict, connu()?.findings], ["red", "red", ["Rencontre avec `v2`."]]);

  livrer("c");
  juger("c", "green");
  noter({ type: "pass.base-moved", payload: { ...vu, sha: "sha-c", overlap: [], replay: false } });
  // C'est la livraison qui retient que son merge sera à vérifier : la pass le lit, même après un redémarrage.
  assert.deepEqual([connu()?.phase, connu()?.movedBase, connu()?.unverified], ["green", "base-2", true]);
  noter({ type: "merge.done", payload: { pr: PR, sha: "sha-c", by: "pass", reconciled: true, unverified: true } });
  assert.deepEqual([mergesAVerifier(base), connu()?.unverified], [[17], false]);
});

test("un merge fait hors du runtime est à vérifier sur la base ; le contrôle dit ce qu'elle vaut et ce qu'il vérifiait", (t) => {
  const { base, noter, livrer, juger } = histoire(t);
  const gates = { outcome: "red" as const, code: 1, failures: ["FAIL  tests"], tail: "" };
  assert.equal(etatDeLaBase(base), null);
  livrer("a");
  juger("a", "green");
  noter({ type: "pass.held", payload: { reason: "no-grant" } });
  // Un merge d'avant ce contrôle ne dit pas s'il est à vérifier : il ne l'est
  // pas — un journal ancien, rejoué, ne réveille aucun de ses vieux merges.
  noter({ type: "merge.done", payload: { pr: PR, sha: "sha-y", by: "outside", reconciled: false } }, 16);
  assert.deepEqual(mergesAVerifier(base), []);
  noter({ type: "merge.done", payload: { pr: PR, sha: "sha-a", by: "outside", reconciled: false, unverified: true } });
  assert.deepEqual(mergesAVerifier(base), [17]);

  // Un merge arrivé pendant le contrôle n'est pas couvert par lui.
  noter({ type: "merge.done", payload: { pr: PR, sha: "sha-z", by: "outside", reconciled: false, unverified: true } }, 18);
  noter({ type: "base.checked", payload: { sha: "base-3", outcome: "red", gates, tickets: [17] } }, null);

  assert.deepEqual(etatDeLaBase(base), { sha: "base-3", outcome: "red", at: "2026-10-08T10:00:08.000Z", tickets: [17] });
  assert.deepEqual(mergesAVerifier(base), [18]);
  noter({ type: "base.checked", payload: { sha: "base-4", outcome: "green", gates: { ...gates, outcome: "green", code: 0, failures: [] }, tickets: [18] } }, null);
  assert.deepEqual([etatDeLaBase(base)?.outcome, etatDeLaBase(base)?.sha, mergesAVerifier(base)], ["green", "base-4", []]);
});

test("une livraison verte qui attend dit ce qu'elle attend ; un refus pour branche en retard rend le verdict rouge", (t) => {
  const { base, noter, livrer, juger } = histoire(t);
  livrer("a");
  juger("a", "green");
  noter({ type: "pass.waiting", payload: { reason: "base-red" } });
  assert.deepEqual([passDuTicket(base, 17)?.phase, passDuTicket(base, 17)?.reason, passDuTicket(base, 17)?.verdict], ["waiting", "base-red", "green"]);

  noter({ type: "pass.outdated", payload: { sha: "sha-a", findings: ["Branche en retard sur `v2`."] } });
  assert.deepEqual([passDuTicket(base, 17)?.phase, passDuTicket(base, 17)?.reason, passDuTicket(base, 17)?.verdict, passDuTicket(base, 17)?.findings], ["red", null, "red", ["Branche en retard sur `v2`."]]);
});
