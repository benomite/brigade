// #4129, critère 5 : le second et l'app parquent et déparquent pareil, sur tout projet, sans commande de la box.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "../../..");

test("runtime has a `parked` command and the old `waiting` one is gone", () => {
  const scripts = (JSON.parse(readFileSync(join(RACINE, "runtime/package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  assert.ok(scripts.parked, "no `parked` script");
  assert.equal(scripts.waiting, undefined, "the `waiting` script is still there");
});

test("docs/app.md says the app parks and unparks like the second, on any project, with no box command", () => {
  const doc = readFileSync(join(RACINE, "docs/app.md"), "utf8");
  assert.match(doc, /park/i);
  assert.match(doc, /unpark/i);
  assert.match(doc, /no box command/i);
  assert.match(doc, /any project/i);
});
