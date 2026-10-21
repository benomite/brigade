// L'histoire d'un ticket et son coût, lus du journal.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { histoireDuTicket } from "../src/histoire-ticket.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { principal as montrerPass } from "../src/montrer-pass.ts";
import { appeler, horloge, repertoireTemporaire } from "./outils.ts";

function journal(t: TestContext) {
  const j = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge(), projections: [] });
  t.after(() => j.fermer());
  const noter = (fait: Fait, ticket: number | null = 7) => j.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  return { base: j.base, noter };
}

const LIMITES = { cpuSeconds: 1, memoryMb: 1, wallSeconds: 1, tokens: 1, turns: 1 } as never;
const lancer = (run: string, station = "cuisine-1"): Fait => ({ type: "cook.launched", payload: { run, limits: LIMITES, stream: `${run}.jsonl`, station } as never });
const sortir = (run: string, outcome = "ok", tokens = 1000, durationMs = 60_000): Fait =>
  ({ type: "cook.exited", payload: { run, outcome, code: 0, signal: null, turns: 5, tokens, durationMs } }) as Fait;

test("un ticket complet, de l'arrivée au merge : les étapes dans l'ordre, et le coût de ses cooks", (t) => {
  const { base, noter } = journal(t);
  noter({ type: "ticket.arrived", payload: { title: "T", priority: 1, createdAt: "x", url: "u" } });
  noter({ type: "ticket.taken", payload: { station: "cuisine-1", leaseUntil: "x" } });
  noter(lancer("r1"));
  noter(sortir("r1", "ok", 1000, 60_000));
  noter(lancer("rev", "reviewer"));
  noter(sortir("rev", "ok", 9999, 9999));
  noter({ type: "pass.reviewed", payload: { run: "r1", sha: "a", review: "rev", outcome: "red", summary: "Un test manque.", findings: [], reason: null, truncated: false } });
  noter({ type: "ticket.taken", payload: { station: "cuisine-2", leaseUntil: "x" } });
  noter(lancer("r2", "cuisine-2"));
  noter(sortir("r2", "ok", 500, 30_000));
  noter({ type: "pass.reviewed", payload: { run: "r2", sha: "b", review: "rev2", outcome: "green", summary: "Rien à dire.", findings: [], reason: null, truncated: false } });
  noter({ type: "pass.judged", payload: { verdict: "green" } as never });
  noter({ type: "merge.done", payload: { pr: "p", sha: "s", by: "pass", reconciled: false } });

  const { steps, cost } = histoireDuTicket(base, 7);
  assert.deepEqual(
    steps.map((etape) => etape.kind),
    ["arrived", "taken", "delivered", "reviewed", "taken", "delivered", "reviewed", "judged", "merged"],
  );
  assert.ok(steps.every((etape) => typeof etape.at === "string"));
  assert.deepEqual(steps[3], { kind: "reviewed", at: steps[3]?.at, verdict: "red", summary: "Un test manque." });
  assert.deepEqual(steps[8], { kind: "merged", at: steps[8]?.at, by: "pass" });
  assert.deepEqual(cost, { attempts: 2, tokens: 1500, durationMs: 90_000, incomplete: false });
});

test("un ticket en cours : les étapes qui n'ont pas eu lieu sont absentes, et le coût se dit incomplet", (t) => {
  const { base, noter } = journal(t);
  noter({ type: "ticket.arrived", payload: { title: "T", priority: null, createdAt: "x", url: "u" } });
  noter({ type: "ticket.taken", payload: { station: "cuisine-1", leaseUntil: "x" } });
  noter(lancer("r1"));
  noter(sortir("r1", "failed", 400, 10_000));
  noter(lancer("r2"));

  const { steps, cost } = histoireDuTicket(base, 7);
  assert.deepEqual(steps.map((etape) => etape.kind), ["arrived", "taken"]);
  assert.deepEqual(cost, { attempts: 2, tokens: 400, durationMs: 10_000, incomplete: true });
});

