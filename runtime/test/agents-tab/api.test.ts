// The Agents tab's answers (#4220), past what the acceptance tests of test/acceptation-4220/ hold: the figures over the
// last 7 days, the cooks' threads gathered, the next run, and every reading that is missing or cannot be read.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { repondre, type Sources } from "../../src/agents-tab/api.ts";
import { consignerGeste, OUTCOME, type Outcome } from "../../src/autonomie/agents/gestes.ts";
import { HoraireIllisible } from "../../src/autonomie/agents/prochain-passage.ts";
import { REGISTRE } from "../../src/agents-tab/registre.ts";
import { ROLES } from "../../src/roles-cuisine/roles.ts";
import { repertoireTemporaire } from "../outils.ts";

type Chiffre = { label: string; value: number | string; meaning: string };
type EntreeDAgent = { id: string; state: string; workingOn: number | null; nextRun: string | null; figures: Chiffre[] };
type GesteDuFil = { at: string; summary: string; reason: string; issue: number | null };

const MAINTENANT = new Date("2026-11-25T12:00:00.000Z");
const ilYA = (jours: number) => () => new Date(MAINTENANT.getTime() - jours * 24 * 3_600_000);
const liste = (sources: Partial<Sources> = {}) => repondre({ method: "GET", url: "/api/agents" }, { maintenant: MAINTENANT, ...sources }).corps as EntreeDAgent[];
const de = (id: string, sources: Partial<Sources> = {}) => liste(sources).find((agent) => agent.id === id) as EntreeDAgent;
const valeurs = (figures: Chiffre[]) => figures.map(({ value }) => value);
const gestes = (id: string, sources: Partial<Sources>) => repondre({ method: "GET", url: `/api/agents/${id}/gestures` }, { maintenant: MAINTENANT, ...sources });
const noter = (dossier: string, agent: string, line: string, outcome: Outcome, quand: () => Date) => consignerGeste(dossier, agent, { line, reason: `why ${line}`, outcome }, quand);

test("the figures count the thread's gestures of the last 7 days, fixed by itself then handed to the chef", (t) => {
  const dossier = repertoireTemporaire(t);
  noter(dossier, "closer", "pruned a dead export", OUTCOME.FIXED_BY_SELF, ilYA(2));
  noter(dossier, "closer", "removed a duplicate", OUTCOME.FIXED_BY_SELF, ilYA(6.9));
  noter(dossier, "closer", "an old cleanup", OUTCOME.FIXED_BY_SELF, ilYA(7));
  noter(dossier, "closer", "asked about a big removal", OUTCOME.HANDED_TO_CHEF, ilYA(1));
  noter(dossier, "closer", "would have pruned", OUTCOME.NOT_DONE, ilYA(1));
  noter(dossier, "manager", "split an epic", OUTCOME.HANDED_TO_CHEF, ilYA(1));
  const closer = de("closer", { repertoireDesGestes: dossier });
  assert.deepEqual(closer.figures.map(({ label }) => label), ["Fixed by itself", "Handed to the chef", "Lines removed"]);
  assert.deepEqual(valeurs(closer.figures).slice(0, 2), [2, 1]);
  assert.deepEqual(valeurs(de("manager", { repertoireDesGestes: dossier }).figures), [0, 1]);
  assert.deepEqual(valeurs(de("supervisor", { repertoireDesGestes: dossier }).figures), [0, 0]);
});

test("the cooks' entry gathers the thread of every cook, each gesture with its ticket; another agent's gestures stay its own", (t) => {
  const dossier = repertoireTemporaire(t);
  noter(dossier, "cook #12", "relaunched its gates", OUTCOME.FIXED_BY_SELF, ilYA(3));
  noter(dossier, "closer", "pruned a dead export", OUTCOME.FIXED_BY_SELF, ilYA(2));
  noter(dossier, "cook #15", "asked for an access", OUTCOME.HANDED_TO_CHEF, ilYA(1));
  assert.deepEqual(valeurs(de("cook", { repertoireDesGestes: dossier }).figures), [1, 1]);
  const cooks = gestes("cook", { repertoireDesGestes: dossier });
  assert.equal(cooks.statut, 200);
  assert.deepEqual(cooks.corps, [
    { at: ilYA(1)().toISOString(), summary: "asked for an access", reason: "why asked for an access", issue: 15 },
    { at: ilYA(3)().toISOString(), summary: "relaunched its gates", reason: "why relaunched its gates", issue: 12 },
  ] satisfies GesteDuFil[]);
  assert.deepEqual(gestes("closer", { repertoireDesGestes: dossier }).corps, [{ at: ilYA(2)().toISOString(), summary: "pruned a dead export", reason: "why pruned a dead export", issue: null }]);
  assert.deepEqual(gestes("triage", { repertoireDesGestes: dossier }), { statut: 200, corps: [] });
});

