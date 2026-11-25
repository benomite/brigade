// L'onglet Agents, côté process principal (#4117), par les deux gestes du pont que main.ts branche : les agents lus par
// `facts`, `setting`, `switch`, `closing --json` et `log`, et un réglage changé par `station -- <geste> <valeur>` ou `switch off`.
// Chaque échec se dit en une ligne : un réglage qui ne passe pas ne passe jamais pour changé. Le geste `lancer` est une
// doublure : rien ne part.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Lu, Rendu } from "../../src/box.ts";
import { brancherLesAgents, changementsLus, interrupteurLu } from "../../src/vue/agents/agents-box.ts";
import type { Fiche } from "../../src/vue/agents/fiches.ts";
import { FAITS, FERMETURE, JOURNAL, SETTING, SWITCH } from "./faits-fixture.ts";

const LU = { nom: "parade" } as Lu;
const sortiePar = (code: number) => Object.assign(new Error("exit"), { code, cmd: "station" });
const rendu = (sortie: string, erreur: Rendu["erreur"] = null, erreurs = ""): Rendu => ({ lance: "$ node geste.ts parade x", erreur, sortie, erreurs });

// Ce que chaque commande rend, par défaut : la cuisine de la fixture. `reponses` en remplace.
type Reponses = Record<string, Rendu>;
function geste(reponses: Reponses = {}, { sansStation = false } = {}) {
  const commandes: string[] = [];
  const parDefaut: Reponses = {
    facts: rendu(JSON.stringify(FAITS)),
    setting: rendu(SETTING),
    switch: rendu(SWITCH),
    "closing --json": rendu(JSON.stringify(FERMETURE)),
  };
  const lancer = async (_: Lu, commande: string) => {
    commandes.push(commande);
    const cle = commande.startsWith("log ") ? "log" : commande;
    return { ...parDefaut, log: rendu(JOURNAL), ...reponses }[cle] ?? rendu("brigade : done");
  };
  const ecoutes = new Map<string, (evenement: unknown, ...args: unknown[]) => unknown>();
  const cuisineDuProjet = (nom: unknown) => (nom === "parade" ? { vise: { nom: "parade" }, lu: sansStation ? undefined : LU } : { vise: undefined, lu: undefined });
  brancherLesAgents({ handle: (canal, ecouter) => ecoutes.set(canal, ecouter) }, cuisineDuProjet, lancer);
  const lire = ecoutes.get("lireLesAgentsDuProjet") ?? assert.fail("pas de geste lireLesAgentsDuProjet");
  const regler = ecoutes.get("reglerUnAgent") ?? assert.fail("pas de geste reglerUnAgent");
  return {
    commandes,
    lire: async (projet = "parade") => (await lire(null, projet)) as Fiche[] | { sans: string; detail?: string },
    regler: async (agent: unknown, cle: unknown, valeur: unknown, projet = "parade") => (await regler(null, projet, agent, cle, valeur)) as { ok: boolean; reason?: string; detail?: string },
  };
}

test("the agents are read by the commands that exist, and nothing is written", async () => {
  const { commandes, lire } = geste();
  const lus = await lire();
  assert.ok(Array.isArray(lus));
  assert.deepEqual(lus.map(({ agent }) => agent), ["second", "manager", "cooks", "pass", "reviewer", "second judge", "triage", "closer", "supervisor"]);
  assert.deepEqual([...commandes].sort(), ["closing --json", "facts", "log --last 1000", "setting", "switch"]);
  // Ce qui est lu y est : l'état du manager, le calibrage du closer que le dépôt pose, le moment du dernier changement.
  const manager = lus.find(({ agent }) => agent === "manager") as Fiche;
  assert.equal(manager.state, "working on #4031");
  assert.equal(manager.settings.find(({ key }) => key === "manager-modele")?.changedAt, "2026-10-11T08:00:00.000Z");
});

