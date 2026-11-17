// #3734 criterion 5: the delete action refuses to run on any repository other than the one recorded as created by the demo.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "..", "..");
// Every source file under a folder, concatenated (empty when the folder does not exist yet).
function lire(dossier: string): string {
  const abs = join(RACINE, dossier);
  if (!existsSync(abs)) return "";
  const sortie: string[] = [];
  const marcher = (d: string) => {
    for (const nom of readdirSync(d)) {
      const p = join(d, nom);
      if (statSync(p).isDirectory()) marcher(p);
      else sortie.push(readFileSync(p, "utf8"));
    }
  };
  marcher(abs);
  return sortie.join("\n");
}

test("deleting refuses a repository that is not the recorded demo repository", () => {
  const src = lire("runtime/src/demo");
  assert.notEqual(src, "", "runtime/src/demo/ must exist");
  assert.match(src, /refus/i, "the deletion refuses");
  assert.match(src, /!==|!=|not the (recorded|demo)|mismatch/i, "it compares the target with the recorded repository");
  assert.match(src, /record/i);
});