test("the closer's third figure adds the lines its passes removed in the last 7 days; its passes not read are said, never a zero", () => {
  const passesDuCloser = [ilYA(7), ilYA(6.9), ilYA(1)].map((quand, rang) => ({ at: quand().toISOString(), removedLines: [500, 30, 12][rang] as number }));
  const [, , lignes] = de("closer", { passesDuCloser }).figures;
  assert.deepEqual(lignes, { label: "Lines removed", value: 42, meaning: "lines of code its closing passes removed, last 7 days" });
  assert.deepEqual(de("closer").figures[2], { label: "Lines removed", value: "not known", meaning: "lines of code its closing passes removed, last 7 days — its passes were not read" });
  for (const id of ["manager", "pass", "cook"]) assert.equal(de(id, { passesDuCloser }).figures.length, 2, id);
});

test("a thread that was not read is said in the figures, never a zero, and its gestures answer 503", () => {
  for (const { value, meaning } of de("closer").figures.slice(0, 2)) {
    assert.equal(value, "not known");
    assert.match(meaning, /its thread was not read/);
  }
  assert.equal(gestes("closer", {}).statut, 503);
});

test("a thread that cannot be read is said in the figures, and its gestures answer 500 with the reason", (t) => {
  const dossier = repertoireTemporaire(t);
  writeFileSync(join(dossier, "autonomy-gestures.json"), "not json");
  for (const { value, meaning } of de("closer", { repertoireDesGestes: dossier }).figures.slice(0, 2)) {
    assert.equal(value, "cannot be read");
    assert.match(meaning, /cannot be read/);
  }
  const reponse = gestes("closer", { repertoireDesGestes: dossier });
  assert.equal(reponse.statut, 500);
  assert.match((reponse.corps as { reason: string }).reason, /autonomy-gestures\.json cannot be read/);
});

test("working gives the ticket of the run that has one, null for a run on no ticket; a run goes before a failure", () => {
  assert.deepEqual(de("closer", { enCours: [{ id: "closer", ticket: null }] }), { ...de("closer"), state: "working", workingOn: null });
  const pass = de("pass", { enCours: [{ id: "pass", ticket: null }, { id: "pass", ticket: 15 }, { id: "manager", ticket: 3 }], enEchec: ["pass"] });
  assert.equal(pass.state, "working");
  assert.equal(pass.workingOn, 15);
  assert.equal(de("closer", { enCours: [{ id: "manager", ticket: 3 }], enEchec: ["manager"] }).state, "idle");
});

test("the next run is the noted schedule's instant; none noted, none kept or one that cannot be read gives null", () => {
  const horaires = (id: string) => {
    if (id === "closer") return { at: new Date("2026-11-26T03:00:00.000Z") };
    if (id === "supervisor") throw new HoraireIllisible("unreadable");
    return id === "manager" ? null : undefined;
  };
  assert.deepEqual(liste({ horaires }).map(({ id, nextRun }) => [id, nextRun]).filter(([, nextRun]) => nextRun !== null), [["closer", "2026-11-26T03:00:00.000Z"]]);
  assert.equal(de("closer").nextRun, null);
  assert.throws(() => liste({ horaires: () => { throw new Error("boom"); } }), /boom/);
});

test("only GET is served; a path the tab does not read answers 404, and a query string is ignored", () => {
  assert.equal(repondre({ method: "PUT", url: "/api/agents" }, { maintenant: MAINTENANT }).statut, 405);
  assert.equal(repondre({ method: "GET", url: "/api/agent" }, { maintenant: MAINTENANT }).statut, 404);
  assert.equal(repondre({ method: "GET", url: "/api/agents/closer/settings" }, { maintenant: MAINTENANT }).statut, 404);
  assert.equal(repondre({ method: "GET", url: "/api/agents?fresh=1" }, { maintenant: MAINTENANT }).statut, 200);
});

test("a role of the kitchen keeps its own sentence in the registry", () => {
  for (const [id, role] of [["manager", "manager"], ["triage", "triage"], ["reviewer", "reviewer"], ["second-judge", "second judge"], ["closer", "closer"]] as const) {
    assert.equal(REGISTRE.find((agent) => agent.id === id)?.role, ROLES.find((une) => une.role === role)?.does, id);
  }
});