test("without its facts nothing is known of the agents: a project without a station, an unreadable or failed `facts` say so", async () => {
  assert.deepEqual(await geste({}, { sansStation: true }).lire(), { sans: "parade has no station: its agents are read where its kitchen runs" });
  assert.deepEqual(await geste().lire("gone"), { sans: "gone is no longer in the projects file" });
  const echoue = await geste({ facts: rendu("", sortiePar(1), "no log") }).lire();
  assert.deepEqual(echoue, { sans: "the agents were not read: the kitchen's facts could not be read", detail: "$ node geste.ts parade x\nno log" });
  assert.deepEqual(await geste({ facts: rendu("not json") }).lire(), { sans: "the agents were not read: the kitchen's facts are not readable", detail: "not json" });
  assert.deepEqual(await geste({ facts: rendu("[1]") }).lire(), { sans: "the agents were not read: the kitchen's facts are not readable", detail: "[1]" });
});

test("a reading besides `facts` that fails is said in the fiches it feeds, the others stay", async () => {
  const lus = (await geste({ setting: rendu("", sortiePar(1), "boom"), switch: rendu("switch     NOT SET — the runtime sets it at its next start, on"), "closing --json": rendu("", sortiePar(1)), log: rendu("", sortiePar(1)) }).lire()) as Fiche[];
  const manager = lus.find(({ agent }) => agent === "manager") as Fiche;
  assert.equal(manager.settings.find(({ key }) => key === "manager-modele")?.value, "not read: `setting` failed");
  assert.equal(manager.settings.find(({ key }) => key === "paused")?.value, "not read: the project switch is not set, or its answer cannot be read");
  assert.deepEqual((lus.find(({ agent }) => agent === "closer") as Fiche).now?.map(({ value }) => value), ["not read"]);
  assert.equal(manager.state, "working on #4031");
  const ancien = (await geste({ setting: rendu("", sortiePar(66), "n'est pas une commande du runtime") }).lire()) as Fiche[];
  assert.equal((ancien.find(({ agent }) => agent === "manager") as Fiche).settings.find(({ key }) => key === "manager-modele")?.value, "not read: this station's runtime has no `setting` command — update it");
});

test("the project switch is read from its line, and the journal gives the last decision of each setting", () => {
  assert.deepEqual(interrupteurLu(SWITCH), { on: true, since: "2026-10-12T20:00:00.000Z", by: "chef" });
  assert.deepEqual(interrupteurLu("switch     OFF since 2026-10-13T09:30:00.000Z (by chef, on by default) — x"), { on: false, since: "2026-10-13T09:30:00.000Z", by: "chef" });
  assert.ok("sans" in interrupteurLu("switch     NOT SET — the runtime sets it at its next start, on"));
  const changements = changementsLus(`${JOURNAL}\nnot an event\n14  2026-10-13T00:00:00.000Z  parade  -  decision.withdrawn  chef  {"name":"BRIGADE_GATES_BUDGET_CPU_SECONDS","previous":"400"}\n15  2026-10-13T01:00:00.000Z  parade  -  decision.set  chef  {broken`);
  assert.deepEqual([...changements], [["BRIGADE_MANAGER_MODEL", { at: "2026-10-11T08:00:00.000Z", by: "chef" }], ["cooks", { at: "2026-10-12T18:00:00.000Z", by: "chef" }]]);
});

test("a setting is changed by the decision that `station` writes, and nothing else is launched for it", async () => {
  const { commandes, regler } = geste();
  assert.deepEqual(await regler("manager", "manager-modele", "opus"), { ok: true });
  assert.deepEqual(await regler("closer", "closer-tokens", "1000000"), { ok: true });
  assert.deepEqual(await regler("closer", "closer-cooks", "5"), { ok: true });
  assert.deepEqual(await regler("cooks", "places", "auto"), { ok: true });
  assert.deepEqual(await regler("pass", "budget-gates", "150"), { ok: true });
  assert.deepEqual(commandes.filter((commande) => commande.startsWith("station")), ["station manager-modele opus", "station closer-tokens 1000000", "station closer-cooks 5", "station cooks auto", "station budget-gates 150"]);
  // Chaque changement relit `setting` avant d'écrire, rien d'autre : pas un redémarrage.
  assert.deepEqual(commandes.filter((commande) => !commande.startsWith("station") && commande !== "setting"), []);
});

