// Les fiches de l'onglet Agents (#4117), composées de ce que les commandes du runtime rendent : un enregistrement par agent
// de la cuisine — aucun oublié —, son rôle, son état et sa prochaine passe, ses chiffres des sept derniers jours avec leur
// sens, ses réglages — ce qui se change d'ici, ce qui dit où il vit —, et ses derniers gestes. Ce qui ne se lit pas se dit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { reglagesVus } from "../../src/reglages-du-projet.ts";
import { fichesDesAgents, type Fiche, type Lectures } from "../../src/vue/agents/fiches.ts";
import { changementsLus, interrupteurLu } from "../../src/vue/agents/agents-box.ts";
import { FAITS, FERMETURE, JOURNAL, MAINTENANT, SETTING, SWITCH, SWITCH_ETEINT } from "./faits-fixture.ts";

const lectures = (plus: Partial<Lectures> = {}): Lectures => ({
  maintenant: MAINTENANT,
  faits: FAITS,
  reglages: reglagesVus(SETTING) ?? { sans: "settings not readable" },
  interrupteur: interrupteurLu(SWITCH),
  fermeture: FERMETURE,
  changements: changementsLus(JOURNAL),
  ...plus,
});
const fiche = (fiches: Fiche[], agent: string): Fiche => fiches.find((un) => un.agent === agent) ?? assert.fail(`no agent ${agent}`);
const reglage = (un: Fiche, cle: string) => un.settings.find((r) => r.key === cle) ?? assert.fail(`no setting ${cle} on ${un.agent}`);

test("every agent of the kitchen is there, in the order the chef reads them, and one the runtime names more comes last", () => {
  const avecUnDeTrop = { ...FAITS, rolesCuisine: [...FAITS.rolesCuisine, { role: "janitor", does: "Sweeps the worktrees.", latest: null }], agents: [...FAITS.agents, { role: "scribe", station: null, ticket: null, fait: "writing", depuis: "2026-10-13T10:00:00.000Z" }] };
  const noms = fichesDesAgents(lectures({ faits: avecUnDeTrop })).map(({ agent }) => agent);
  assert.deepEqual(noms, ["second", "manager", "cooks", "pass", "reviewer", "second judge", "triage", "closer", "supervisor", "janitor", "scribe"]);
});

test("an agent the runtime names that the app does not know is told with what the runtime says of it, never as a blank", () => {
  const avec = { ...FAITS, rolesCuisine: [...FAITS.rolesCuisine, { role: "janitor", does: "Sweeps the worktrees.", latest: { what: "swept 3 worktrees", at: "2026-10-13T09:00:00.000Z" } }], equipe: [...FAITS.equipe, { ...FAITS.equipe[1], agent: "scout", state: "working on #4040", nextRun: { text: "scout: next run in 1 h", at: null }, autonomy: "propose", gestures: [{ at: "2026-10-13T09:00:00.000Z", line: "scouted #4040", reason: "new issue", outcome: "fixed by itself" }] }] };
  const fiches = fichesDesAgents(lectures({ faits: avec }));
  const janitor = fiche(fiches, "janitor");
  assert.deepEqual([janitor.role, janitor.state, janitor.gestures.map(({ line }) => line)], ["Sweeps the worktrees.", "not read: the runtime names it without a record", ["swept 3 worktrees"]]);
  // Un agent que l'équipe enregistre a ses états, son niveau et ses chiffres, comme les autres ; sa phrase manque, et la fiche le dit.
  assert.equal(fiche(fiches, "scout").role, "An agent the kitchen runs: the app has no description of it yet.");
  const scout = fiche(fiches, "scout");
  assert.deepEqual([scout.state, scout.nextRun.text, reglage(scout, "autonomy").value, scout.week[0]?.value], ["working on #4040", "scout: next run in 1 h", "propose", "1"]);
});

test("an entry of `agents` that is not a running role is left out, and the others are told as before", () => {
  const noms = fichesDesAgents(lectures({ faits: { ...FAITS, agents: [...FAITS.agents, null, { ticket: 3 }, { role: 7 }, "x"] } })).map(({ agent }) => agent);
  assert.deepEqual(noms, ["second", "manager", "cooks", "pass", "reviewer", "second judge", "triage", "closer", "supervisor"]);
});

