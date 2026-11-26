// Test d'acceptation gelé (#4080). Critère 4 : un test ou un script de app/packaging/ lit l'Info.plist construit et échoue si le nom n'est pas « Brigade ».
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const PACKAGING = join(import.meta.dirname, "../../packaging");

test("app/packaging/ holds a check, besides construire.ts, that reads the built Info.plist and requires the name 'Brigade'", () => {
  const verifications = readdirSync(PACKAGING).filter((name) => /\.(ts|mjs|js|sh)$/.test(name) && name !== "construire.ts").filter((name) => {
    const texte = readFileSync(join(PACKAGING, name), "utf8");
    return texte.includes("Info.plist") && texte.includes("CFBundleName") && texte.includes("CFBundleDisplayName") && texte.includes("Brigade") && /exit\(1\)|exit 1|throw|assert|process\.exitCode/.test(texte);
  });
  assert.notDeepEqual(verifications, []);
});