test("un ticket sans coût connu : null, jamais 0 — et un ticket inconnu n'a ni étape ni essai", (t) => {
  const { base, noter } = journal(t);
  noter({ type: "ticket.arrived", payload: { title: "T", priority: null, createdAt: "x", url: "u" } });
  noter(lancer("r1"));
  noter({ type: "cook.interrupted", payload: { run: "r1" } });

  assert.deepEqual(histoireDuTicket(base, 7).cost, { attempts: 1, tokens: null, durationMs: null, incomplete: true });
  assert.deepEqual(histoireDuTicket(base, 99), { ticket: 99, steps: [], cost: { attempts: 0, tokens: null, durationMs: null, incomplete: false }, retro: null });
});

const retro = (text: string | null, kept: unknown[], run = "r1"): Fait => ({ type: "retro.recorded", payload: { run, text, kept, dropped: [] } }) as Fait;

test("un ticket servi porte sa rétro : le texte du cook, et chaque leçon retenue avec son id et son texte", (t) => {
  const { base, noter } = journal(t);
  // Un ticket servi plus tôt laisse L1 ; le ticket 7 la reconfirme et en propose une nouvelle, L2.
  noter(retro("propose Lancer les tests avant de commiter.", [{ kind: "propose", text: "Lancer les tests avant de commiter." }], "r0"), 5);
  noter({ type: "ticket.arrived", payload: { title: "T", priority: null, createdAt: "x", url: "u" } });
  const texte = "reconfirm L1\npropose Relire la fiche avant d'écrire.";
  noter(retro(texte, [{ kind: "reconfirm", id: "L1" }, { kind: "propose", text: "Relire la fiche avant d'écrire." }]));

  const { retro: lue } = histoireDuTicket(base, 7);
  assert.ok(lue !== null);
  assert.equal(lue.text, texte);
  assert.equal(typeof lue.at, "string");
  assert.deepEqual(lue.lessons, [
    { kind: "reconfirm", id: "L1", text: "Lancer les tests avant de commiter." },
    { kind: "propose", id: "L2", text: "Relire la fiche avant d'écrire." },
  ]);
});

test("un ticket sans rétro : nulle tant qu'il n'est pas servi ; servi sans rien écrire, une rétro vide — et celle d'un autre ticket ne s'y mêle pas", (t) => {
  const { base, noter } = journal(t);
  noter({ type: "ticket.arrived", payload: { title: "T", priority: null, createdAt: "x", url: "u" } });
  assert.equal(histoireDuTicket(base, 7).retro, null);

  noter(retro(null, []));
  assert.deepEqual(histoireDuTicket(base, 7).retro?.text, null);
  assert.deepEqual(histoireDuTicket(base, 7).retro?.lessons, []);
  assert.equal(histoireDuTicket(base, 8).retro, null);
});

test("`pass -- <ticket> --json` rend l'histoire et le coût, en JSON, sans rien écrire au journal", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const j = ouvrirJournal(repertoire, { maintenant: horloge() });
  const noter = (fait: Fait) => j.ajouter({ project: "brigade", ticket: 7, author: "runtime", ...fait });
  noter({ type: "ticket.arrived", payload: { title: "T", priority: null, createdAt: "x", url: "u" } });
  noter(lancer("r1"));
  noter(sortir("r1", "ok", 1000, 60_000));
  j.fermer();

  const sortie = appeler(montrerPass, ["7", "--json"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await sortie.fin, 0);
  const lu = JSON.parse(sortie.sortie());
  assert.equal(lu.ticket, 7);
  assert.deepEqual(lu.steps.map((etape: { kind: string }) => etape.kind), ["arrived", "delivered"]);
  assert.deepEqual(lu.cost, { attempts: 1, tokens: 1000, durationMs: 60_000, incomplete: false });
  assert.equal(lu.retro, null);

  const inconnu = appeler(montrerPass, ["99", "--json"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await inconnu.fin, 0);
  assert.deepEqual(JSON.parse(inconnu.sortie()).steps, []);

  const mal = appeler(montrerPass, ["--json"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await mal.fin, 2);
});
