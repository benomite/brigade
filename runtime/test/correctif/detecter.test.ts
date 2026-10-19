// Le détecteur des causes qui reviennent : des tickets ratés écrits au journal
// comme le runtime les écrit, relevés, et ce que le relevé y pose.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ConfigInvalide } from "../../src/runtime.ts";
import { detecter, reperer } from "../../src/correctif/detecter.ts";
import { FENETRE_PAR_DEFAUT, lireReglagesDuCorrectif, SEUIL_PAR_DEFAUT, type ReglagesDuCorrectif } from "../../src/correctif/reglages.ts";
import { openLog, type Log } from "../../src/log.ts";
import { parcoursDesTickets } from "../../src/parcours-des-tickets.ts";
import { horloge, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

const PROJET = "brigade";
const PAR_DEFAUT = lireReglagesDuCorrectif({});

function logDeTest(t: TestContext): Log {
  const log = openLog(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => log.fermer());
  return log;
}

// Ce qui fait rater un essai, comme le journal le dit.
type Raison = "plafond" | "criteres" | "panne" | "sans-signal";

let runs = 0;
// Un essai raté de `ticket`, pris s'il ne l'est pas encore : le ticket reste ouvert.
function rater(log: Log, ticket: number, raison: Raison): void {
  const noter = (fait: object) => log.ajouter({ project: PROJET, ticket, author: "runtime", ...fait } as never);
  if (!log.duTicket(ticket).some((e) => e.type === "ticket.taken")) noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: JOUR_HORLOGE } });
  const run = `run-${++runs}`;
  noter({ type: "cook.launched", payload: { run, limits: { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 }, stream: `runs/${run}.jsonl`, station: "box/claude" } });
  if (raison === "plafond") noter({ type: "guard.tripped", payload: { run, reason: "turns", limit: 100, observed: 100 } });
  if (raison === "criteres") noter({ type: "cook.reported", payload: { run, ending: "failed", reason: "ticket incomplet", summary: null, branch: "x", pr: null } });
  if (raison === "panne") noter({ type: "cook.reported", payload: { run, ending: "disconnected", reason: null, summary: null, branch: "x", pr: null } });
  noter({ type: "cook.exited", payload: { run, outcome: raison === "plafond" ? "guard" : "failed", code: 1, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
}

const poses = (log: Log) => log.duType("correction.candidate", 100).map(({ payload, ticket, project }) => ({ ...payload, ticket, project }));
const reglages = (seuil: number, fenetre = FENETRE_PAR_DEFAUT): ReglagesDuCorrectif => ({ seuil, fenetre });

test("le seuil vaut 3 par défaut, la fenêtre les 20 derniers tickets servis ; l'environnement les ajuste, et une valeur illisible refuse", () => {
  assert.equal(SEUIL_PAR_DEFAUT, 3);
  assert.deepEqual(PAR_DEFAUT, { seuil: 3, fenetre: 20 });
  assert.deepEqual(lireReglagesDuCorrectif({ BRIGADE_CORRECTION_THRESHOLD: "4", BRIGADE_CORRECTION_WINDOW: "50" }), { seuil: 4, fenetre: 50 });
  assert.deepEqual(lireReglagesDuCorrectif({ BRIGADE_CORRECTION_THRESHOLD: "" }), PAR_DEFAUT);
  for (const brut of ["1", "0", "-3", "2.5", "trois"]) assert.throws(() => lireReglagesDuCorrectif({ BRIGADE_CORRECTION_THRESHOLD: brut }), ConfigInvalide, brut);
  assert.throws(() => lireReglagesDuCorrectif({ BRIGADE_CORRECTION_WINDOW: "0" }), ConfigInvalide);
});

test("trois tickets récents ratés pour la même cause : un candidat, qui dit la cause et exactement ces trois tickets", (t) => {
  const log = logDeTest(t);
  rater(log, 11, "plafond");
  rater(log, 12, "criteres");
  rater(log, 13, "plafond");
  rater(log, 13, "plafond");
  rater(log, 14, "sans-signal");
  rater(log, 15, "plafond");

  const ecrits = detecter(log, PROJET, PAR_DEFAUT);
  assert.equal(ecrits.length, 1);
  assert.deepEqual(poses(log), [{ cause: "plafond", title: "cap on turns or duration", tickets: [11, 13, 15], failures: 4, threshold: 3, window: 20, ticket: null, project: PROJET }]);
});

test("deux tickets seulement ratés pour la même cause : aucun candidat", (t) => {
  const log = logDeTest(t);
  rater(log, 11, "plafond");
  rater(log, 12, "plafond");
  rater(log, 12, "plafond");
  rater(log, 13, "criteres");

  assert.deepEqual(detecter(log, PROJET, PAR_DEFAUT), []);
  assert.deepEqual(poses(log), []);
});

test("le seuil réglé change l'issue : à 2, deux tickets suffisent ; à 4, trois ne suffisent plus", (t) => {
  const deux = logDeTest(t);
  rater(deux, 11, "plafond");
  rater(deux, 12, "plafond");
  detecter(deux, PROJET, lireReglagesDuCorrectif({ BRIGADE_CORRECTION_THRESHOLD: "2" }));
  assert.deepEqual(poses(deux).map(({ cause, tickets, threshold }) => ({ cause, tickets, threshold })), [{ cause: "plafond", tickets: [11, 12], threshold: 2 }]);

  const quatre = logDeTest(t);
  for (const ticket of [11, 12, 13]) rater(quatre, ticket, "plafond");
  assert.deepEqual(detecter(quatre, PROJET, lireReglagesDuCorrectif({ BRIGADE_CORRECTION_THRESHOLD: "4" })), []);
  rater(quatre, 14, "plafond");
  detecter(quatre, PROJET, lireReglagesDuCorrectif({ BRIGADE_CORRECTION_THRESHOLD: "4" }));
  assert.deepEqual(poses(quatre).map(({ tickets, threshold }) => ({ tickets, threshold })), [{ tickets: [11, 12, 13, 14], threshold: 4 }]);
});

test("deux causes qui atteignent chacune le seuil : deux candidats distincts", (t) => {
  const log = logDeTest(t);
  for (const ticket of [11, 12, 13]) rater(log, ticket, "plafond");
  for (const ticket of [12, 14, 15]) rater(log, ticket, "criteres");

  assert.equal(detecter(log, PROJET, PAR_DEFAUT).length, 2);
  assert.deepEqual(poses(log).map(({ cause, tickets, failures }) => ({ cause, tickets, failures })), [
    { cause: "plafond", tickets: [11, 12, 13], failures: 3 },
    { cause: "criteres", tickets: [12, 14, 15], failures: 3 },
  ]);
});

test("le détecteur rejoué sur les mêmes données ne pose pas de doublon ; un ticket de plus prolonge la récurrence sans en poser une autre", (t) => {
  const log = logDeTest(t);
  for (const ticket of [11, 12, 13]) rater(log, ticket, "plafond");
  assert.equal(detecter(log, PROJET, PAR_DEFAUT).length, 1);
  assert.deepEqual(detecter(log, PROJET, PAR_DEFAUT), []);
  assert.deepEqual(detecter(log, PROJET, PAR_DEFAUT), []);
  rater(log, 14, "plafond");
  assert.deepEqual(detecter(log, PROJET, PAR_DEFAUT), []);
  assert.equal(poses(log).length, 1);
  // Les mêmes données relues après un redémarrage : le journal reconstruit, rien de neuf.
  log.reconstruire();
  assert.deepEqual(detecter(log, PROJET, PAR_DEFAUT), []);
});

test("seuls les derniers tickets servis comptent, et « autre » n'est jamais candidate", (t) => {
  const log = logDeTest(t);
  for (const ticket of [11, 12, 13]) rater(log, ticket, "sans-signal");
  rater(log, 21, "plafond");
  for (const ticket of [22, 23]) rater(log, ticket, "plafond");
  // La fenêtre de 2 ne voit que #22 et #23 : deux tickets, sous le seuil de 3.
  assert.deepEqual(reperer(parcoursDesTickets(log.base), reglages(3, 2)), []);
  // Celle de 3 voit #21 aussi.
  assert.deepEqual(reperer(parcoursDesTickets(log.base), reglages(3, 3)).map(({ cause, tickets }) => [cause, tickets]), [["plafond", [21, 22, 23]]]);
  // Sur tout le journal, les trois tickets sans signal restent hors des candidats.
  assert.deepEqual(reperer(parcoursDesTickets(log.base), reglages(3)).map(({ cause }) => cause), ["plafond"]);
});

test("un ticket mergé au second essai compte pour la cause de son premier, celui qui a raté", (t) => {
  const log = logDeTest(t);
  for (const ticket of [11, 12]) rater(log, ticket, "panne");
  rater(log, 13, "panne");
  // Son second essai aboutit, puis il est mergé.
  const noter = (fait: object) => log.ajouter({ project: PROJET, ticket: 13, author: "runtime", ...fait } as never);
  noter({ type: "cook.launched", payload: { run: "reussi", limits: { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 }, stream: "runs/reussi.jsonl", station: "box/claude" } });
  noter({ type: "cook.exited", payload: { run: "reussi", outcome: "ok", code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
  noter({ type: "merge.done", payload: { pr: "p", sha: "s" } });
  assert.deepEqual(parcoursDesTickets(log.base).map(({ ticket, end, attempts }) => [ticket, end?.kind ?? null, attempts.length]), [[11, null, 1], [12, null, 1], [13, "merged", 2]]);
  detecter(log, PROJET, PAR_DEFAUT);
  assert.deepEqual(poses(log).map(({ cause, tickets }) => [cause, tickets]), [["panne", [11, 12, 13]]]);
});