test("each agent says what it is for in one sentence, its state, and its next run", () => {
  const fiches = fichesDesAgents(lectures());
  for (const un of fiches) assert.ok(un.role !== "" && un.state !== "" && un.nextRun.text !== "", `${un.agent} is told in full`);
  assert.equal(fiche(fiches, "manager").state, "working on #4031");
  assert.equal(fiche(fiches, "closer").nextRun.text, "closer: next pass in 3 h");
  assert.equal(fiche(fiches, "supervisor").nextRun.at, "2026-10-13T11:40:00.000Z");
  assert.equal(fiche(fiches, "cooks").state, "working on #4029, #4031");
  assert.match(fiche(fiches, "cooks").role, /design work is done by the same cooks/);
  // Le reviewer n'a pas d'enregistrement à lui : il suit la pass, et sa dernière action est son geste.
  assert.equal(fiche(fiches, "reviewer").state, "working on #4030");
  assert.deepEqual(fiche(fiches, "reviewer").gestures, [{ at: "2026-10-13T09:50:00.000Z", line: "reviewed #4030: green, no finding", reason: "", outcome: "" }]);
  assert.equal(fiche(fiches, "triage").state, "idle");
});

test("the 7-day figures count the gestures of the week only, each with its meaning", () => {
  const manager = fiche(fichesDesAgents(lectures()), "manager");
  assert.deepEqual(manager.week.map(({ label, value }) => [label, value]), [["Done by itself", "1"], ["Left to you", "1"]]);
  for (const chiffre of manager.week) assert.ok(chiffre.meaning.includes("last 7 days"), `${chiffre.label} says its window`);
  // Un geste qui n'a été que dit — l'agent est sur observe — a son chiffre, avec son sens, et ne compte pour aucun autre.
  const closer = fiche(fichesDesAgents(lectures()), "closer");
  assert.deepEqual(closer.week.map(({ label, value }) => [label, value]), [["Done by itself", "0"], ["Left to you", "0"], ["Only reported", "1"]]);
  // Un geste d'il y a exactement sept jours est encore dans la semaine ; d'une seconde plus tôt, il n'y est plus.
  const au = (at: string) => fichesDesAgents(lectures({ faits: { ...FAITS, equipe: [{ ...FAITS.equipe[0], gestures: [{ at, line: "x", reason: "y", outcome: "fixed by itself" }] }] } }));
  assert.equal(fiche(au("2026-10-06T10:04:12.000Z"), "manager").week[0]?.value, "1");
  assert.equal(fiche(au("2026-10-06T10:04:11.999Z"), "manager").week[0]?.value, "0");
  // Le temps ordinaire d'un ticket chez un cook n'est dit qu'avec son sens ; sous trois séjours, il dit qu'il ne l'est pas.
  const cooks = fiche(fichesDesAgents(lectures()), "cooks");
  assert.deepEqual(cooks.week.map(({ label, value }) => [label, value]), [["Usual time with a cook", "42 min"]]);
  assert.deepEqual(fiche(fichesDesAgents(lectures()), "pass").week.at(-1), { label: "Usual time in the pass", value: "not enough yet", meaning: "the usual time a ticket stays in the pass is told once three tickets have been through it in 7 days" });
});

test("the closer's figures are told in plain words, each with its meaning", () => {
  const closer = fiche(fichesDesAgents(lectures()), "closer");
  assert.deepEqual(closer.now?.map(({ label, value }) => [label, value]), [["Merges since its last pass", "14"], ["Lines added for each line removed", "2.5 to 1"], ["Duplicated passages", "5"], ["Unused exports", "3"]]);
  for (const chiffre of closer.now ?? []) assert.ok(chiffre.meaning.length > 20, `${chiffre.label} says what it means`);
  const sans = (fermeture: unknown) => fiche(fichesDesAgents(lectures({ fermeture })), "closer").now?.map(({ value }) => value);
  assert.deepEqual(sans(null), ["not read"]);
  assert.deepEqual(sans({ configured: false }), ["no closer set"]);
  assert.deepEqual(sans({ configured: true, observation: { readable: false, mergesSinceCleanup: 9, error: "no such branch" } }), ["9", "not read"]);
  assert.deepEqual(sans({ configured: true, observation: { readable: true, mergesSinceCleanup: 9, ratio: [], duplicates: 0, deadExports: 0 } }), ["9", "none yet", "0", "0"]);
});

