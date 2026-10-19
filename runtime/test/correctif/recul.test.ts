// Ce qu'une correction mergée a fait de sa cause : des tickets servis écrits au
// journal comme le runtime les écrit, une correction acceptée, livrée et mergée
// par la pass, et la part de tickets que la cause a fait rater avant et après.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { principal as facts } from "../../src/faits.ts";
import { reculDesCorrections } from "../../src/correctif/recul.ts";
import { ouvrirJournal, type Journal } from "../../src/journal.ts";
import { appeler, horloge, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

const PROJET = "brigade";
const PR = "https://github.com/benomite/brigade/pull/900";
const NUMERO = 900;

function journalDeTest(t: TestContext): { journal: Journal; repertoire: string } {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  return { journal, repertoire };
}

const noter = (journal: Journal, ticket: number | null, fait: object) => journal.ajouter({ project: PROJET, ticket, author: "runtime", ...fait } as never);

let runs = 0;
function prendre(journal: Journal, ticket: number): void {
  noter(journal, ticket, { type: "ticket.taken", payload: { station: "box/claude", leaseUntil: JOUR_HORLOGE } });
}
// Un essai de `ticket` : raté pour un ticket incomplet (`criteres`), pour le
// plafond de tours (`plafond`), ou livré (`ok`).
function essayer(journal: Journal, ticket: number, issue: "criteres" | "plafond" | "ok"): void {
  const run = `run-${++runs}`;
  noter(journal, ticket, { type: "cook.launched", payload: { run, limits: { turns: 100, durationMs: 3_600_000, tokens: 1_000_000, idleMs: 60_000 }, stream: `runs/${run}.jsonl`, station: "box/claude" } });
  if (issue === "criteres") noter(journal, ticket, { type: "cook.reported", payload: { run, ending: "failed", reason: "ticket incomplet", summary: null, branch: "x", pr: null } });
  if (issue === "plafond") noter(journal, ticket, { type: "guard.tripped", payload: { run, reason: "turns", limit: 100, observed: 100 } });
  noter(journal, ticket, { type: "cook.exited", payload: { run, outcome: issue === "ok" ? "ok" : issue === "plafond" ? "guard" : "failed", code: issue === "ok" ? 0 : 1, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
}
function merger(journal: Journal, ticket: number, pr = `https://github.com/benomite/brigade/pull/${ticket + 1000}`): void {
  noter(journal, ticket, { type: "merge.done", payload: { pr, sha: "f".repeat(40), by: "pass", reconciled: false, unverified: false } });
}
// Un ticket pris, raté pour ces causes, puis livré et mergé.
function servir(journal: Journal, ticket: number, rates: Array<"criteres" | "plafond"> = []): void {
  prendre(journal, ticket);
  for (const cause of rates) essayer(journal, ticket, cause);
  essayer(journal, ticket, "ok");
  merger(journal, ticket);
}

// Une correction de `criteres`, proposée puis acceptée par le chef. Rend le
// `seq` de la proposition.
function accepter(journal: Journal): number {
  const proposee = noter(journal, null, {
    type: "correction.proposed",
    payload: { candidate: 1, cause: "criteres", title: "contradictory criteria or incomplete ticket", tickets: [1, 2, 3], run: "correctif-1-0000", tokens: 10, reason: null, diff: "", files: ["CLAUDE.md"], base: "a".repeat(40) },
  });
  assert.ok(proposee);
  noter(journal, null, { type: "correction.accepted", author: "chef", payload: { proposal: proposee.seq, candidate: 1, cause: "criteres" } });
  return proposee.seq;
}
// Sa livraison : la branche, la PR, remise à la pass hors du rail.
function livrer(journal: Journal, proposition: number): void {
  const run = `correction-${proposition}-0000`;
  noter(journal, null, { type: "correction.started", payload: { proposal: proposition, run, branch: `cook/${run}` } });
  noter(journal, null, { type: "correction.delivered", payload: { proposal: proposition, run, branch: `cook/${run}`, pr: PR, number: NUMERO, sha: "b".repeat(40) } });
  noter(journal, NUMERO, { type: "pass.entered", payload: { run, branch: `cook/${run}`, pr: PR, number: NUMERO } });
}
// La correction mergée par la pass. Rend l'heure du merge.
function mergerLaCorrection(journal: Journal): string {
  merger(journal, NUMERO, PR);
  const merge = journal.duType("merge.done", 1)[0];
  assert.equal(merge?.ticket, NUMERO);
  return merge.at;
}

const COMMUN = { cause: "criteres", titre: "contradictory criteria or incomplete ticket" };

test("une correction mergée : la part des tickets que la cause a fait rater avant le merge, et après — elle recule", (t) => {
  const { journal } = journalDeTest(t);
  servir(journal, 1, ["criteres"]);
  servir(journal, 2, ["criteres", "criteres"]);
  servir(journal, 3, ["plafond"]);
  servir(journal, 4, ["criteres", "plafond"]);
  const proposition = accepter(journal);
  livrer(journal, proposition);
  // Pris avant le merge, fini après : cuisiné sous les consignes d'avant, il n'est d'aucun côté.
  prendre(journal, 5);
  essayer(journal, 5, "criteres");
  // Pris avant le merge et pas fini : d'aucun côté non plus.
  prendre(journal, 6);
  const mergee = mergerLaCorrection(journal);
  essayer(journal, 5, "ok");
  merger(journal, 5);
  servir(journal, 7);
  servir(journal, 8, ["plafond"]);
  servir(journal, 9, ["criteres"]);
  servir(journal, 10);
  // Pris après le merge, pas encore fini : il ne compte pas.
  prendre(journal, 11);
  essayer(journal, 11, "criteres");

  assert.deepEqual(reculDesCorrections(journal), [
    {
      proposition,
      ...COMMUN,
      pr: PR,
      etat: "mesuree",
      mergee,
      avant: { tickets: 4, atteints: [1, 2, 4], essais: 4, part: 0.75 },
      apres: { tickets: 4, atteints: [9], essais: 1, part: 0.25 },
      recule: true,
    },
  ]);
});

for (const [cas, apres, attendu] of [
  ["autant", [["criteres"], [], ["criteres"], []], { tickets: 4, atteints: [5, 7], essais: 2, part: 0.5 }],
  ["davantage", [["criteres"], ["criteres"], ["criteres", "criteres"], []], { tickets: 4, atteints: [5, 6, 7], essais: 4, part: 0.75 }],
] as const) {
  test(`une cause qui fait rater ${cas} de tickets après le merge qu'avant ne recule pas`, (t) => {
    const { journal } = journalDeTest(t);
    servir(journal, 1, ["criteres"]);
    servir(journal, 2);
    servir(journal, 3, ["criteres"]);
    servir(journal, 4);
    livrer(journal, accepter(journal));
    mergerLaCorrection(journal);
    apres.forEach((rates, i) => servir(journal, 5 + i, [...rates]));

    const [recul] = reculDesCorrections(journal);
    assert.equal(recul?.etat, "mesuree");
    assert.ok(recul?.etat === "mesuree");
    assert.deepEqual(recul.avant, { tickets: 4, atteints: [1, 3], essais: 2, part: 0.5 });
    assert.deepEqual(recul.apres, attendu);
    assert.equal(recul.recule, false);
  });
}

test("avant le merge — acceptée, puis sa PR ouverte en pass — rien ne se mesure : ni avant, ni après", (t) => {
  const { journal } = journalDeTest(t);
  servir(journal, 1, ["criteres"]);
  servir(journal, 2, ["criteres"]);
  const proposition = accepter(journal);
  assert.deepEqual(reculDesCorrections(journal), [{ proposition, ...COMMUN, pr: null, etat: "en-cours" }]);

  livrer(journal, proposition);
  // Des tickets finissent pendant que la PR attend : rien ne les compte encore.
  servir(journal, 3);
  servir(journal, 4);
  // Le merge d'un autre ticket n'est pas celui de la correction.
  merger(journal, NUMERO + 1, PR);
  assert.deepEqual(reculDesCorrections(journal), [{ proposition, ...COMMUN, pr: PR, etat: "en-cours" }]);
});

test("une correction qui ne sera jamais mergée — non livrée, ou sa PR fermée — ne se mesure pas, et le dit", (t) => {
  const { journal } = journalDeTest(t);
  servir(journal, 1, ["criteres"]);
  const nonLivree = accepter(journal);
  noter(journal, null, { type: "correction.undelivered", payload: { proposal: nonLivree, run: `correction-${nonLivree}-0000`, branch: null, reason: "branche non préparée" } });
  const fermee = accepter(journal);
  livrer(journal, fermee);
  noter(journal, NUMERO, { type: "pass.pr-closed", payload: { pr: PR } });
  servir(journal, 2);

  assert.deepEqual(reculDesCorrections(journal), [
    { proposition: nonLivree, ...COMMUN, pr: null, etat: "non-mergee" },
    { proposition: fermee, ...COMMUN, pr: PR, etat: "non-mergee" },
  ]);
});

test("mergée, sans ticket fini après elle : rien à comparer encore — pas une part nulle", (t) => {
  const { journal } = journalDeTest(t);
  servir(journal, 1, ["criteres"]);
  servir(journal, 2);
  const proposition = accepter(journal);
  livrer(journal, proposition);
  prendre(journal, 3);
  const mergee = mergerLaCorrection(journal);
  // Fini après le merge, mais pris avant : il ne fait pas un « après ».
  essayer(journal, 3, "ok");
  merger(journal, 3);
  // Pris après, pas encore fini.
  prendre(journal, 4);

  const releve = reculDesCorrections(journal);
  assert.deepEqual(releve, [{ proposition, ...COMMUN, pr: PR, etat: "rien-a-comparer", mergee, avant: { tickets: 2, atteints: [1], essais: 1, part: 0.5 } }]);
  assert.equal("apres" in (releve[0] ?? {}), false);
  assert.equal("recule" in (releve[0] ?? {}), false);
});

test("chaque côté regarde au plus la fenêtre : les derniers finis avant le merge, les premiers pris après", (t) => {
  const { journal } = journalDeTest(t);
  servir(journal, 1, ["criteres"]);
  servir(journal, 2);
  servir(journal, 3, ["criteres"]);
  livrer(journal, accepter(journal));
  mergerLaCorrection(journal);
  servir(journal, 4);
  servir(journal, 5, ["criteres"]);
  servir(journal, 6, ["criteres"]);

  const [recul] = reculDesCorrections(journal, 2);
  assert.ok(recul?.etat === "mesuree");
  assert.deepEqual(recul.avant, { tickets: 2, atteints: [3], essais: 1, part: 0.5 });
  assert.deepEqual(recul.apres, { tickets: 2, atteints: [5], essais: 1, part: 0.5 });
  assert.equal(recul.recule, false);
});

test("`facts` porte la mesure des corrections acceptées sous `reculs`, et ne l'a pas quand il n'y en a aucune", async (t) => {
  const { journal, repertoire } = journalDeTest(t);
  const lireFacts = async () => {
    const appel = appeler(facts, [], { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await appel.fin, 0, appel.sortie());
    return JSON.parse(appel.sortie()) as Record<string, unknown>;
  };
  servir(journal, 1, ["criteres"]);
  assert.equal("reculs" in (await lireFacts()), false);

  livrer(journal, accepter(journal));
  mergerLaCorrection(journal);
  servir(journal, 2);
  const forme = await lireFacts();
  assert.deepEqual(forme.reculs, reculDesCorrections(journal));
  assert.equal((forme.reculs as Array<{ etat: string; recule: boolean }>)[0]?.recule, true);
  // La correction tranchée a quitté la file : `corrections` n'y est pas.
  assert.equal("corrections" in forme, false);
});
