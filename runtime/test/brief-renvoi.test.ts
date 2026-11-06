// Ce que le cook d'un renvoi reçoit de la livraison renvoyée (#2590).
import assert from "node:assert/strict";
import { test } from "node:test";
import { OCTETS_DU_RENVOI, briefDuRenvoi, lireLeRenvoi } from "../src/brief-renvoi.ts";
import type { Check } from "../src/events/pass.ts";
import type { Commentaire } from "../src/github.ts";
import { corpsDeVerdict } from "../src/github-etat/fusion.ts";

const SHA = "c".repeat(40);
const pr = { number: 99, sha: SHA };
const verdict = (motif: string, sha = SHA, createdAt = "2026-11-06T10:00:00Z"): Commentaire => ({
  body: corpsDeVerdict("box", sha, { verdict: "request-changes", motif }),
  author: "brigade-pass",
  association: "OWNER",
  createdAt,
});
const rouge = (name: string, url: string | null = `https://github.com/o/r/actions/runs/1/job/${name.length}`): Check => ({ name, outcome: "red", conclusion: "failure", url });
const DIFF = "diff --git a/runtime/src/a.ts b/runtime/src/a.ts\n--- a/runtime/src/a.ts\n+++ b/runtime/src/a.ts\n@@ -1 +1 @@\n-export const a = 1;\n+export const a = 2;\n";

test("a cook sent back after a review gets every remark in full, unabridged — past the size a ticket comment is cut at", async () => {
  const remarques = [
    `1. \`runtime/src/a.ts:12\` — the guard is inverted: ${"the first remark goes on. ".repeat(300)}end of the first remark.`,
    "2. The test does not assert the second case: add it in `runtime/test/a.test.ts`, with ```fences``` in the remark.",
    `3. ${"x".repeat(7_000)} — end of the third remark.`,
  ];
  const github = { commentaires: async (numero: number) => (assert.equal(numero, 99), [verdict("an older review", "b".repeat(40), "2026-11-05T10:00:00Z"), verdict(remarques.join("\n\n"))]) };
  const brief = briefDuRenvoi(await lireLeRenvoi(github, pr, [], ""), "main");
  assert.match(brief, /^## Why your delivery was sent back\n\n### What the review asked\n/);
  for (const remarque of remarques) assert.ok(brief.includes(remarque), `remark missing or cut: ${remarque.slice(0, 40)}`);
  assert.doesNotMatch(brief, /an older review|Changes requested by station|brigade:verdict/);
  // Une remarque qui porte des accents graves ne ferme pas son bloc.
  assert.match(brief, /\n````\n1\. /);
});

test("a cook sent back after a red CI gets each failing check's name and failure output in full", async () => {
  const sortie = `✖ failing tests:\n\ntest at test/peau.test.ts:57:1\n✖ the skin has no hard-coded colour\n${"AssertionError: long output line\n".repeat(200)}last line of the output`;
  const github = {
    commentaires: async () => [],
    annotationsDuCheck: async (check: Check) => {
      if (check.name === "gates") throw new Error("HTTP 502");
      return check.name === "tests app (3/3)" ? [{ chemin: "app/test/peau.test.ts", ligne: 57, titre: "tests app (3/3)", message: sortie }] : [];
    },
  };
  const brief = briefDuRenvoi(await lireLeRenvoi(github, pr, [rouge("tests app (3/3)"), rouge("types (app)", null), rouge("gates")], ""), "main");
  assert.match(brief, /### What the CI says is red/);
  assert.ok(brief.includes(`#### \`tests app (3/3)\`\n\n\`\`\`\napp/test/peau.test.ts:57 — tests app (3/3)\n${sortie}\n\`\`\``));
  assert.match(brief, /#### `types \(app\)`\n\n_GitHub gives no failure annotation for this check\._/);
  assert.match(brief, /#### `gates`\n\n_GitHub gives no failure annotation for this check: https:\/\/github\.com\/o\/r\/actions\/runs\/1\/job\/5_/);
  assert.doesNotMatch(brief, /What the review asked/);
});

test("the brief of a send-back carries the diff of the cook's previous delivery", async () => {
  const brief = briefDuRenvoi(await lireLeRenvoi({ commentaires: async () => [verdict("fix the constant")] }, pr, [], DIFF), "main");
  assert.match(brief, /### Your previous delivery\n\nWhat your previous delivery changes against `origin\/main`/);
  assert.ok(brief.includes(`\`\`\`\n${DIFF.trimEnd()}\n\`\`\``));
  assert.ok(brief.indexOf("What the review asked") < brief.indexOf("Your previous delivery"));
});

test("a first delivery, with no send-back, gets none of these sections", async () => {
  assert.equal(briefDuRenvoi(null, "main"), "");
  // Une PR sans verdict sur sa tête, ni check rouge, ni diff : rien à dire non plus.
  const rien = await lireLeRenvoi({ commentaires: async () => [verdict("about another head", "b".repeat(40))] }, pr, [], "");
  assert.deepEqual(rien, { relecture: null, rouges: [], diff: "" });
  assert.equal(briefDuRenvoi(rien, "main"), "");
});

test("past the size a claude argument carries, the remarks stay whole, a check is only named and the diff is only its command", async () => {
  const remarques = `the remark ${"r".repeat(OCTETS_DU_RENVOI)} ends here`;
  const brief = briefDuRenvoi({ relecture: remarques, rouges: [{ nom: "tests", url: "https://ci/1", sortie: "boom" }], diff: DIFF }, "main");
  assert.ok(brief.includes(remarques));
  assert.match(brief, /1 more red check, too long for this brief: `tests` \(https:\/\/ci\/1\)\./);
  assert.match(brief, /It is too long for this brief: read it with `git diff origin\/main\.\.\.HEAD`\./);
  assert.ok(!brief.includes(DIFF.trimEnd()));
});