test("a setting the app changes offers its choices, the one in force among them, and says when and by whom it was changed", () => {
  const manager = fiche(fichesDesAgents(lectures()), "manager");
  const modele = reglage(manager, "manager-modele");
  assert.deepEqual([modele.label, modele.value, modele.options, modele.editable, modele.from], ["Model", "sonnet", ["opus", "sonnet", "haiku"], true, "set on the station"]);
  // La dernière décision posée dit quand ; l'auteur du journal, qui.
  assert.deepEqual([modele.changedAt, modele.changedBy], ["2026-10-11T08:00:00.000Z", "the chef"]);
  assert.equal(reglage(manager, "manager-effort").changedAt, undefined);
  assert.deepEqual(reglage(fiche(fichesDesAgents(lectures()), "cooks"), "places"), { key: "places", label: "Cooks at once", value: "4", options: ["auto", "1", "2", "3", "4", "6", "8"], editable: true, from: "set per station", changedAt: "2026-10-12T18:00:00.000Z", changedBy: "the chef" });
  // Une valeur ronde que la liste n'a pas s'y ajoute : rien de ce qui vaut ne se cache.
  const seize = fichesDesAgents(lectures({ faits: { ...FAITS, stations: [{ station: "a", plafond: 5 }] } }));
  assert.deepEqual(reglage(fiche(seize, "cooks"), "places").options, ["auto", "1", "2", "3", "4", "5", "6", "8"]);
  const deux = fichesDesAgents(lectures({ faits: { ...FAITS, stations: [{ station: "a", plafond: 2 }, { station: "b", plafond: null }] } }));
  assert.deepEqual([reglage(fiche(deux, "cooks"), "places").value, reglage(fiche(deux, "cooks"), "places").from], ["different", "its stations differ: 2, no limit"]);
  const gates = reglage(fiche(fichesDesAgents(lectures()), "pass"), "budget-gates-cpu");
  assert.deepEqual([gates.value, gates.from, gates.options], ["400", "set on the station", ["200", "400", "800", "1600"]]);
  assert.equal(reglage(fiche(fichesDesAgents(lectures()), "pass"), "budget-gates").from, "default");
});

