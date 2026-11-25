// #4214, critère 1 : ni « cause unknown » ni phrase listant ce qui n'a PAS été trouvé, dans panne/ et le câblage du status.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const src = join(import.meta.dirname, "..", "..", "src");
const vieux = [/cause is unknown/i, /cause unknown/i, /unknown cause/i, /No station fault/i, /free turn/i, /\bnot found\b/i, /\bnothing found\b/i, /\bno [a-z ]{0,30}found\b/i];

test("the panne folder and the status wiring hold none of the old strings", () => {
  const dossier = join(src, "panne");
  assert.ok(existsSync(dossier), "runtime/src/panne/ exists");
  const fichiers = readdirSync(dossier, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => join(e.parentPath, e.name));
  assert.ok(fichiers.length > 0, "panne/ holds source files");
  const cablage = ["status.ts", join("attente-du-rail", "status.ts")].map((f) => join(src, f));
  for (const f of [...fichiers, ...cablage]) {
    const texte = readFileSync(f, "utf8");
    for (const motif of vieux) assert.ok(!motif.test(texte), `${f} still matches ${motif}`);
  }
});
