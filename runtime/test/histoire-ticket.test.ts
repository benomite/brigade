// L'histoire d'un ticket et son coût, lus du journal.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { histoireDuTicket } from "../src/histoire-ticket.ts";
import { openLog } from "../src/log.ts";
import { principal as montrerPass } from "../src/montrer-pass.ts";
import { appeler, horloge, repertoireTemporaire } from "./outils.ts";

function log(t: TestContext) {
  const j = openLog(repertoireTemporaire(t), { maintenant: horloge(), projections: [] });
  t.after(() => j.fermer());
  const noter = (fait: Fait, ticket: number | null = 7) => j.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  return { base: j.base, noter };
}

const LIMITES = { cpuSeconds: 1, memoryMb: 1, wallSeconds: 1, tokens: 1, turns: 1 } as never;
const lancer = (run: string, station = "cuisine-1"): Fait => ({ type: "cook.launched", payload: { run, limits: LIMITES, stream: `${run}.jsonl`, station } as never });
const sortir = (run: string, outcome = "ok", tokens = 1000, durationMs = 60_000): Fait =>
  ({ type: "cook.exited", payload: { run, outcome, code: 0, signal: null, turns: 5, tokens, durationMs } }) as Fait;

test("un ticket complet, de l'arrivée au merge : les étapes dans l'ordre, et le coût de ses cooks", (t) => {
  const { base, noter } = log(t);
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
  const { base, noter } = log(t);
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
  const { base, noter } = log(t);
  noter({ type: "ticket.arrived", payload: { title: "T", priority: null, createdAt: "x", url: "u" } });
  noter(lancer("r1"));
  noter({ type: "cook.interrupted", payload: { run: "r1" } });

  assert.deepEqual(histoireDuTicket(base, 7).cost, { attempts: 1, tokens: null, durationMs: null, incomplete: true });
  assert.deepEqual(histoireDuTicket(base, 99), { ticket: 99, steps: [], cost: { attempts: 0, tokens: null, durationMs: null, incomplete: false } });
});

test("`pass -- <ticket> --json` rend l'histoire et le coût, en JSON, sans rien écrire au journal", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const j = openLog(repertoire, { maintenant: horloge() });
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

  const inconnu = appeler(montrerPass, ["99", "--json"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await inconnu.fin, 0);
  assert.deepEqual(JSON.parse(inconnu.sortie()).steps, []);

  const mal = appeler(montrerPass, ["--json"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await mal.fin, 2);
});
