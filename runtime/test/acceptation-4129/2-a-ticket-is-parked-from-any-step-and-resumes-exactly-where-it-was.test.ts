// #4129, critère 2 : on parque depuis n'importe quelle étape ; le ticket reprend exactement où il était à sa date, son fait ou la réponse.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "../../..");

test("the runtime doc says parked is open at the backlog, the cook and the pass, and where it resumes", () => {
  const doc = readFileSync(join(RACINE, "docs/runtime/journal-et-rail.md"), "utf8");
  const section = doc.split(/\n(?=#+ )/).find((s) => /^#+ .*parked/i.test(s));
  assert.ok(section, "no section about parked in docs/runtime/journal-et-rail.md");
  assert.match(section, /backlog/i);
  assert.match(section, /cook/i);
  assert.match(section, /pass/i);
  assert.match(section, /exactly where it was/i);
  assert.match(section, /date/i);
  assert.match(section, /fact/i);
  assert.match(section, /answer/i);
});
