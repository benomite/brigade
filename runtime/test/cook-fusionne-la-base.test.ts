// #3789 : les renvois (« the PR conflicts with the base ») pèsent le plus dans
// le temps perdu. La consigne du cook lui demande de fusionner la base avant
// ses gates finales (`git merge origin/<base>`), mais le binaire lui interdit
// `git merge` : il ne peut pas obéir, livre en conflit, et la livraison revient.
// La cause est corrigée là où elle naît : ce que la consigne demande, le cook
// peut le faire.
import assert from "node:assert/strict";
import { test } from "node:test";
import { argumentsClaude, consigne } from "../src/claude.ts";

const CALIBRAGE = { model: "sonnet", effort: "medium" };

const interdits = () => {
  const args = argumentsClaude(CALIBRAGE);
  return args.slice(args.indexOf("--disallowedTools") + 1);
};

test("la consigne demande au cook de fusionner la base, et git merge ne lui est pas interdit", () => {
  const texte = consigne({ ticket: 14, titre: "un ticket", depot: "o/r", base: "main" });
  assert.match(texte, /git merge origin\/main/);
  assert.ok(!interdits().includes("Bash(git merge:*)"), "le cook doit pouvoir lancer la fusion que sa consigne lui demande");
});
