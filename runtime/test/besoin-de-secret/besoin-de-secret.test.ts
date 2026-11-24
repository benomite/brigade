// Le besoin d'un secret ou d'un compte sur la station (#4041) : lu tel, c'est une carte du chef qui le dit dans sa tête,
// et la station ne la retire jamais comme un geste git, même quand elle nomme la branche du cook.
import assert from "node:assert/strict";
import { test } from "node:test";
import { besoinDeSecret } from "../../src/besoin-de-secret.ts";
import { corpsDeLaCarte } from "../../src/blocage-au-manager.ts";
import { carteDeGesteGit } from "../../src/conflit-main/renvoi.ts";

test("an API key, a database URL, a password, an account or a login on the station is a secret or account need", () => {
  for (const texte of [
    "add the OpenRouter API key to the station's local environment file",
    "set the preprod database URL in .env",
    "put DATABASE_URL in the station's environment",
    "the Sentry auth token is missing",
    "create an account on the staging server",
    "I need a login for the partner's back office",
    "the SMTP password",
  ]) {
    assert.equal(besoinDeSecret(texte), true, texte);
  }
});

test("a git gesture, a product question, « into account » or an account that exists is no secret or account need", () => {
  for (const texte of [
    "merge origin/main into cook/12-github and resolve the conflicts",
    "rebase the branch on main",
    "Which screen keeps the laps, taking the history into account?",
    "Run `gh auth refresh -s project` under the station's account",
  ]) {
    assert.equal(besoinDeSecret(texte), false, texte);
  }
});

test("the card of a secret need says so in its head and body; a gesture or a question card is unchanged", () => {
  const secret = corpsDeLaCarte({ station: "box", questionEn: null, avis: { issue: "geste", geste: "add the OpenRouter API key" }, secret: true });
  assert.match(secret, /^\*\*Gesture for the chef \(secret or account\):\*\* add the OpenRouter API key\n/);
  assert.match(secret, /needs a secret or an account on the station/);
  assert.match(secret, /not relaunched while this card waits/);
  const geste = corpsDeLaCarte({ station: "box", questionEn: null, avis: { issue: "geste", geste: "plug the test phone in" } });
  assert.match(geste, /^\*\*Gesture for the chef:\*\* plug the test phone in\n/);
  assert.match(geste, /only the chef can make this gesture/);
  assert.doesNotMatch(geste, /secret/);
  const produit = corpsDeLaCarte({ station: "box", questionEn: null, avis: { issue: "produit", question: "Which screen keeps the laps?" } });
  assert.match(produit, /^\*\*Question for the chef \(product\):\*\* Which screen keeps the laps\?\n/);
  assert.match(produit, /it is a product decision, only the chef makes it/);
});

test("a chef card asking for a secret or an account is never read as a git gesture, even when it names the cook's branch", () => {
  assert.equal(carteDeGesteGit("**Gesture for the chef (secret or account):** add the OpenRouter API key, then rebase cook/894-github on the base"), false);
  // Posée avant #4041, sans la marque dans sa tête : ses mots suffisent.
  assert.equal(carteDeGesteGit("**Gesture for the chef:** add the preprod database URL to the station, then rebase cook/894-github"), false);
  assert.equal(carteDeGesteGit("**Gesture for the chef:** rebase cook/894-github on origin/main"), true);
});
