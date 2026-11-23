// One record per agent of a project — manager, supervisor, closer, pass, then each cook — in the shape of #4036
// (spec 2026-11-23-autonomy-trust-control, C1 and C2), given by `facts` in `equipe` and set by `autonomy`.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { equipeDuProjet, type FicheDAgent } from "../../../src/autonomie/agents/agents.ts";
import { FICHIER_DES_NIVEAUX, NIVEAUX_PAR_DEFAUT } from "../../../src/autonomie/agents/niveaux.ts";
import { principal as autonomy } from "../../../src/autonomie-cli.ts";
import type { Ajout } from "../../../src/evenements.ts";
import { lireLesFaits } from "../../../src/faits.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { appeler, repertoireTemporaire } from "../../outils.ts";

const PROJET = "shop";
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

test("`facts` gives the records in `equipe`, each with the chef's default level on a fresh project, then the one `autonomy` set", async (t) => {
  const { repertoire, env } = etat(t);
  const niveaux = () => (lireLesFaits(env, MAINTENANT).equipe as FicheDAgent[]).map(({ agent, autonomy, exceptions }) => [agent, autonomy, exceptions]);
  assert.deepEqual(niveaux(), [["manager", "act", { "split-epic": "propose" }], ["supervisor", "act", {}], ["closer", "propose", {}], ["pass", "act", {}]]);

  const posee = appeler(autonomy, ["closer", "act"], env);
  assert.equal(await posee.fin, 0, posee.sortie());
  assert.match(posee.sortie(), /closer is now on act/);
  const decoupe = appeler(autonomy, ["manager", "split-epic", "act"], env);
  assert.equal(await decoupe.fin, 0, decoupe.sortie());
  assert.deepEqual(niveaux(), [["manager", "act", { "split-epic": "act" }], ["supervisor", "act", {}], ["closer", "act", {}], ["pass", "act", {}]]);

  const montree = appeler(autonomy, [], env);
  assert.equal(await montree.fin, 0, montree.sortie());
  assert.deepEqual(montree.sortie().trim().split("\n").map((ligne) => ligne.split(/\s{2,}/)), [["manager", "act"], ["manager split-epic", "act"], ["supervisor", "act"], ["closer", "act"], ["pass", "act"], ["cook", "act"]]);
  assert.ok(readFileSync(join(repertoire, FICHIER_DES_NIVEAUX), "utf8").includes(PROJET));
});

test("an unreadable levels file is said in `equipe` and by `autonomy`, and the rest of `facts` is still given", async (t) => {
  const { repertoire, env } = etat(t);
  writeFileSync(join(repertoire, FICHIER_DES_NIVEAUX), "{not json");
  const lus = lireLesFaits(env, MAINTENANT);
  assert.match((lus.equipe as { illisible: string }).illisible, /cannot be read/);
  assert.ok(Array.isArray(lus.rolesCuisine));
  // Its line in `facts` changed with `equipe`: what it gives only when it is there is still left out.
  assert.equal("githubSeul" in lus || "github" in lus, false);
  for (const args of [[], ["pass", "observe"]]) {
    const lancee = appeler(autonomy, args, env);
    assert.equal(await lancee.fin, 1, args.join(" "));
  }
  assert.equal(readFileSync(join(repertoire, FICHIER_DES_NIVEAUX), "utf8"), "{not json");
});

test("`autonomy` refuses an agent, a level or a gesture it does not know, and writes nothing", async (t) => {
  const { env } = etat(t);
  for (const args of [["chef", "act"], ["pass", "maybe"], ["closer"], ["manager", "split", "act"], ["closer", "split-epic", "act"], ["closer", "act", "now"]]) {
    const lancee = appeler(autonomy, args, env);
    assert.equal(await lancee.fin, 2, args.join(" "));
  }
  assert.equal(await appeler(autonomy, [], { BRIGADE_STATE_DIR: env.BRIGADE_STATE_DIR }).fin, 2);
  assert.equal(await appeler(autonomy, [], { BRIGADE_PROJECT: PROJET }).fin, 2);
  assert.deepEqual((lireLesFaits(env, MAINTENANT).equipe as FicheDAgent[]).map(({ autonomy: niveau }) => niveau), ["act", "act", "propose", "act"]);
});
