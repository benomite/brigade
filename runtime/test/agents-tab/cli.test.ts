// `npm run agents` (#4220): the Agents tab read from a real state directory — the log's runs, what `facts` says runs
// outside the tickets, the gesture log and the noted schedules.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test, type TestContext } from "node:test";
import { principal } from "../../src/agents-tab/commande.ts";
import { consignerGeste, OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { noterHoraire } from "../../src/autonomie/agents/horaires.ts";
import type { Issue } from "../../src/events/guardrails.ts";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { appeler, horloge, repertoireTemporaire } from "../outils.ts";

type Entree = { id: string; state: string; workingOn: number | null; nextRun: string | null; figures: Array<{ value: unknown }> };
const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
// A run of the log: its name, its station, how it ended (null: it goes on), its ticket.
type Run = [string, string, Issue | null, number?];

function etat(t: TestContext, runs: readonly Run[] = []): string {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  const noter = (fait: Fait, ticket: number | null = null) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  for (const [nom, station, fin, ticket = null] of runs) {
    noter({ type: "cook.launched", payload: { run: nom, limits: LIMITES, stream: `runs/${nom}.jsonl`, station } }, ticket);
    if (fin !== null) noter({ type: "cook.exited", payload: { run: nom, outcome: fin, code: fin === "ok" ? 0 : 1, signal: null, turns: 1, tokens: 10, durationMs: 1000 } });
  }
  journal.fermer();
  return repertoire;
}

async function agents(repertoire: string): Promise<Record<string, Entree>> {
  const appel = appeler(principal, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await appel.fin, 0, appel.sortie());
  return Object.fromEntries((JSON.parse(appel.sortie()) as Entree[]).map((agent) => [agent.id, agent]));
}
const etats = (lus: Record<string, Entree>, ids: string[]) => ids.map((id) => [id, lus[id]?.state, lus[id]?.workingOn]);

test("`agents` reads the state directory: a cook at work on its ticket, the closer broken, the manager idle, the next run and the figures", async (t) => {
  const repertoire = etat(t, [["15-aa", "box/claude", null, 15], ["fermeture-0f0f0f0f", "closer", "failed"], ["juge-21-abcd1234", "manager", "ok"]]);
  consignerGeste(repertoire, "cook #15", { line: "relaunched its gates", reason: "a flaky test", outcome: OUTCOME.FIXED_BY_SELF }, () => new Date());
  noterHoraire(repertoire, "closer", new Date("2030-01-01T03:00:00.000Z"));
  const lus = await agents(repertoire);
  assert.deepEqual(etats(lus, ["cook", "closer", "manager"]), [["cook", "working", 15], ["closer", "broken", null], ["manager", "idle", null]]);
  assert.equal(lus.closer?.nextRun, "2030-01-01T03:00:00.000Z");
  assert.deepEqual(lus.cook?.figures.map(({ value }) => value), [1, 0]);

  const fil = appeler(principal, ["/api/agents/cook/gestures"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await fil.fin, 0, fil.sortie());
  assert.deepEqual((JSON.parse(fil.sortie()) as Array<{ summary: string; issue: number }>).map(({ summary, issue }) => [summary, issue]), [["relaunched its gates", 15]]);
});

test("an agent is broken when its last run failed, died on a guardrail or stalled — the triage under the manager's station, the reviewer under its own", async (t) => {
  const lus = await agents(etat(t, [["fermeture-a", "closer", "failed"], ["juge-3-a", "manager", "guard"], ["trie-4-a", "manager", "stalled"], ["review-5-a", "reviewer", "failed", 5]]));
  assert.deepEqual(etats(lus, ["closer", "manager", "triage", "reviewer", "cook"]), [["closer", "broken", null], ["manager", "broken", null], ["triage", "broken", null], ["reviewer", "broken", null], ["cook", "idle", null]]);
});

test("a run launched after a failed one clears it; a refused launch or the chef's stop is no failure", async (t) => {
  const relance = await agents(etat(t, [["12-a", "box/claude", "failed", 12], ["13-a", "box/claude", "ok", 13], ["juge-3-a", "manager", "failed"], ["juge-3-b", "manager", "ok"]]));
  assert.deepEqual(etats(relance, ["cook", "manager"]), [["cook", "idle", null], ["manager", "idle", null]]);
  const sansEchec = await agents(etat(t, [["12-a", "box/claude", "refused", 12], ["fermeture-a", "closer", "stop"]]));
  assert.deepEqual(etats(sansEchec, ["cook", "closer"]), [["cook", "idle", null], ["closer", "idle", null]]);
});

test("the runs going on: the manager on the ticket its run names, a cook and the reviewer on theirs; a run that ended works on nothing", async (t) => {
  const lus = await agents(etat(t, [["13-a", "box/claude", "ok", 13], ["12-a", "box/claude", null, 12], ["juge-3-a", "manager", null], ["review-5-a", "reviewer", null, 5]]));
  assert.deepEqual(etats(lus, ["manager", "cook", "reviewer", "closer"]), [["manager", "working", 3], ["cook", "working", 12], ["reviewer", "working", 5], ["closer", "idle", null]]);
});

test("`agents` says why a path is not served, in 1; a state directory with no log is said, and given none; without its state directory or with two paths, it refuses in 2", async (t) => {
  const repertoire = etat(t);
  const inconnu = appeler(principal, ["/api/agents/nobody/gestures"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await inconnu.fin, 1);
  assert.match(inconnu.sortie(), /404: no agent “nobody” in the registry/);
  const sansJournal = repertoireTemporaire(t);
  const vide = appeler(principal, [], { BRIGADE_STATE_DIR: sansJournal });
  assert.equal(await vide.fin, 1);
  assert.match(vide.sortie(), /no log in/);
  assert.deepEqual(readdirSync(sansJournal), []);
  const sansEtat = appeler(principal, []);
  assert.equal(await sansEtat.fin, 2);
  assert.match(sansEtat.sortie(), /run agents/);
  assert.equal(await appeler(principal, ["/api/agents", "/api/agents"], { BRIGADE_STATE_DIR: repertoire }).fin, 2);
});
