import assert from "node:assert/strict";
import { test } from "node:test";
import { DIT_L_ARRET_DU_BAC, natureDeLArret } from "../../src/bac-a-sable/nature-arret.ts";

test("un refus de port du bac à sable n'est pas un geste git", () => {
  assert.equal(natureDeLArret("java.net.SocketException: Operation not permitted"), "bac-a-sable");
  assert.equal(natureDeLArret("gradle failed on cook/18-github: java.net.SocketException: Operation not permitted"), "bac-a-sable");
});

test("un git push ou git commit qui échoue sur une erreur de git reste un geste git", () => {
  assert.equal(natureDeLArret("git push failed: ! [rejected] cook/18-github -> cook/18-github (non-fast-forward)"), "git");
  assert.equal(natureDeLArret("git commit: fatal: unable to auto-detect email address"), "git");
});

test("sans refus ni échec de git, ni l'un ni l'autre", () => {
  assert.equal(natureDeLArret("which colour should the button be?"), "autre");
});

test("le message d'un arrêt du bac n'envoie le chef éditer ni réglage, ni bac à sable, ni station", () => {
  assert.doesNotMatch(DIT_L_ARRET_DU_BAC, /\b(?:edit|change|modify|update)\b/i);
  assert.match(DIT_L_ARRET_DU_BAC, /bac-a-sable\.json/);
  assert.match(DIT_L_ARRET_DU_BAC, /reseau/);
});