test("a value or a setting the app does not know is refused before anything is launched", async () => {
  const { commandes, regler } = geste();
  assert.equal((await regler("manager", "manager-modele", "gpt")).reason, "nothing was changed: “gpt” is not a value of this setting");
  assert.equal((await regler("manager", "manager-effort", "opus")).ok, false);
  assert.equal((await regler("closer", "closer-cooks", "0")).ok, false);
  assert.equal((await regler("closer", "closer-cooks", "3; rm -rf /")).ok, false);
  assert.equal((await regler("closer", "closer-cooks", 3)).ok, false);
  assert.equal((await regler("manager", "autonomy", "propose")).reason, "nothing was changed: this setting cannot be changed from the app");
  assert.equal((await regler("closer", "paused", "paused")).reason, "nothing was changed: this setting cannot be changed from the app");
  assert.equal((await regler("supervisor", "model", "opus")).ok, false);
  assert.equal((await regler("manager", "pass", "x")).ok, false);
  assert.deepEqual(commandes, []);
  assert.equal((await geste({}, { sansStation: true }).regler("manager", "manager-modele", "opus")).reason, "nothing was changed: “parade” has no station — there is no runtime to tell");
  assert.equal((await geste().regler("manager", "manager-modele", "opus", "gone")).reason, "nothing was changed: “gone” is no longer in the projects file");
});

test("a setting that the project's repository sets is not written: the runtime would ignore the decision", async () => {
  const { commandes, regler } = geste();
  const refuse = await regler("closer", "closer-modele", "opus");
  assert.equal(refuse.ok, false);
  assert.match(refuse.reason ?? "", /the project's repository sets this one \(\.claude\/brigade\/projet\.json\)/);
  assert.deepEqual(commandes, ["setting"]);
  // Écrite quand même — la lecture du dépôt a échoué —, la décision que le runtime dit ignorée ne passe pas pour réussie.
  const ignoree = await geste({ setting: rendu("", sortiePar(1)), "station closer-modele opus": rendu("brigade : closer-modele: opus (was: not set) — read by the runtime\nbut the project's repository sets it (projet.json: sonnet): this decision is ignored while it does") }).regler("closer", "closer-modele", "opus");
  assert.equal(ignoree.ok, false);
  assert.match(ignoree.reason ?? "", /the runtime ignores the decision while it does/);
});

test("a decision the runtime refuses, or a runtime without the command, says why in one line", async () => {
  const refus = await geste({ "station manager-modele opus": rendu("", sortiePar(1), "brigade : empty log: the runtime has never started on this state directory\n") }).regler("manager", "manager-modele", "opus");
  assert.deepEqual([refus.ok, refus.reason], [false, "nothing was changed: empty log: the runtime has never started on this state directory"]);
  assert.match(refus.detail ?? "", /empty log/);
  const muet = await geste({ "station manager-modele opus": rendu("", sortiePar(1), "") }).regler("manager", "manager-modele", "opus");
  assert.equal(muet.reason, "nothing was changed: the runtime refused it");
  const ancien = await geste({ "station manager-modele opus": rendu("", sortiePar(66), "n'est pas une commande du runtime") }).regler("manager", "manager-modele", "opus");
  assert.equal(ancien.reason, "nothing was changed: this station's runtime cannot take this decision — update it");
});

test("the pause is the project switch: `switch off` goes, switching on again does not", async () => {
  const { commandes, regler } = geste();
  for (const agent of ["manager", "cooks", "pass"]) assert.deepEqual(await regler(agent, "paused", "paused"), { ok: true }, agent);
  assert.deepEqual(commandes, ["switch off", "switch off", "switch off"]);
  assert.equal((await regler("manager", "paused", "running")).reason, "nothing was changed: switching the project on again asks you first — use the switch at the head of the page");
  assert.equal(commandes.length, 3);
  const refuse = await geste({ "switch off": rendu("", sortiePar(1), "brigade : empty log") }).regler("manager", "paused", "paused");
  assert.deepEqual([refuse.ok, refuse.reason], [false, "nothing was changed: the runtime refused to pause the project"]);
  const ancien = await geste({ "switch off": rendu("", sortiePar(66), "is not a runtime command") }).regler("manager", "paused", "paused");
  assert.equal(ancien.reason, "nothing was changed: this station's runtime has no `switch` command — update it");
});
