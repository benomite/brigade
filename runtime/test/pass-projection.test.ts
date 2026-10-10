// La projection de la pass : où en est chaque livraison, les renvois
// consommés, et le grant `merge` avec ses usages.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { motifDArret, motifDeRemontee } from "../src/evenements/pass.ts";
import { controleRetenu, etatDeLaBase, etatDuGrant, lirePass, mergesAVerifier, orphelines, pass, passDuTicket, renvoiEnAttente, usagesDuGrant } from "../src/projections/pass.ts";
import { horloge, repertoireTemporaire, JOUR_HORLOGE } from "./outils.ts";

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
  const lu = () => {
    const grant = etatDuGrant(base, "merge", new Date());
    return grant && [grant.active, grant.since, grant.by, grant.ended];
  };
  assert.equal(lu(), null);
  assert.equal(etatDuGrant(base, "merge", new Date())?.active ?? false, false);

  noter({ type: "grant.activated", payload: { action: "merge" } }, null, "chef");
  assert.deepEqual(lu(), [true, `${JOUR_HORLOGE}T10:00:00.000Z`, "chef", null]);
  assert.equal(etatDuGrant(base, "merge", new Date())?.active ?? false, true);

  noter({ type: "grant.revoked", payload: { action: "merge" } }, null, "chef");
  assert.deepEqual(lu(), [false, `${JOUR_HORLOGE}T10:00:01.000Z`, "chef", "revoked"]);
});

