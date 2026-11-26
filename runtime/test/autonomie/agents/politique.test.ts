// The autonomy policy (#4380) beyond its acceptance tests: the pin of a level set before it, the facts it keeps, the
// escaped bugs, the level a gesture was done under, its progress, and its hook on the runtime's tick.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { equipeDuProjet } from "../../../src/autonomie/agents/agents.ts";
import { consignerGeste, gestesDe, OUTCOME, type Outcome } from "../../../src/autonomie/agents/gestes.ts";
import { magasinDeNiveaux, NiveauxIllisibles, type Niveaux } from "../../../src/autonomie/agents/niveaux.ts";
import { appliquerLaPolitique, NOMBRE_DE_GESTES_PROPRES, politiqueDuRuntime, progresDe, type ChiffresDeQualite } from "../../../src/autonomie/agents/politique.ts";
import type { Ajout } from "../../../src/evenements.ts";
import { lireLesFaits } from "../../../src/faits.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import type { CauseReveil } from "../../../src/runtime.ts";
import { repertoireTemporaire } from "../../outils.ts";

const PROJET = "shop";
const horloge = () => new Date("2026-11-26T12:00:00.000Z");
const RIEN: ChiffresDeQualite = { bugsEchappes: [], reverts: [] };
const revert = (sha: string, revertes: string[], tickets: number[] = []) => ({ depot: "o/shop", sha, revertes, tickets });
const geste = (repertoire: string, agent: string, texte: string, outcome: Outcome = OUTCOME.FIXED_BY_SELF) => consignerGeste(repertoire, agent, { line: texte, reason: texte, outcome }, horloge);
const appliquer = (repertoire: string, chiffres: ChiffresDeQualite = RIEN, reveils: string[] = []) => appliquerLaPolitique({ repertoire, projet: PROJET, chiffres, horloge, reveillerLeChef: (raison) => void reveils.push(raison) });

test("a level written bare, as the chef set every level before the policy, reads as pinned, and the policy leaves it", (t) => {
  const repertoire = repertoireTemporaire(t);
  writeFileSync(join(repertoire, "autonomy-levels.json"), JSON.stringify({ [PROJET]: { closer: "act" } }));
  geste(repertoire, "closer", "merged #9 as 0000009a");
  const avant = readFileSync(join(repertoire, "autonomy-levels.json"), "utf8");
  assert.deepEqual([...magasinDeNiveaux(repertoire).etat(PROJET).epingles], ["closer"]);
  assert.deepEqual(appliquer(repertoire, { bugsEchappes: [], reverts: [revert("deadbee", ["0000009a"])] }).length, 0);
  assert.equal(magasinDeNiveaux(repertoire).lire(PROJET).closer, "act");
  assert.notEqual(readFileSync(join(repertoire, "autonomy-levels.json"), "utf8"), avant, "the revert is kept as handled");
  assert.deepEqual(magasinDeNiveaux(repertoire).etat(PROJET).traites, [{ key: "revert deadbee", commits: ["0000009a"], tickets: [] }]);
});

test("the store refuses a policy move on a pinned level, and a list of facts handled it cannot read", (t) => {
  const repertoire = repertoireTemporaire(t);
  const magasin = magasinDeNiveaux(repertoire);
  magasin.poser(PROJET, "pass", "act", { epingle: true });
  const avant = readFileSync(join(repertoire, "autonomy-levels.json"), "utf8");
  assert.throws(() => magasin.retenir(PROJET, { mouvements: [{ reglable: "pass", niveau: "propose" }], traites: [] }), NiveauxIllisibles);
  assert.equal(readFileSync(join(repertoire, "autonomy-levels.json"), "utf8"), avant);
  for (const handled of ['"x"', '[{"key": 1, "commits": [], "tickets": []}]', '[{"key": "k", "commits": [1], "tickets": []}]', '[{"key": "k", "commits": [], "tickets": ["1"]}]']) {
    writeFileSync(join(repertoire, "autonomy-levels.json"), `{"${PROJET}": {"handled": ${handled}}}`);
    assert.throws(() => magasin.etat(PROJET), NiveauxIllisibles, handled);
  }
  writeFileSync(join(repertoire, "autonomy-levels.json"), `{"${PROJET}": {"closer": {"level": "act", "pinned": "yes"}}}`);
  assert.throws(() => magasin.lire(PROJET), NiveauxIllisibles);
});

