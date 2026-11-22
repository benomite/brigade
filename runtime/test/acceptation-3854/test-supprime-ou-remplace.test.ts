// #3854, critère 1 : à la tête de la PR #3846, le test « un ticket que rien ne retient n'a pas de ligne
// d'attente, comme avant » de jamais-awaiting-none.test.ts n'est plus gardé tel quel — supprimé ou remplacé,
// sans qu'un commentaire ou une réponse sur la PR le justifie.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const REPO = "benomite/brigade";
const REVUE_SUR = "342e49dd94b5aa154126c6bf5cff8e936c27828a";
const FICHIER = "runtime/test/attente-visible/jamais-awaiting-none.test.ts";
const NOM = "un ticket que rien ne retient n'a pas de ligne d'attente, comme avant";
const gh = (...args: string[]) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 1 << 26 });

test("the PR #3846 head no longer keeps the 'comme avant' empty-case test, nor justifies it in a comment", { skip: "reads live GitHub state of other deliveries (PR #3783/#3838/#3846); not a code test" }, () => {
  const tete = gh("pr", "view", "3846", "--repo", REPO, "--json", "headRefOid", "--jq", ".headRefOid").trim();
  assert.notEqual(tete, REVUE_SUR, "the PR head is still the reviewed commit: nothing was fixed");
  let source = "";
  try {
    source = gh("api", `repos/${REPO}/contents/${FICHIER}?ref=${tete}`, "-H", "Accept: application/vnd.github.raw");
  } catch {
    return; // le fichier est supprimé : le test est retiré
  }
  assert.ok(!source.includes(NOM), `${FICHIER} still declares the test \`${NOM}\``);
  assert.doesNotMatch(source, /brigade:guard/, "a replacement must not be a guard of a behavior main has");
});