test("a setting the project's repository sets says where it lives instead of offering a choice", () => {
  const closer = fiche(fichesDesAgents(lectures()), "closer");
  const modele = reglage(closer, "closer-modele");
  assert.deepEqual([modele.value, modele.editable, modele.options], ["sonnet", false, undefined]);
  assert.match(modele.livesIn ?? "", /project's repository \(\.claude\/brigade\/projet\.json\).*pull request/);
  assert.equal(reglage(closer, "closer-tokens").editable, true);
});

test("the autonomy level is shown and says where it lives: no command of the runtime sets it", () => {
  const fiches = fichesDesAgents(lectures());
  for (const agent of ["manager", "pass", "closer", "supervisor"]) {
    const niveau = reglage(fiche(fiches, agent), "autonomy");
    assert.equal(niveau.editable, false);
    assert.match(niveau.livesIn ?? "", /autonomy-levels\.json.*no command sets it yet/);
  }
  assert.equal(reglage(fiche(fiches, "closer"), "autonomy").value, "propose");
  assert.equal(reglage(fiche(fiches, "manager"), "autonomy").value, "act");
  assert.deepEqual([reglage(fiche(fiches, "manager"), "autonomy").value, fiche(fiches, "manager").settings.find((r) => r.label === "Autonomy for splitting an epic")?.value], ["act", "propose"]);
  // Le reviewer suit la pass ; les cooks disent leur niveau par l'un d'eux, et le disent non lu quand aucun ne tourne.
  assert.equal(reglage(fiche(fiches, "reviewer"), "autonomy").value, "act");
  assert.equal(reglage(fiche(fiches, "cooks"), "autonomy").value, "act");
  const sansCook = fichesDesAgents(lectures({ faits: { ...FAITS, equipe: FAITS.equipe.filter(({ agent }) => !agent.startsWith("cook")) } }));
  assert.equal(reglage(fiche(sansCook, "cooks"), "autonomy").value, "not read: no cook runs now, so none says its level");
  assert.equal(fiche(sansCook, "cooks").state, "idle");
});

test("the pause is the project switch for the agents it holds, and says so for the others", () => {
  const fiches = fichesDesAgents(lectures());
  for (const agent of ["manager", "cooks", "pass"]) {
    const pause = reglage(fiche(fiches, agent), "paused");
    assert.deepEqual([pause.value, pause.options, pause.editable, pause.changedAt, pause.changedBy], ["running", ["running", "paused"], true, "2026-10-12T20:00:00.000Z", "the chef"], agent);
  }
  for (const agent of ["closer", "supervisor", "reviewer", "triage"]) {
    const pause = reglage(fiche(fiches, agent), "paused");
    assert.deepEqual([pause.value, pause.editable], ["no switch of its own", false], agent);
    assert.match(pause.livesIn ?? "", /the project switch, which stops only the manager, the cooks and the pass/);
  }
  // Éteint, le projet ne se rallume pas d'ici : le geste demande confirmation, au-dessus de la page.
  const eteint = reglage(fiche(fichesDesAgents(lectures({ interrupteur: interrupteurLu(SWITCH_ETEINT) })), "manager"), "paused");
  assert.deepEqual([eteint.value, eteint.editable, eteint.options, eteint.changedAt], ["paused", false, undefined, "2026-10-13T09:30:00.000Z"]);
  assert.match(eteint.livesIn ?? "", /asks you first/);
});

test("what a reading could not give is said in the fiche, never filled in", () => {
  const sans = fichesDesAgents(lectures({ reglages: { sans: "the project's settings are not readable" }, interrupteur: { sans: "the project switch is not set" }, changements: { sans: "`log` failed" } }));
  const modele = reglage(fiche(sans, "manager"), "manager-modele");
  assert.deepEqual([modele.value, modele.editable], ["not read: the project's settings are not readable", false]);
  assert.equal(reglage(fiche(sans, "manager"), "paused").value, "not read: the project switch is not set");
  // Les décisions que le runtime ne publie pas ne sont pas lues de la boîte : le budget des gates, lui, vient de `facts`.
  assert.equal(reglage(fiche(sans, "pass"), "budget-gates").value, "100");
  assert.equal(reglage(fiche(sans, "pass"), "budget-gates").changedAt, undefined);
  const illisible = fichesDesAgents(lectures({ faits: { equipe: { illisible: "autonomy-gestures.json cannot be read" } } }));
  assert.equal(fiche(illisible, "manager").state, "broken: autonomy-gestures.json cannot be read");
  assert.equal(fiche(illisible, "cooks").state, "broken: autonomy-gestures.json cannot be read");
  const ancien = fichesDesAgents(lectures({ faits: {} }));
  assert.equal(fiche(ancien, "closer").state, "not read: this runtime does not publish its agents yet");
  assert.equal(reglage(fiche(ancien, "pass"), "budget-gates").value, "not read: the runtime does not give the gates budget");
  assert.equal(reglage(fiche(ancien, "cooks"), "places").value, "not read: no station is declared");
  // Un enregistrement qui ne se lit pas garde son agent dans la liste.
  const abime = fichesDesAgents(lectures({ faits: { ...FAITS, equipe: [{ agent: "manager", state: 3 }, ...FAITS.equipe.slice(1)] } }));
  assert.equal(fiche(abime, "manager").state, "not read: the record of manager cannot be read");
});

test("the second is told too, with where its own settings live", () => {
  const second = fiche(fichesDesAgents(lectures()), "second");
  assert.equal(second.week.length, 0);
  assert.match(reglage(second, "model").livesIn ?? "", /Claude Code on this computer/);
  assert.equal(second.settings.every(({ editable }) => !editable), true);
  assert.equal(second.settings.some(({ key }) => key === "autonomy"), false, "the second makes no gesture of its own: it has no level");
});
