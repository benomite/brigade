// #4222 : ce que le runtime lit vraiment — les décisions qu'il suit (decisions.ts) et la porte des gestes — prend la
// valeur posée depuis l'app à la lecture suivante, sur la même instance, sans redémarrage.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { createAgentSettings, current } from "../../src/agent-settings/index.ts";
import { magasinDeNiveaux } from "../../src/autonomie/agents/niveaux.ts";
import { OUTCOME } from "../../src/autonomie/agents/gestes.ts";
import { porteDesGestes } from "../../src/autonomie/agents/porte.ts";
import { poserDecision, suivreDecisions } from "../../src/decisions.ts";
import { ouvrirJournal } from "../../src/journal.ts";

function cuisine(t: TestContext) {
  const stateDir = mkdtempSync(join(tmpdir(), "agent-settings-"));
  const journal = ouvrirJournal(stateDir);
  t.after(() => journal.fermer());
  const decisions: Record<string, string> = {
    BRIGADE_MANAGER_MODEL: "sonnet",
    BRIGADE_MANAGER_EFFORT: "medium",
    BRIGADE_REVIEWER_MODEL: "haiku",
    BRIGADE_REVIEWER_EFFORT: "medium",
    BRIGADE_DRIFT_TICKET_TOKENS: "500000",
  };
  for (const [nom, valeur] of Object.entries(decisions)) poserDecision(journal, { projet: "brigade", nom, valeur, auteur: "chef" });
  const settings = createAgentSettings({ stateDir, env: {}, project: "brigade" });
  const avertis: string[] = [];
  const suivies = suivreDecisions(journal.base, {}, (message) => avertis.push(message), undefined, () => settings.overrides());
  return { stateDir, settings, suivies, avertis };
}

const put = (settings: ReturnType<typeof createAgentSettings>, agent: string, key: string, value: unknown) =>
  settings.handle({ method: "PUT", path: `/api/agents/${agent}/settings`, body: { key, value }, author: "chef" });

test("the manager's and the reviewer's calibration and the drift thresholds, set from the app, hold at the runtime's next read", async (t) => {
  const { settings, suivies } = cuisine(t);
  assert.deepEqual(suivies.manager(), { model: "sonnet", effort: "medium" });
  assert.deepEqual(suivies.reviewer(), { model: "haiku", effort: "medium" });
  assert.equal(suivies.seuils().ticketTokens, 500_000);
  assert.equal(suivies.seuils().lostTokens, null);

  for (const [agent, key, value] of [["manager", "model", "opus"], ["manager", "effort", "low"], ["reviewer", "model", "sonnet"], ["reviewer", "effort", "max"], ["closer", "driftTicketTokens", 300_000], ["closer", "driftLostTokens", 1000], ["closer", "driftGatesSeconds", 42.5]] as const) {
    assert.equal((await put(settings, agent, key, value)).status, 200, `${agent}/${key}`);
  }
  assert.deepEqual(suivies.manager(), { model: "opus", effort: "low" });
  assert.deepEqual(suivies.reviewer(), { model: "sonnet", effort: "max" });
  assert.deepEqual(suivies.seuils(), { ticketTokens: 300_000, lostTokens: 1000, gatesSeconds: 42.5 });
  // The pass's reviewer, given as a reader, is read at each review.
  assert.deepEqual(current(() => suivies.reviewer()), { model: "sonnet", effort: "max" });
  assert.deepEqual(current({ model: "haiku", effort: "low" }), { model: "haiku", effort: "low" });
});

test("an autonomy level set from the app is the one the gate of the gestures reads next", async (t) => {
  const { stateDir, settings } = cuisine(t);
  assert.equal(magasinDeNiveaux(stateDir).lire("brigade").closer, "propose");
  assert.equal((await put(settings, "closer", "autonomy", "act")).status, 200);
  assert.equal((await put(settings, "manager", "splitEpicAutonomy", "propose")).status, 200);
  const levels = magasinDeNiveaux(stateDir).lire("brigade");
  assert.equal(levels.closer, "act");
  assert.equal(levels["manager split-epic"], "propose");
  // The gate itself: a closer on `observe` only logs what it would do.
  assert.equal((await put(settings, "closer", "autonomy", "observe")).status, 200);
  const porte = porteDesGestes({ repertoire: stateDir, projet: "brigade", horloge: () => new Date(), avertir: () => {} });
  let fait = false;
  const passage = await porte.passer({ agent: "closer", reglable: "closer" }, { line: "close #1", reason: "served", outcome: OUTCOME.FIXED_BY_SELF }, () => (fait = true));
  assert.equal(passage.etat, "observed");
  assert.equal(fait, false);
  // Another project's levels are its own.
  assert.equal(magasinDeNiveaux(stateDir).lire("other").closer, "propose");
});

test("a settings file that cannot be read: the runtime keeps to what it read, and says so", async (t) => {
  const { stateDir, settings, suivies, avertis } = cuisine(t);
  assert.equal((await put(settings, "manager", "model", "opus")).status, 200);
  assert.equal(suivies.manager().model, "opus");
  writeFileSync(join(stateDir, "agent-settings.json"), "{not json");
  assert.equal(suivies.manager().model, "opus");
  assert.ok(avertis.some((message) => /agent-settings\.json cannot be read/.test(message)), avertis.join("\n"));
});
