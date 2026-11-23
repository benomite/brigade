// One record per agent of a project — manager, supervisor, closer, pass, then each cook — in the shape of #4036
// (spec 2026-11-23-autonomy-trust-control, C1 and C2), given by `facts` in `equipe`.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { equipeDuProjet } from "../../../src/autonomie/agents/agents.ts";
import { magasinDeNiveaux, type Niveaux } from "../../../src/autonomie/agents/niveaux.ts";
import type { Ajout } from "../../../src/evenements.ts";
import { lireLesFaits } from "../../../src/faits.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { repertoireTemporaire } from "../../outils.ts";

const PROJET = "shop";
const FICHIER_DES_NIVEAUX = "autonomy-levels.json";
// The chef's defaults (niveaux.test.ts reads them from a fresh store).
const NIVEAUX_PAR_DEFAUT: Niveaux = { manager: "act", "manager split-epic": "propose", supervisor: "act", closer: "propose", pass: "act", cook: "act" };
type FicheDAgent = ReturnType<typeof equipeDuProjet>[number];
const MAINTENANT = new Date("2026-11-23T12:00:00.000Z");
const VIDE = { nextRun: null, counters: { fixedBySelf: 0, handedToChef: 0 }, gestures: [] };
const role = (nom: string, latest: { what: string; at: string } | null = null) => ({ role: nom, does: "", latest: latest === null ? null : { ...latest, ticket: null } });

test("one record per agent: the manager, the supervisor, the closer, the pass, then each cook, in the shape of #4036", () => {
  const equipe = equipeDuProjet({
    agents: [{ role: "closer", ticket: null }, { role: "pass", ticket: 31 }, { role: "triage", ticket: 7 }],
    cooks: [{ ticket: 12 }, { ticket: 14 }],
    roles: [role("manager"), role("reviewer", { what: "reviewed #31: green", at: "2026-11-23T10:00:00.000Z" }), role("second judge", { what: "found the checks of #30 not weakened", at: "2026-11-23T09:00:00.000Z" }), role("triage"), role("closer", { what: "ended a cleanup with nothing removed", at: "2026-11-23T08:00:00.000Z" })],
    niveaux: { ...NIVEAUX_PAR_DEFAUT, closer: "observe" },
  });
  assert.deepEqual(
    equipe.map(({ agent }) => agent),
    ["manager", "supervisor", "closer", "pass", "cook #12", "cook #14"],
  );
  const de = (agent: string) => equipe.find((fiche) => fiche.agent === agent);
  assert.deepEqual<FicheDAgent | undefined>(de("supervisor"), { agent: "supervisor", state: "idle", lastGesture: null, thread: "Supervisor", autonomy: "act", exceptions: {}, ...VIDE });
  assert.deepEqual<FicheDAgent | undefined>(de("closer"), { agent: "closer", state: "working", lastGesture: { line: "ended a cleanup with nothing removed", at: "2026-11-23T08:00:00.000Z" }, thread: "Closer", autonomy: "observe", exceptions: {}, ...VIDE });
  assert.deepEqual<FicheDAgent | undefined>(de("manager"), { agent: "manager", state: "idle", lastGesture: null, thread: "Manager", autonomy: "act", exceptions: { "split-epic": "propose" }, ...VIDE });
  // The pass's last gesture is the latest of the reviewer's and the second judge's.
  assert.deepEqual<FicheDAgent | undefined>(de("pass"), { agent: "pass", state: "working on #31", lastGesture: { line: "reviewed #31: green", at: "2026-11-23T10:00:00.000Z" }, thread: "Pass", autonomy: "act", exceptions: {}, ...VIDE });
  assert.deepEqual<FicheDAgent | undefined>(de("cook #12"), { agent: "cook #12", state: "working on #12", lastGesture: null, thread: "Cook #12", autonomy: "act", exceptions: {}, ...VIDE });
});

test("the pass's last gesture is the later of its two roles, whichever comes first in the list", () => {
  const passe = (premier: string, second: string) =>
    equipeDuProjet({ agents: [], cooks: [], roles: [role("second judge", { what: premier, at: "2026-11-23T11:00:00.000Z" }), role("reviewer", { what: second, at: "2026-11-23T10:00:00.000Z" })], niveaux: NIVEAUX_PAR_DEFAUT }).find(({ agent }) => agent === "pass")?.lastGesture;
  assert.deepEqual(passe("judged", "reviewed"), { line: "judged", at: "2026-11-23T11:00:00.000Z" });
});

// A log kept as the runtime keeps it: `facts` reads it.
function etat(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26.0.0" } } as Ajout);
  journal.fermer();
  return { repertoire, env: { BRIGADE_STATE_DIR: repertoire, BRIGADE_PROJECT: PROJET } };
}

test("`facts` gives the records in `equipe`, each with the chef's default level on a fresh project, then the one the store set", (t) => {
  const { repertoire, env } = etat(t);
  const niveaux = () => (lireLesFaits(env, MAINTENANT).equipe as FicheDAgent[]).map(({ agent, autonomy, exceptions }) => [agent, autonomy, exceptions]);
  assert.deepEqual(niveaux(), [["manager", "act", { "split-epic": "propose" }], ["supervisor", "act", {}], ["closer", "propose", {}], ["pass", "act", {}]]);

  magasinDeNiveaux(repertoire).poser(PROJET, "closer", "act");
  magasinDeNiveaux(repertoire).poser(PROJET, "manager split-epic", "act");
  assert.deepEqual(niveaux(), [["manager", "act", { "split-epic": "act" }], ["supervisor", "act", {}], ["closer", "act", {}], ["pass", "act", {}]]);
});

test("an unreadable levels file is said in `equipe`, and the rest of `facts` is still given", (t) => {
  const { repertoire, env } = etat(t);
  writeFileSync(join(repertoire, FICHIER_DES_NIVEAUX), "{not json");
  const lus = lireLesFaits(env, MAINTENANT);
  assert.match((lus.equipe as { illisible: string }).illisible, /cannot be read/);
  assert.ok(Array.isArray(lus.rolesCuisine));
  // Its line in `facts` changed with `equipe`: what it gives only when it is there is still left out.
  assert.equal("githubSeul" in lus || "github" in lus, false);
  assert.equal(readFileSync(join(repertoire, FICHIER_DES_NIVEAUX), "utf8"), "{not json");
});
