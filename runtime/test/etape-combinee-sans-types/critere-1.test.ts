// #3806 : « red gates: type check » est la première cause de renvoi, mais
// l'étape en échec que la CI nomme — `Lint + Format + Typecheck + Test (en
// parallèle)` — joue le lint, le format, les types ET les tests : son nom ne dit
// pas que les types sont rouges. La cause se lit de l'étape elle-même, pas du
// mot « Typecheck » d'un nom qui en réunit quatre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { causeDuRenvoi, qualiteDeLIssue } from "../../src/qualite-github.ts";

const station = (body: string) => ({ body, association: "MEMBER" });
const renvoi = (raison: string) => station(`<!-- brigade:renvoi n=1 sha=${"a".repeat(40)} -->\nStation \`box/claude\`: sent back to a cook (1/2) — ${raison}`);
const COMBINEE = "the CI is red on `18287b5`: Lint + Format + Typecheck + Tests (+ e2e:critical si label e2e) (failed step: Lint + Format + Typecheck + Test (en parallèle))";

test("a red combined step (lint, format, types and tests in parallel) is not counted as a type check failure", () => {
  assert.notEqual(causeDuRenvoi(renvoi(COMBINEE).body), "gates-types");
});

test("the combined step's send-back is still counted, and a step that is only the type check stays a type check", () => {
  const qualite = qualiteDeLIssue({ corps: "## Context\n\nA ticket.", labels: [], commentaires: [renvoi(COMBINEE)] });
  assert.equal(qualite.renvois.length, 1);
  assert.notEqual(qualite.renvois[0], "red gates: type check");
  assert.equal(causeDuRenvoi(renvoi("the CI is red on `abc1234`: Typecheck (failed step: Typecheck)").body), "gates-types");
});