test("une livraison suit ses phases : cuisinée, livrée, jugée, mergée", (t) => {
  const { base, noter, lancer, livrer, juger } = histoire(t);
  const phase = () => passDuTicket(base, 17)?.phase;

  lancer("a");
  assert.equal(phase(), "cooking");
  livrer("a");
  assert.deepEqual([phase(), passDuTicket(base, 17)?.pr], ["delivered", PR]);
  noter({ type: "pass.started", payload: { run: "a", pr: PR, number: 40, sha: "sha-a" } });
  assert.deepEqual([phase(), passDuTicket(base, 17)?.startedAt], ["judging", `${JOUR_HORLOGE}T10:00:03.000Z`]);
  const verdict = juger("a", "green");
  // L'attente de la CI se compte depuis le premier jugement de la livraison.
  assert.deepEqual([phase(), passDuTicket(base, 17)?.startedAt, passDuTicket(base, 17)?.verdictSeq], ["green", `${JOUR_HORLOGE}T10:00:03.000Z`, verdict?.seq]);
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

test("un verdict porte les déclarations du projet que la livraison touche ; un verdict qui n'en dit rien n'en porte aucune", (t) => {
  const { base, noter, livrer, juger } = histoire(t);
  livrer("a");
  // Tel qu'écrit avant que la pass ne les regarde.
  juger("a", "green");
  assert.deepEqual(passDuTicket(base, 17)?.declarations, []);

  const gates = { outcome: "green" as const, code: 0, failures: [], tail: "" };
  const review = { outcome: "skipped" as const, run: null, summary: null, findings: [] };
  noter({ type: "pass.judged", payload: { run: "a", pr: PR, number: 40, sha: "sha-a", verdict: "green", gates, ci: { outcome: "none", checks: [] }, findings: [], judgeModified: false, declarations: [".claude/brigade/reseau"], review, noDiff: false } });
  assert.deepEqual(passDuTicket(base, 17)?.declarations, [".claude/brigade/reseau"]);

  // Le verdict suivant ne garde rien du précédent.
  juger("a", "green");
  assert.deepEqual(passDuTicket(base, 17)?.declarations, []);
});

test("l'essai à blanc d'un journal d'avant, quand il était un fait à lui, se relit sans rien changer : ni la phase de la livraison, ni le grant, ni ses usages", (t) => {
  const { base, noter, livrer, juger } = histoire(t);
  livrer("a");
  juger("a", "green");
  const lire = () => [passDuTicket(base, 17), etatDuGrant(base, "merge", new Date()), usagesDuGrant(base, 10)];
  const avant = lire();

  noter({ type: "pass.rehearsed", payload: { action: "merge", pr: PR, number: 40, sha: "sha-a", branch: "cook/a", base: "v2", verdict: 3, outcome: "merge", head: "base-1", behind: 0, reason: null } });

  assert.deepEqual(lire(), avant);
  assert.equal(passDuTicket(base, 17)?.phase, "green");
});

test("une pass arrêtée ou remontée dit pourquoi", (t) => {
  const { base, noter, livrer, juger } = histoire(t);
  livrer("a");
  juger("a", "green");
  noter({ type: "pass.held", payload: { reason: "no-grant" } });
  assert.deepEqual([passDuTicket(base, 17)?.phase, passDuTicket(base, 17)?.reason], ["held", "no-grant"]);

  noter({ type: "pass.escalated", payload: { reason: "unjudged", cause: "ci-silent" } });
  assert.deepEqual([passDuTicket(base, 17)?.phase, passDuTicket(base, 17)?.reason, passDuTicket(base, 17)?.cause], ["escalated", "unjudged", "ci-silent"]);
});

// Un motif par geste du chef : trois pour une livraison verte arrêtée, trois
// pour une remontée. Ce qui les précise est en `cause`.
const ARRETS_D_AVANT = [
  ["no-grant", "no-grant", null],
  ["judge-modified", "review-required", "judge-modified"],
  ["declaration-modified: .claude/brigade/reseau", "review-required", "declaration-modified: .claude/brigade/reseau"],
  ["merge-refused: HTTP 405", "merge-refused", "HTTP 405"],
] as const;
const REMONTEES_D_AVANT = [
  ["returns-exhausted", "still-red"],
  ["manager-escalated", "still-red"],
  ["wrong-base", "unjudged"],
  ["no-gates", "unjudged"],
  ["worktree-lost", "unjudged"],
  ["ci-silent", "unjudged"],
  ["review-unreadable", "unjudged"],
  ["review-unsendable", "unjudged"],
  ["review-refused", "unjudged"],
  ["secrets-unavailable", "unjudged"],
  ["manager-split", "manager-split"],
] as const;

test("un journal écrit avant le regroupement des motifs se relit : chaque ancien nom donne le motif de son geste, et reste lisible en cause", (t) => {
  const { base, noter, livrer, juger } = histoire(t);
  livrer("a");
  juger("a", "green");
  const lue = () => [passDuTicket(base, 17)?.phase, passDuTicket(base, 17)?.reason, passDuTicket(base, 17)?.cause];

  for (const [avant, motif, cause] of ARRETS_D_AVANT) {
    assert.deepEqual(motifDArret({ reason: avant }), { reason: motif, cause });
    noter({ type: "pass.held", payload: { reason: avant } } as never);
    assert.deepEqual(lue(), ["held", motif, cause]);
  }
  for (const [avant, motif] of REMONTEES_D_AVANT) {
    const cause = avant === motif ? null : avant;
    assert.deepEqual(motifDeRemontee({ reason: avant }), { reason: motif, cause });
    noter({ type: "pass.escalated", payload: { reason: avant } } as never);
    assert.deepEqual(lue(), ["escalated", motif, cause]);
  }
  // Les motifs qui restent : pas plus de noms que de gestes.
  assert.deepEqual([...new Set(ARRETS_D_AVANT.map(([, motif]) => motif))], ["no-grant", "review-required", "merge-refused"]);
  assert.deepEqual([...new Set(REMONTEES_D_AVANT.map(([, motif]) => motif))], ["still-red", "unjudged", "manager-split"]);
  // Écrit d'aujourd'hui, un motif se relit tel quel, et sa cause avec lui.
  assert.deepEqual(motifDeRemontee({ reason: "unjudged", cause: "ci-silent" }), { reason: "unjudged", cause: "ci-silent" });
  assert.deepEqual(motifDArret({ reason: "review-required", cause: "judge-modified" }), { reason: "review-required", cause: "judge-modified" });
});

test("une livraison qui repart ne garde pas la cause de son arrêt", (t) => {
  const { base, noter, livrer, juger } = histoire(t);
  livrer("a");
  juger("a", "green");
  noter({ type: "pass.held", payload: { reason: "merge-refused", cause: "HTTP 405" } });
  noter({ type: "merge.done", payload: { pr: PR, sha: "sha-a", by: "outside", reconciled: false } });

  assert.deepEqual([passDuTicket(base, 17)?.phase, passDuTicket(base, 17)?.reason, passDuTicket(base, 17)?.cause], ["merged", null, null]);
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

  // Revenu puis reparti avant que la pass ait rien dit : chaque livraison a sa branche, et sa PR à dire.
  livrer("d");
  partir(17);
  livrer("e");
  partir(17, "unfired");
  assert.deepEqual(orphelines(base).map((o) => [o.ticket, o.branch, o.reason]), [[17, "cook/d", "closed"], [17, "cook/e", "unfired"]]);
  noter({ type: "pass.abandoned", payload: { branch: "cook/d", pr: PR } });
  assert.deepEqual(orphelines(base).map((o) => o.branch), ["cook/e"]);
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

  assert.deepEqual([etatDuGrant(base, "merge", new Date()), lirePass(base), usagesDuGrant(base, 10)], [null, [], []]);
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

test("un verdict retient ce sur quoi il porte — le commit, la tête de la base, l'arbre de leur fusion — et rien n'en reste sur un autre commit", (t) => {
  const { base, noter, livrer } = histoire(t);
  const connu = () => passDuTicket(base, 17);
  const porte = () => [connu()?.phase, connu()?.sha, connu()?.judgedBase, connu()?.judgedTree];
  const gates = { outcome: "green" as const, code: 0, failures: [], tail: "" };
  const verdict = (sha: string, sur: { base?: string; merged?: string | null }) => {
    noter({ type: "pass.started", payload: { run: "a", pr: PR, number: 40, sha } });
    noter({ type: "pass.judged", payload: { run: "a", pr: PR, number: 40, sha, ...sur, verdict: "green", gates, ci: { outcome: "none", checks: [] }, findings: [], judgeModified: false, review: { outcome: "skipped", run: null, summary: null, findings: [] }, noDiff: false } });
  };
  livrer("a");

  verdict("sha-a", { base: "base-1", merged: "arbre-1" });
  assert.deepEqual(porte(), ["green", "sha-a", "base-1", "arbre-1"]);
  // Rejugée parce que la base a bougé : le même commit, une autre fusion.
  noter({ type: "pass.started", payload: { run: "a", pr: PR, number: 40, sha: "sha-a" } });
  assert.deepEqual(porte(), ["judging", "sha-a", "base-1", "arbre-1"]);
  verdict("sha-a", { base: "base-2", merged: "arbre-2" });
  assert.deepEqual(porte(), ["green", "sha-a", "base-2", "arbre-2"]);
  // Elle attend — la base est rouge — sans rien perdre de son verdict.
  noter({ type: "pass.waiting", payload: { reason: "base-red" } });
  assert.deepEqual([...porte(), connu()?.reason], ["waiting", "sha-a", "base-2", "arbre-2", "base-red"]);

  // Sur un autre commit, la base du dernier verdict ne dit plus rien.
  noter({ type: "pass.started", payload: { run: "a", pr: PR, number: 40, sha: "sha-b" } });
  assert.deepEqual(porte(), ["judging", "sha-b", null, null]);
  // Une fusion qui ne se fait pas n'a pas d'arbre ; un verdict d'avant, rendu sur la branche seule, ne porte ni l'un ni l'autre.
  verdict("sha-b", { base: "base-2", merged: null });
  assert.deepEqual(porte(), ["green", "sha-b", "base-2", null]);
  verdict("sha-b", {});
  assert.deepEqual(porte(), ["green", "sha-b", null, null]);
});

test("un journal d'avant se rejoue : ce que la pass écrivait de la rencontre d'une branche avec la base ne change plus l'état d'aucune livraison", (t) => {
  const { base, noter, livrer, juger } = histoire(t);
  const gates = { outcome: "red" as const, code: 1, failures: [], tail: "" };
  livrer("a");
  juger("a", "green");
  const avant = passDuTicket(base, 17);

  noter({ type: "pass.base-moved", payload: { sha: "sha-a", base: "base-2", from: "base-1", behind: 1, overlap: ["a.ts"], replay: true } });
  noter({ type: "pass.replayed", payload: { sha: "sha-a", base: "base-2", gates, findings: ["Rencontre avec `v2`."] } });

  assert.deepEqual(passDuTicket(base, 17), avant);
  // Le merge fait par la pass d'alors sans rejeu reste à vérifier : c'est son fait qui le dit.
  noter({ type: "merge.done", payload: { pr: PR, sha: "sha-a", by: "pass", reconciled: true, unverified: true } });
  assert.deepEqual(mergesAVerifier(base), [17]);
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

  assert.deepEqual(etatDeLaBase(base), { sha: "base-3", outcome: "red", at: `${JOUR_HORLOGE}T10:00:08.000Z`, tickets: [17], redSince: `${JOUR_HORLOGE}T10:00:08.000Z`, unplayed: null, reason: null, recheck: null });
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

const ROUGES = { outcome: "red" as const, code: 1, failures: ["FAIL  tests"], tail: "" };
const VERTES = { outcome: "green" as const, code: 0, failures: [], tail: "" };
const NON_JOUEES = { outcome: "skipped" as const, code: null, failures: [], tail: "" };

test("un contrôle non joué ne lève pas un rouge constaté : la base reste rouge, sur le commit où elle l'a été vue, et dit ce qui n'a pas pu être vérifié ; seul un contrôle joué et vert le lève", (t) => {
  const { base, noter } = histoire(t);
  const rouge = noter({ type: "base.checked", payload: { sha: "base-1", outcome: "red", gates: ROUGES, tickets: [17] } }, null);
  noter({ type: "merge.done", payload: { pr: PR, sha: "sha-b", by: "outside", reconciled: false, unverified: true } }, 18);

  const nonJoue = noter({ type: "base.checked", payload: { sha: "base-2", outcome: "skipped", gates: NON_JOUEES, tickets: [18], reason: "git worktree : fatal" } }, null);

  assert.deepEqual(etatDeLaBase(base), { sha: "base-1", outcome: "red", at: rouge?.at, tickets: [17], redSince: rouge?.at, unplayed: { sha: "base-2", at: nonJoue?.at }, reason: "git worktree : fatal", recheck: null });
  // Le contrôle a eu lieu : ce merge n'est plus à vérifier, la pass ne le rejoue pas à chaque passe.
  assert.deepEqual(mergesAVerifier(base), []);

  // Rouge de nouveau, sur un autre commit : le rouge dure depuis le premier.
  const encore = noter({ type: "base.checked", payload: { sha: "base-3", outcome: "red", gates: ROUGES, tickets: [] } }, null);
  assert.deepEqual(etatDeLaBase(base), { sha: "base-3", outcome: "red", at: encore?.at, tickets: [17], redSince: rouge?.at, unplayed: null, reason: null, recheck: null });

  // Un contrôle rouge qui apporte un merge l'ajoute, sans doublon.
  const apporte = noter({ type: "base.checked", payload: { sha: "base-3b", outcome: "red", gates: ROUGES, tickets: [18, 17] } }, null);
  assert.deepEqual(etatDeLaBase(base)?.tickets, [17, 18]);
  assert.equal(etatDeLaBase(base)?.at, apporte?.at);

  const vert = noter({ type: "base.checked", payload: { sha: "base-4", outcome: "green", gates: VERTES, tickets: [] } }, null);
  assert.deepEqual(etatDeLaBase(base), { sha: "base-4", outcome: "green", at: vert?.at, tickets: [], redSince: null, unplayed: null, reason: null, recheck: null });
});

test("une base jamais vue rouge : un contrôle non joué n'y est pas un rouge", (t) => {
  const { base, noter } = histoire(t);
  const nonJoue = noter({ type: "base.checked", payload: { sha: "base-1", outcome: "skipped", gates: NON_JOUEES, tickets: [] } }, null);
  assert.deepEqual(etatDeLaBase(base), { sha: "base-1", outcome: "skipped", at: nonJoue?.at, tickets: [], redSince: null, unplayed: null, reason: null, recheck: null });

  // Verte puis non jouée : pas davantage. L'essai qui ne s'est pas fait garde son motif.
  noter({ type: "base.checked", payload: { sha: "base-2", outcome: "green", gates: VERTES, tickets: [] } }, null);
  noter({ type: "base.checked", payload: { sha: "base-3", outcome: "skipped", gates: NON_JOUEES, tickets: [], reason: "git worktree : fatal" } }, null);
  assert.deepEqual([etatDeLaBase(base)?.outcome, etatDeLaBase(base)?.sha, etatDeLaBase(base)?.redSince, etatDeLaBase(base)?.reason], ["skipped", "base-3", null, "git worktree : fatal"]);
  // Un contrôle non joué faute de gates n'a pas de motif, et n'hérite pas du précédent.
  noter({ type: "base.checked", payload: { sha: "base-4", outcome: "skipped", gates: NON_JOUEES, tickets: [] } }, null);
  assert.equal(etatDeLaBase(base)?.reason, null);
});

test("le rejeu que le chef demande reste dû tant qu'aucun contrôle ne l'a joué ; la machine qui le retient est dite ; sur une base qui n'est pas rouge, il n'y a rien à rejouer", (t) => {
  const { base, noter } = histoire(t);
  const demander = () => noter({ type: "base.recheck-requested", payload: {} }, null, "chef");
  demander();
  assert.equal(etatDeLaBase(base), null);
  noter({ type: "base.checked", payload: { sha: "base-1", outcome: "green", gates: VERTES, tickets: [] } }, null);
  demander();
  assert.equal(etatDeLaBase(base)?.recheck, null);

  noter({ type: "base.checked", payload: { sha: "base-1", outcome: "red", gates: ROUGES, tickets: [] } }, null);
  // Sans demande, la machine n'a rien retenu.
  noter({ type: "base.recheck-held", payload: { resource: "cpu", observed: 64, limit: 12 } }, null);
  assert.equal(etatDeLaBase(base)?.recheck, null);
  const demande = demander();
  assert.deepEqual(etatDeLaBase(base)?.recheck, { at: demande?.at, heldAt: null });
  const retenu = noter({ type: "base.recheck-held", payload: { resource: "cpu", observed: 64, limit: 12 } }, null);
  assert.deepEqual(etatDeLaBase(base)?.recheck, { at: demande?.at, heldAt: retenu?.at });

  // Rejouée rouge sur la même tête : la demande est servie, le rouge reste — depuis le premier.
  const rouge = etatDeLaBase(base)?.redSince;
  noter({ type: "base.checked", payload: { sha: "base-1", outcome: "red", gates: ROUGES, tickets: [] } }, null);
  assert.deepEqual([etatDeLaBase(base)?.outcome, etatDeLaBase(base)?.recheck, etatDeLaBase(base)?.redSince], ["red", null, rouge]);

  // Rejouée sans pouvoir l'être : servie aussi, et le rouge reste.
  demander();
  noter({ type: "base.checked", payload: { sha: "base-1", outcome: "skipped", gates: NON_JOUEES, tickets: [] } }, null);
  assert.deepEqual([etatDeLaBase(base)?.outcome, etatDeLaBase(base)?.recheck, etatDeLaBase(base)?.unplayed?.sha], ["red", null, "base-1"]);

  // Rejouée verte : la retenue tombe.
  demander();
  noter({ type: "base.checked", payload: { sha: "base-1", outcome: "green", gates: VERTES, tickets: [] } }, null);
  assert.deepEqual([etatDeLaBase(base)?.outcome, etatDeLaBase(base)?.recheck], ["green", null]);
});

test("un contrôle que le rapatriement retient se lit avec son motif courant, depuis la première panne, sur une base jamais contrôlée comme sur une base rouge ; il ne touche pas au rouge, et tombe à la reprise ou à une nouvelle demande du chef", (t) => {
  const { base, noter } = histoire(t);
  const retenir = (reason: string) => noter({ type: "base.check-held", payload: { reason } }, null);
  assert.equal(controleRetenu(base), null);

  // Avant tout contrôle : des merges attendent, et la base ne se rapatrie pas.
  const premiere = retenir("git fetch : fatal: origine injoignable");
  assert.deepEqual([controleRetenu(base), etatDeLaBase(base)], [{ at: premiere?.at, reason: "git fetch : fatal: origine injoignable" }, null]);
  // Une seconde panne sans reprise ne rajeunit pas la retenue — mais c'est son motif qui se lit : la cause a changé.
  retenir("git fetch : fatal: autre chose");
  assert.deepEqual(controleRetenu(base), { at: premiere?.at, reason: "git fetch : fatal: autre chose" });
  noter({ type: "base.check-resumed", payload: {} }, null);
  assert.equal(controleRetenu(base), null);

  noter({ type: "base.checked", payload: { sha: "base-1", outcome: "red", gates: ROUGES, tickets: [17] } }, null);
  const demande = noter({ type: "base.recheck-requested", payload: {} }, null, "chef");
  const retenue = retenir("git fetch : fatal: origine injoignable");
  // Le rouge et la demande restent tels quels : rien n'a été contrôlé.
  assert.deepEqual([etatDeLaBase(base)?.outcome, etatDeLaBase(base)?.tickets, etatDeLaBase(base)?.recheck], ["red", [17], { at: demande?.at, heldAt: null }]);
  assert.equal(controleRetenu(base)?.at, retenue?.at);
  noter({ type: "base.check-resumed", payload: {} }, null);
  assert.deepEqual([etatDeLaBase(base)?.outcome, etatDeLaBase(base)?.recheck, controleRetenu(base)], ["red", { at: demande?.at, heldAt: null }, null]);

  // Une nouvelle demande du chef se tente aussitôt : la retenue tombe avec elle.
  noter({ type: "base.checked", payload: { sha: "base-1", outcome: "red", gates: ROUGES, tickets: [] } }, null);
  retenir("git fetch : fatal: origine injoignable");
  noter({ type: "base.recheck-requested", payload: {} }, null, "chef");
  assert.equal(controleRetenu(base), null);

  // Sur une base qui n'est pas rouge, la demande n'en est pas une : la retenue reste.
  noter({ type: "base.checked", payload: { sha: "base-2", outcome: "green", gates: VERTES, tickets: [] } }, null);
  retenir("git fetch : fatal: origine injoignable");
  noter({ type: "base.recheck-requested", payload: {} }, null, "chef");
  assert.notEqual(controleRetenu(base), null);
});

test("la PR que la pass ouvre se range sur la livraison sans en changer la phase ; fermée sans merge, la livraison le dit et garde ce qu'elle était", (t) => {
  const { base, noter, lancer } = histoire(t);
  lancer("a");
  noter({ type: "cook.reported", payload: { run: "a", ending: "done", reason: null, summary: null, branch: "cook/a", pr: null } });
  assert.deepEqual([passDuTicket(base, 17)?.phase, passDuTicket(base, 17)?.pr], ["delivered", null]);

  noter({ type: "pass.pr-opened", payload: { pr: PR, number: 40, reconciled: false } });
  assert.deepEqual([passDuTicket(base, 17)?.phase, passDuTicket(base, 17)?.pr, passDuTicket(base, 17)?.number], ["delivered", PR, 40]);

  noter({ type: "pass.escalated", payload: { reason: "unjudged", cause: "no-gates" } });
  const fermee = noter({ type: "pass.pr-closed", payload: { pr: PR } });
  assert.deepEqual(
    [passDuTicket(base, 17)?.phase, passDuTicket(base, 17)?.reason, passDuTicket(base, 17)?.pr, passDuTicket(base, 17)?.since],
    ["closed", "unjudged", PR, fermee?.at],
  );

  // Rouverte puis mergée à la main : le merge l'emporte.
  noter({ type: "merge.done", payload: { pr: PR, sha: "sha-a", by: "outside", reconciled: false, unverified: true } });
  assert.equal(passDuTicket(base, 17)?.phase, "merged");
});

test("une livraison dont la PR est fermée, puis dont le ticket quitte le rail, reste à lâcher comme une autre", (t) => {
  const { base, noter, livrer, juger } = histoire(t);
  livrer("a");
  juger("a", "green");
  noter({ type: "pass.held", payload: { reason: "no-grant" } });
  noter({ type: "pass.pr-closed", payload: { pr: PR } });
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 17, "github");

  assert.deepEqual(orphelines(base).map((o) => [o.ticket, o.branch, o.pr, o.verdict]), [[17, "cook/a", PR, "green"]]);
});
