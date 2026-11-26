// Test d'acceptation gelé (#4276), critère 2. Le contrat que ce test fixe, parce que le ticket le laisse ouvert :
// `runtime/src/cook-humain/marquer.ts` exporte `LABEL_COOK_HUMAIN` (= "human-cook") et
// `marquerPourUnHumain({ ticket, login, github })` où `github` porte `ajouterLabel(ticket, label)`, `assigner(ticket, login)`
// et `commenter(ticket, corps)` (async, injectables).
import assert from "node:assert/strict";
import { test } from "node:test";
import { LABEL_COOK_HUMAIN, marquerPourUnHumain } from "../../src/cook-humain/marquer.ts";

test("marking a ticket for a human adds the label and the assignee and posts one friendly comment, with no fault wording", async () => {
  const appels: Array<[string, ...unknown[]]> = [];
  const github = {
    ajouterLabel: async (...a: unknown[]) => void appels.push(["label", ...a]),
    assigner: async (...a: unknown[]) => void appels.push(["assignee", ...a]),
    commenter: async (...a: unknown[]) => void appels.push(["comment", ...a]),
  };
  await marquerPourUnHumain({ ticket: 4300, login: "alice", github });
  assert.equal(LABEL_COOK_HUMAIN, "human-cook");
  assert.deepEqual(appels.filter(([k]) => k === "label").map(([, t, l]) => [t, l]), [[4300, "human-cook"]]);
  assert.deepEqual(appels.filter(([k]) => k === "assignee").map(([, t, l]) => [t, l]), [[4300, "alice"]]);
  const commentaires = appels.filter(([k]) => k === "comment");
  assert.equal(commentaires.length, 1);
  const corps = String(commentaires[0][2]);
  assert.match(corps, /alice/);
  assert.match(corps, /your (work|ticket)|this ticket is yours|is yours/i);
  assert.doesNotMatch(corps, /fail|fault|error|escalat|blocked-on-human|mistake|wrong/i);
});
