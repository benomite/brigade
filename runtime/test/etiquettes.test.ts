// Le catalogue des labels (#3032) : chacun a un nom et une description en anglais.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ANCIEN_NOM_DE_SERVED_ELSEWHERE as ANCIEN, ETIQUETTES, LABELS_RENOMMES, planDesLabels } from "../src/etiquettes.ts";
import { motsFrancaisDans } from "./aides/glossaire.ts";

const ATTENDUS = [
  "product", "design", "triage", "blocked-on-human", "feature", "fix", "tech", "prio:0", "prio:1", "prio:2", "prio:3", "fire",
  "model:opus", "model:sonnet", "model:haiku", "effort:low", "effort:medium", "effort:high", "effort:xhigh", "effort:max",
  "decision", "epic", "served-elsewhere", "taken", "in-pass", "waiting", "chef-todo", "product-question", "cook:design", "kitchen-board",
];

test("le catalogue porte chaque label du projet, une fois", () => {
  assert.deepEqual(ETIQUETTES.map(({ name }) => name).sort(), [...ATTENDUS].sort());
  assert.equal(new Set(ETIQUETTES.map(({ name }) => name)).size, ETIQUETTES.length);
});

test("chaque label a une description non vide, en anglais : ni accent ni mot français du glossaire", () => {
  for (const { name, description } of ETIQUETTES) {
    assert.ok(description.trim().length > 0, `${name} has no description`);
    assert.doesNotMatch(description, /[àâäçéèêëîïôöùûüÿœæ]/i, `${name}: accented characters in “${description}”`);
    assert.deepEqual(motsFrancaisDans([description]), [], `${name}: French words in “${description}”`);
  }
});

test("aucun nom du catalogue n'est un ancien nom", () => {
  for (const ancien of Object.keys(LABELS_RENOMMES)) assert.ok(!ETIQUETTES.some(({ name }) => name === ancien));
  assert.ok(ETIQUETTES.some(({ name }) => name === LABELS_RENOMMES[ANCIEN]));
});

test("le plan : rien à faire sur un dépôt conforme, un ancien nom renommé, la description corrigée", () => {
  const conformes = ETIQUETTES.map(({ name, description }) => ({ name: name.toUpperCase(), description }));
  assert.deepEqual(planDesLabels(conformes), { renommer: [], creer: [], corriger: [] });

  const lus = [...conformes.filter(({ name }) => name !== "SERVED-ELSEWHERE" && name !== "FIX"), { name: ANCIEN, description: "Ce ticket ne se sert pas ici" }, { name: "FIX", description: "Correction" }];
  const plan = planDesLabels(lus);
  assert.deepEqual(plan.renommer.map(({ de, vers }) => [de, vers.name]), [[ANCIEN, "served-elsewhere"]]);
  assert.deepEqual(plan.corriger.map(({ name }) => name), ["fix"]);
  assert.deepEqual(plan.creer, []);
});

test("l'ancien nom dont le nouveau est déjà là n'est pas renommé", () => {
  const lus = [...ETIQUETTES.map(({ name, description }) => ({ name, description })), { name: ANCIEN, description: null }];
  assert.deepEqual(planDesLabels(lus), { renommer: [], creer: [], corriger: [] });
});
