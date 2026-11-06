// Ce que la CI rouge d'une livraison dit au cook qui la reprend (#2545).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Check } from "../../../src/events/pass.ts";
import type { AnnotationDeCheck } from "../../../src/github.ts";
import { CHECKS_MAX, DIT_MAX, MESSAGE_MAX, ceQueDitLaCiRouge } from "../../../src/github-seul/ci-rouge/ci-rouge.ts";

const rouge = (name: string, url: string | null = `https://github.com/o/r/actions/runs/1/job/${name.length}`): Check => ({ name, outcome: "red", conclusion: "failure", url });

test("with no red check, there is nothing to say", async () => {
  assert.equal(await ceQueDitLaCiRouge({ annotationsDuCheck: async () => assert.fail("nothing is read") }, []), "");
});

test("each red check gives its failure annotations, where they point, in a block a backtick cannot close", async () => {
  const annotations: AnnotationDeCheck[] = [
    { chemin: "runtime/test/a.test.ts", ligne: 12, titre: "a test", message: "Error: ```raté```" },
    { chemin: null, ligne: null, titre: "", message: "✖ failing tests:" },
  ];
  const dit = await ceQueDitLaCiRouge({ annotationsDuCheck: async () => annotations }, [rouge("tests runtime (2/16)")]);
  assert.match(dit, /^### What the CI says is red\n/);
  assert.match(dit, /#### `tests runtime \(2\/16\)`\n\n````\nruntime\/test\/a\.test\.ts:12 — a test\nError: ```raté```\n\n✖ failing tests:\n````/);
});

test("a check with no annotation, or whose annotations GitHub does not give, is named with its address", async () => {
  const dit = await ceQueDitLaCiRouge(
    {
      annotationsDuCheck: async (check) => {
        if (check.name === "gates") throw new Error("HTTP 502");
        return [];
      },
    },
    [rouge("gates"), rouge("types (app)", null)],
  );
  assert.match(dit, /#### `gates`\n\n_GitHub gives no failure annotation for this check: https:\/\/github\.com\/o\/r\/actions\/runs\/1\/job\/5_/);
  assert.match(dit, /#### `types \(app\)`\n\n_GitHub gives no failure annotation for this check\._/);
  // Un client sans lecture des annotations dit les checks de même.
  assert.match(await ceQueDitLaCiRouge({}, [rouge("gates")]), /#### `gates`\n\n_GitHub gives no failure annotation/);
});

test("the text stays bounded: a long message keeps its start, past the checks read or the size the others are only named", async () => {
  const long = await ceQueDitLaCiRouge({ annotationsDuCheck: async () => [{ chemin: null, ligne: null, titre: "t", message: `✖ first${"x".repeat(MESSAGE_MAX * 2)}` }] }, [rouge("tests")]);
  assert.match(long, /✖ first/);
  assert.ok(long.length < MESSAGE_MAX + 1_000);

  const nombreux = Array.from({ length: CHECKS_MAX + 2 }, (_, i) => rouge(`tests runtime (${i + 1}/16)`));
  const lus: string[] = [];
  const dit = await ceQueDitLaCiRouge({ annotationsDuCheck: async (check) => (lus.push(check.name), []) }, nombreux);
  assert.equal(lus.length, CHECKS_MAX);
  assert.match(dit, /2 more red checks, not read here: `tests runtime \(13\/16\)`, `tests runtime \(14\/16\)`\.$/);

  const gros = await ceQueDitLaCiRouge(
    { annotationsDuCheck: async () => Array.from({ length: 20 }, () => ({ chemin: null, ligne: null, titre: "t", message: "y".repeat(MESSAGE_MAX) })) },
    [rouge("a"), rouge("bb"), rouge("ccc")],
  );
  assert.ok(gros.length < DIT_MAX + 1_000);
  assert.match(gros, /#### `a`/);
  assert.match(gros, /2 more red checks, not read here: `bb`, `ccc`\.$/);
});
