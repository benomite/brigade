import assert from "node:assert/strict";
import { test } from "node:test";

import type { Evenement } from "./annotations.ts";
import { enCours } from "./en-cours.ts";

const ev = (type: string, name: string, line = 3): Evenement => ({ type, data: { name, file: "/x/a.test.ts", line } });

test("enCours names the tests started and not finished", () => {
  const dits = enCours([ev("test:dequeue", "un"), ev("test:dequeue", "deux"), ev("test:complete", "un")]);
  assert.deepEqual(dits, ["/x/a.test.ts:3 — deux"]);
});

// L'ordre où `node --test` les émet pour un fichier dont un test reste dans son crochet de fin
// (relevé sur Node 26) : le test n'a ni `test:start` ni `test:pass` tant qu'il n'a pas fini (#2421).
test("enCours names the file and the test stuck in its after hook, before any start is reported", () => {
  const dits = enCours([
    ev("test:enqueue", "a.test.ts", 1),
    ev("test:dequeue", "a.test.ts", 1),
    ev("test:enqueue", "fini", 2),
    ev("test:dequeue", "fini", 2),
    ev("test:complete", "fini", 2),
    ev("test:enqueue", "coince", 5),
    ev("test:dequeue", "coince", 5),
  ]);
  assert.deepEqual(dits, ["/x/a.test.ts:1 — a.test.ts", "/x/a.test.ts:5 — coince"]);
});

test("enCours forgets a test once it completes, whatever its report says", () => {
  const dits = enCours([ev("test:dequeue", "a.test.ts", 1), ev("test:dequeue", "un"), ev("test:complete", "un"), ev("test:start", "un"), ev("test:fail", "un"), ev("test:complete", "a.test.ts", 1)]);
  assert.deepEqual(dits, []);
});