test("an escaped bug citing a ticket a gesture delivered under act demotes the agent, the bug named, the chef woken once", (t) => {
  const repertoire = repertoireTemporaire(t);
  magasinDeNiveaux(repertoire).poser(PROJET, "pass", "act");
  geste(repertoire, "pass", "merged PR #40 of #12");
  geste(repertoire, "pass", "merged PR #41 of #13");
  const reveils: string[] = [];
  const bug = { depot: "o/shop", bug: 77, titre: "broken", url: "", tickets: [12, 13] };
  const [mouvement, ...autres] = appliquer(repertoire, { bugsEchappes: [bug], reverts: [] }, reveils);
  assert.deepEqual(autres, []);
  assert.equal(mouvement?.vers, "propose");
  assert.equal(magasinDeNiveaux(repertoire).lire(PROJET).pass, "propose");
  assert.match(gestesDe(repertoire, "pass").at(-1)?.reason ?? "", /escaped bug o\/shop#77/);
  assert.equal(reveils.length, 1);
  assert.match(reveils[0] ?? "", /pass went back from act to propose/);
});

test("a revert of a commit cited by its short sha demotes; one of a gesture handed to the chef does not", (t) => {
  const repertoire = repertoireTemporaire(t);
  magasinDeNiveaux(repertoire).poser(PROJET, "pass", "act");
  magasinDeNiveaux(repertoire).poser(PROJET, "supervisor", "act");
  geste(repertoire, "supervisor", "closed PR #50 at abc1234", OUTCOME.HANDED_TO_CHEF);
  geste(repertoire, "pass", "merged abc1234");
  const plein = "abc1234ffffffffffffffffffffffffffffffff0";
  const mouvements = appliquer(repertoire, { bugsEchappes: [], reverts: [revert("deadbee", [plein])] });
  assert.deepEqual(mouvements.map(({ agent }) => agent), ["pass"]);
  assert.equal(magasinDeNiveaux(repertoire).lire(PROJET).supervisor, "act");
});

test("a gesture done at propose, before its promotion, is not demoted by a later revert", (t) => {
  const repertoire = repertoireTemporaire(t);
  for (let n = 1; n <= NOMBRE_DE_GESTES_PROPRES; n++) geste(repertoire, "closer", `merged #${n} as 000000${n}a`);
  assert.deepEqual(appliquer(repertoire).map(({ vers }) => vers), ["act"]);
  geste(repertoire, "closer", "merged #8 as 0000008a");
  assert.deepEqual(appliquer(repertoire, { bugsEchappes: [], reverts: [revert("deadbee", ["0000003a"])] }), []);
  assert.equal(magasinDeNiveaux(repertoire).lire(PROJET).closer, "act");
  // The gesture done after the promotion, under act, is.
  assert.deepEqual(appliquer(repertoire, { bugsEchappes: [], reverts: [revert("deadbe2", ["0000008a"])] }).map(({ vers }) => vers), ["propose"]);
});

test("progress counts the clean gestures at propose, newest first, up to the first a fact touches; none at observe", (t) => {
  const repertoire = repertoireTemporaire(t);
  for (let n = 1; n <= 6; n++) geste(repertoire, "closer", `merged #${n} as 000000${n}a`);
  geste(repertoire, "closer", "would merge #9", OUTCOME.NOT_DONE);
  // The revert of the second gesture: four clean ones after it, no promotion.
  assert.deepEqual(appliquer(repertoire, { bugsEchappes: [], reverts: [revert("deadbee", ["0000002a"])] }), []);
  const { traites } = magasinDeNiveaux(repertoire).etat(PROJET);
  assert.deepEqual(progresDe(gestesDe(repertoire, "closer"), "propose", traites), { toward: "act", done: 4, of: NOMBRE_DE_GESTES_PROPRES });
  assert.equal(progresDe(gestesDe(repertoire, "closer"), "observe", traites), null);
  geste(repertoire, "closer", "merged #7 as 0000007a");
  assert.deepEqual(appliquer(repertoire).map(({ agent, vers }) => [agent, vers]), [["closer", "act"]]);

  // An agent at observe is not promoted, whatever its gestures.
  magasinDeNiveaux(repertoire).poser(PROJET, "supervisor", "observe");
  for (let n = 1; n <= NOMBRE_DE_GESTES_PROPRES; n++) geste(repertoire, "supervisor", `fixed #${n}`);
  assert.deepEqual(appliquer(repertoire), []);
  assert.equal(magasinDeNiveaux(repertoire).lire(PROJET).supervisor, "observe");
});

test("the team gives each cook the pin and progress of the cooks' level", () => {
  const niveaux: Niveaux = { manager: "act", "manager split-epic": "act", supervisor: "act", closer: "propose", pass: "act", cook: "propose" };
  const vus: string[] = [];
  const equipe = equipeDuProjet({
    agents: [],
    cooks: [{ ticket: 12 }],
    roles: [],
    niveaux,
    gestes: () => ({ counters: { fixedBySelf: 0, handedToChef: 0 }, gestures: [] }),
    politique: (agent, reglable) => (vus.push(`${agent}/${reglable}`), { pinned: reglable === "cook", progress: null }),
  });
  assert.deepEqual(vus, ["manager/manager", "supervisor/supervisor", "closer/closer", "pass/pass", "cook #12/cook"]);
  assert.equal(equipe.at(-1)?.pinned, true);
  assert.equal(equipe[0]?.pinned, false);
});

test("on the runtime, the policy runs at a tick, once an hour at most, and a read that fails is said and moves nothing", async (t) => {
  const repertoire = repertoireTemporaire(t);
  for (let n = 1; n <= NOMBRE_DE_GESTES_PROPRES; n++) geste(repertoire, "closer", `merged #${n} as 000000${n}a`);
  const ecouteurs: ((cause: CauseReveil) => void)[] = [];
  let maintenant = new Date("2026-11-26T12:00:00.000Z");
  let lectures = 0;
  let echoue = true;
  const avertis: string[] = [];
  politiqueDuRuntime(
    { projet: PROJET, repertoireEtat: repertoire, surReveil: (ecouter) => (ecouteurs.push(ecouter), () => {}) },
    { lire: async () => (lectures++, echoue ? Promise.reject(new Error("GitHub down")) : RIEN), reveillerLeChef: () => {}, horloge: () => maintenant, avertir: (texte) => void avertis.push(texte) },
  );
  const reveiller = async (cause: CauseReveil) => {
    for (const ecouter of ecouteurs) ecouter(cause);
    await new Promise((fin) => setImmediate(fin));
  };
  await reveiller("log");
  assert.equal(lectures, 0);
  await reveiller("tick");
  assert.equal(lectures, 1);
  assert.match(avertis[0] ?? "", /autonomy policy moved nothing — GitHub down/);
  assert.equal(magasinDeNiveaux(repertoire).lire(PROJET).closer, "propose");
  echoue = false;
  maintenant = new Date("2026-11-26T12:59:00.000Z");
  await reveiller("tick");
  assert.equal(lectures, 1);
  maintenant = new Date("2026-11-26T13:00:00.000Z");
  await reveiller("tick");
  assert.equal(lectures, 2);
  assert.equal(magasinDeNiveaux(repertoire).lire(PROJET).closer, "act");
  // Without a state directory, nothing listens.
  const sans: unknown[] = [];
  politiqueDuRuntime({ projet: PROJET, surReveil: (ecouter) => (sans.push(ecouter), () => {}) }, { lire: async () => RIEN, reveillerLeChef: () => {} });
  assert.deepEqual(sans, []);
});

test("a run still reading is not run again at the next tick, however late", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const ecouteurs: ((cause: CauseReveil) => void)[] = [];
  let maintenant = new Date("2026-11-26T12:00:00.000Z");
  let lectures = 0;
  let finir: (chiffres: ChiffresDeQualite) => void = () => {};
  politiqueDuRuntime(
    { projet: PROJET, repertoireEtat: repertoire, surReveil: (ecouter) => (ecouteurs.push(ecouter), () => {}) },
    { lire: () => (lectures++, new Promise<ChiffresDeQualite>((fin) => (finir = fin))), reveillerLeChef: () => {}, horloge: () => maintenant },
  );
  const tick = async () => {
    for (const ecouter of ecouteurs) ecouter("tick");
    await new Promise((fin) => setImmediate(fin));
  };
  await tick();
  maintenant = new Date("2026-11-26T14:00:00.000Z");
  await tick();
  assert.equal(lectures, 1);
  finir(RIEN);
  await new Promise((fin) => setImmediate(fin));
  maintenant = new Date("2026-11-26T16:00:00.000Z");
  await tick();
  assert.equal(lectures, 2);
});

test("without `BRIGADE_PROJECT`, facts reads the pin and progress of the log's project", (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26.0.0" } } as Ajout);
  journal.fermer();
  magasinDeNiveaux(repertoire).poser(PROJET, "closer", "propose", { epingle: true });
  const equipe = lireLesFaits({ BRIGADE_STATE_DIR: repertoire }, horloge()).equipe as Array<{ agent: string; pinned: boolean }>;
  assert.equal(equipe.find(({ agent }) => agent === "closer")?.pinned, true);
});
