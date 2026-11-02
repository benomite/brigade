import assert from "node:assert/strict";
import { test } from "node:test";

import type { Evenement } from "./annotations.ts";
import { enCours } from "./en-cours.ts";

const ev = (type: string, name: string): Evenement => ({ type, data: { name, file: "/x/a.test.ts", line: 3 } });

test("enCours names the tests started and not finished", () => {
  const dits = enCours([ev("test:start", "un"), ev("test:start", "deux"), ev("test:pass", "un")]);
  assert.deepEqual(dits, ["/x/a.test.ts:3 — deux"]);
});
