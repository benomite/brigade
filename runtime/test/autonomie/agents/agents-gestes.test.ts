// #4037: each agent's record takes its counters, its gestures and its last gesture from its gesture log, and `facts`
// gives them in `equipe`.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { equipeDuProjet } from "../../../src/autonomie/agents/agents.ts";
import { consignerGeste, enregistrementDe, OUTCOME } from "../../../src/autonomie/agents/gestes.ts";
import { magasinDeNiveaux, type Niveaux } from "../../../src/autonomie/agents/niveaux.ts";
import type { Ajout } from "../../../src/evenements.ts";
import { lireLesFaits } from "../../../src/faits.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { repertoireTemporaire } from "../../outils.ts";

// The file of the log, in the directory it is given (actions.ts).
const FICHIER = "autonomy-gestures.json";

const PROJET = "shop";
const NIVEAUX: Niveaux = { manager: "act", "manager split-epic": "propose", supervisor: "act", closer: "propose", pass: "act", cook: "act" };
type FicheDAgent = ReturnType<typeof equipeDuProjet>[number];
const MAINTENANT = new Date("2026-11-23T12:00:00.000Z");
const A = (h: number) => () => new Date(`2026-11-23T${String(h).padStart(2, "0")}:00:00.000Z`);

test("a record takes its counters, its gestures and its last gesture from the agent's log, a cook's too", (t) => {
  const dossier = repertoireTemporaire(t);
  consignerGeste(dossier, "supervisor", { line: "reran `tests` on 0de1ff5", reason: "red for 10 min", outcome: OUTCOME.FIXED_BY_SELF }, A(9));
  consignerGeste(dossier, "supervisor", { line: "parked #12", reason: "three failed tries", outcome: OUTCOME.HANDED_TO_CHEF }, A(10));
  consignerGeste(dossier, "cook #12", { line: "asked which colour", reason: "a design choice", outcome: OUTCOME.HANDED_TO_CHEF }, A(11));
  const equipe = equipeDuProjet({ agents: [], cooks: [{ ticket: 12 }], roles: [], niveaux: NIVEAUX, gestes: (agent) => enregistrementDe(dossier, agent) });
  const de = (agent: string) => equipe.find((fiche) => fiche.agent === agent) as FicheDAgent;
  assert.deepEqual(de("supervisor").lastGesture, { line: "parked #12", at: A(10)().toISOString() });
  assert.deepEqual(de("supervisor").counters, { fixedBySelf: 1, handedToChef: 1 });
  assert.deepEqual(de("supervisor").gestures.map(({ line }) => line), ["reran `tests` on 0de1ff5", "parked #12"]);
  assert.deepEqual(de("cook #12").lastGesture, { line: "asked which colour", at: A(11)().toISOString() });
  assert.deepEqual(de("cook #12").counters, { fixedBySelf: 0, handedToChef: 1 });
  assert.deepEqual(de("closer"), { agent: "closer", state: "idle", lastGesture: null, nextRun: null, thread: "Closer", autonomy: "propose", exceptions: {}, counters: { fixedBySelf: 0, handedToChef: 0 }, gestures: [] });
});

test("the last gesture is the later of the log's last entry and the roles' last action", (t) => {
  const dossier = repertoireTemporaire(t);
  consignerGeste(dossier, "closer", { line: "deleted 412 dead lines", reason: "its nightly pass", outcome: OUTCOME.FIXED_BY_SELF }, A(10));
  const dernier = (at: string) =>
    equipeDuProjet({ agents: [], cooks: [], roles: [{ role: "closer", does: "", latest: { what: "ended a cleanup", ticket: null, at } }], niveaux: NIVEAUX, gestes: (agent) => enregistrementDe(dossier, agent) }).find(({ agent }) => agent === "closer")?.lastGesture;
  assert.deepEqual(dernier(A(9)().toISOString()), { line: "deleted 412 dead lines", at: A(10)().toISOString() });
  assert.deepEqual(dernier(A(11)().toISOString()), { line: "ended a cleanup", at: A(11)().toISOString() });
});

// A log kept as the runtime keeps it: `facts` reads it.
function etat(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26.0.0" } } as Ajout);
  journal.fermer();
  return { repertoire, env: { BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: PROJET } };
}

test("`facts` gives each agent's logged gestures in `equipe`", (t) => {
  const { repertoire, env } = etat(t);
  consignerGeste(repertoire, "supervisor", { line: "reran `tests` on 0de1ff5", reason: "red for 10 min", outcome: OUTCOME.FIXED_BY_SELF }, A(9));
  const superviseur = (lireLesFaits(env, MAINTENANT).equipe as FicheDAgent[]).find(({ agent }) => agent === "supervisor") as FicheDAgent;
  assert.deepEqual(superviseur.lastGesture, { line: "reran `tests` on 0de1ff5", at: A(9)().toISOString() });
  assert.deepEqual(superviseur.counters, { fixedBySelf: 1, handedToChef: 0 });
  assert.deepEqual(superviseur.gestures, [{ at: A(9)().toISOString(), line: "reran `tests` on 0de1ff5", reason: "red for 10 min", outcome: OUTCOME.FIXED_BY_SELF }]);
});

test("an unreadable gesture log is said in `equipe`, the rest of `facts` is still given, and the file is left as it is", (t) => {
  const { repertoire, env } = etat(t);
  writeFileSync(join(repertoire, FICHIER), "{not json");
  const lus = lireLesFaits(env, MAINTENANT);
  assert.match((lus.equipe as { illisible: string }).illisible, /cannot be read/);
  assert.ok(Array.isArray(lus.rolesCuisine));
  assert.equal(readFileSync(join(repertoire, FICHIER), "utf8"), "{not json");
});

test("a log whose agent has an entry that is not a gesture is said in `equipe`, never read as given", (t) => {
  const { repertoire, env } = etat(t);
  const contenu = `{"closer": [{"at": "x", "line": "l", "outcome": "fixed by itself"}]}`;
  writeFileSync(join(repertoire, FICHIER), contenu);
  assert.match((lireLesFaits(env, MAINTENANT).equipe as { illisible: string }).illisible, /the gestures of closer are not a list/);
  assert.equal(readFileSync(join(repertoire, FICHIER), "utf8"), contenu);
});

test("without `BRIGADE_PROJECT`, `facts` gives each agent its gestures with the levels of the log's project", (t) => {
  const { repertoire, env } = etat(t);
  magasinDeNiveaux(repertoire).poser(PROJET, "supervisor", "observe");
  consignerGeste(repertoire, "supervisor", { line: "parked #12", reason: "three failed tries", outcome: OUTCOME.HANDED_TO_CHEF }, A(9));
  const superviseur = (lireLesFaits({ BRIGADE_STATE_DIR: env.BRIGADE_STATE_DIR }, MAINTENANT).equipe as FicheDAgent[]).find(({ agent }) => agent === "supervisor") as FicheDAgent;
  assert.equal(superviseur.autonomy, "observe");
  assert.deepEqual(superviseur.counters, { fixedBySelf: 0, handedToChef: 1 });
});
