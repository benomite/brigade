// `npm run agents` (#4220): the Agents tab read from a real state directory — the log's runs, what `facts` says runs
// outside the tickets, the gesture log and the noted schedules.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test, type TestContext } from "node:test";
import { principal } from "../../src/agents-cli.ts";
import type { EntreeDAgent } from "../../src/agents-tab/api.ts";
import { enCours, enEchec, type RunDuJournal } from "../../src/agents-tab/sources.ts";
import { consignerGeste, OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { noterHoraire } from "../../src/autonomie/agents/horaires.ts";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { appeler, horloge, repertoireTemporaire } from "../outils.ts";

const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const run = (nom: string, station: string | null, ending: string | null, ticket: number | null = null): RunDuJournal => ({ run: nom, ticket, station, ending });

test("an agent is failed when its last run failed, died on a guardrail or stalled; a later run of it clears it", () => {
  assert.deepEqual(enEchec([run("fermeture-a", "closer", "failed"), run("juge-3-a", "manager", "guard"), run("trie-4-a", "manager", "stalled"), run("review-5-a", "reviewer", "failed")]), ["closer", "manager", "triage", "reviewer"]);
  assert.deepEqual(enEchec([run("12-a", "box/claude", "failed", 12), run("13-a", "box/claude", "ok", 13), run("juge-3-a", "manager", "failed"), run("juge-3-b", "manager", null)]), []);
  assert.deepEqual(enEchec([run("12-a", "box/claude", "refused", 12), run("fermeture-a", "closer", "stop"), run("13-a", null, "failed", 13)]), ["cook"]);
});

test("the runs going on: what `facts` says, then the cooks' and the reviewer's runs of the log with their ticket", () => {
  const runs = [run("12-a", "box/claude", null, 12), run("13-a", "box/claude", "ok", 13), run("juge-3-a", "manager", null), run("fermeture-a", "closer", null), run("trie-4-a", "manager", null), run("review-5-a", "reviewer", null, 5)];
  assert.deepEqual(enCours([{ role: "manager", ticket: 3 }], runs), [
    { id: "manager", ticket: 3 },
    { id: "cook", ticket: 12 },
    { id: "reviewer", ticket: 5 },
  ]);
});

function etat(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  const noter = (fait: Fait, ticket: number | null = null) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  const lancer = (nom: string, station: string, ticket: number | null = null) => noter({ type: "cook.launched", payload: { run: nom, limits: LIMITES, stream: `runs/${nom}.jsonl`, station } }, ticket);
  const finir = (nom: string, outcome: "ok" | "failed") => noter({ type: "cook.exited", payload: { run: nom, outcome, code: outcome === "ok" ? 0 : 1, signal: null, turns: 1, tokens: 10, durationMs: 1000 } });
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  return { repertoire, journal, lancer, finir };
}

test("`agents` reads the state directory: a cook at work on its ticket, the closer broken, the manager idle, the next run and the figures", async (t) => {
  const { repertoire, journal, lancer, finir } = etat(t);
  lancer("15-aa", "box/claude", 15);
  lancer("fermeture-0f0f0f0f", "closer");
  finir("fermeture-0f0f0f0f", "failed");
  lancer("juge-21-abcd1234", "manager");
  finir("juge-21-abcd1234", "ok");
  journal.fermer();
  consignerGeste(repertoire, "cook #15", { line: "relaunched its gates", reason: "a flaky test", outcome: OUTCOME.FIXED_BY_SELF }, () => new Date());
  noterHoraire(repertoire, "closer", new Date("2030-01-01T03:00:00.000Z"));

  const appel = appeler(principal, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await appel.fin, 0, appel.sortie());
  const agents = JSON.parse(appel.sortie()) as EntreeDAgent[];
  const de = (id: string) => agents.find((agent) => agent.id === id) as EntreeDAgent;
  assert.deepEqual([de("cook").state, de("cook").workingOn], ["working", 15]);
  assert.deepEqual([de("closer").state, de("closer").nextRun], ["broken", "2030-01-01T03:00:00.000Z"]);
  assert.equal(de("manager").state, "idle");
  assert.deepEqual(de("cook").figures.map(({ value }) => value), [1, 0]);

  const fil = appeler(principal, ["/api/agents/cook/gestures"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await fil.fin, 0, fil.sortie());
  assert.deepEqual((JSON.parse(fil.sortie()) as Array<{ summary: string; issue: number }>).map(({ summary, issue }) => [summary, issue]), [["relaunched its gates", 15]]);
});

test("`agents` says why a path is not served, in 1; without its state directory or with two paths, it refuses in 2", async (t) => {
  const { repertoire, journal } = etat(t);
  journal.fermer();
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
