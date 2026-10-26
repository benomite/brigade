// Les réglages des gates que porte le dépôt du projet (#1672) : les quatre
// budgets, le plafond de durée des gates et l'attente de la CI, dans
// `.claude/brigade/projet.json`. Le fichier les accepte et refuse ce qui n'en
// est pas ; ils passent avant ce que la box tenait, et sans le fichier, la box
// (les gestes `station budget-*`) reste ce qui vaut.
import assert from "node:assert/strict";
import { test } from "node:test";
import { environnementDecide } from "../../src/decisions.ts";
import { configPass } from "../../src/pass.ts";
import { appliquerLeChangement, changementsDits } from "../../src/reglages-projet/proposer.ts";
import { variablesDesGatesDuDepot } from "../../src/reglages-projet/en-vigueur.ts";
import { ReglageRefuse, reglagesDuTexte, texteDuFichier, validerReglagesProjet, type ReglagesProjet } from "../../src/reglages-projet/reglages.ts";
import { lireBudget, lireBudgetDeLaBase } from "../../src/cout-des-gates.ts";

const AVEC_GATES: ReglagesProjet = {
  integrationBranch: "v2",
  gates: { durationBudgetSeconds: 400, processorBudgetSeconds: 900, baseDurationBudgetSeconds: 1200, baseProcessorBudgetSeconds: 3000, timeoutSeconds: 1500, ciWaitSeconds: 2400 },
};

function refus(reglages: unknown): ReglageRefuse {
  try {
    validerReglagesProjet(reglages);
  } catch (erreur) {
    if (erreur instanceof ReglageRefuse) return erreur;
    throw erreur;
  }
  assert.fail(`accepté : ${JSON.stringify(reglages)}`);
}

test("projet.json accepts the gates' settings, in one fixed form, each optional", () => {
  const texte = texteDuFichier(AVEC_GATES);
  assert.deepEqual(reglagesDuTexte(texte), AVEC_GATES);
  assert.match(texte, /"gates": \{\n {4}"durationBudgetSeconds": 400,/);
  assert.deepEqual(validerReglagesProjet({ integrationBranch: "v2", gates: { ciWaitSeconds: 60 } }), { integrationBranch: "v2", gates: { ciWaitSeconds: 60 } });
  assert.deepEqual(validerReglagesProjet({ integrationBranch: "v2", gates: {} }), { integrationBranch: "v2" });
});

test("an unknown or invalid setting of the gates is refused, and named", () => {
  assert.equal(refus({ integrationBranch: "v2", gates: 3 }).cle, "gates");
  assert.equal(refus({ integrationBranch: "v2", gates: { speed: 3 } }).cle, "gates.speed");
  for (const valeur of [0, -1, 1.5, "60", null]) {
    const lu = refus({ integrationBranch: "v2", gates: { timeoutSeconds: valeur } });
    assert.deepEqual([lu.motif, lu.cle], ["invalide", "gates.timeoutSeconds"]);
  }
});

test("a proposed change sets or withdraws the gates' settings one by one, and keeps the others", () => {
  const change = appliquerLeChangement(AVEC_GATES, { gates: { timeoutSeconds: 600, ciWaitSeconds: null } });
  const apres = validerReglagesProjet(change);
  assert.equal(apres.gates?.timeoutSeconds, 600);
  assert.equal(apres.gates?.ciWaitSeconds, undefined);
  assert.equal(apres.gates?.durationBudgetSeconds, 400);
  assert.deepEqual(changementsDits(AVEC_GATES, apres), ["gates' `timeoutSeconds`: 1500 → 600", "gates' `ciWaitSeconds`: 2400 → none"]);
});

test("what the repository sets wins over the box, setting by setting; without it, the box's decisions and defaults stand", () => {
  const posees = { BRIGADE_GATES_BUDGET_SECONDS: "111", BRIGADE_GATES_BASE_BUDGET_SECONDS: "222" };
  const sansDepot = environnementDecide({}, posees as never, null);
  assert.equal(lireBudget(sansDepot).durationSeconds, 111);
  assert.equal(lireBudgetDeLaBase(sansDepot).durationSeconds, 222);

  const duDepot = environnementDecide({}, posees as never, { integrationBranch: "v2", gates: { durationBudgetSeconds: 400, baseProcessorBudgetSeconds: 3000 } });
  assert.equal(lireBudget(duDepot).durationSeconds, 400);
  assert.equal(lireBudget(duDepot).parLeChef.durationSeconds, true);
  assert.equal(lireBudgetDeLaBase(duDepot).durationSeconds, 222, "a setting the file leaves out stays the box's");
  assert.equal(lireBudgetDeLaBase(duDepot).cpuSeconds, 3000);
});

test("the gates timeout and the CI wait come from the repository over the environment, and from the environment without it", () => {
  const env = { BRIGADE_GATES_TIMEOUT_SECONDS: "100", BRIGADE_CI_WAIT_SECONDS: "200" };
  assert.deepEqual(configPass({ ...env, ...variablesDesGatesDuDepot(null) }), { delaiGatesMs: 100_000, attenteCiMs: 200_000 });
  assert.deepEqual(configPass({ ...env, ...variablesDesGatesDuDepot({ integrationBranch: "v2", gates: { timeoutSeconds: 1500 } }) }), { delaiGatesMs: 1_500_000, attenteCiMs: 200_000 });
});
