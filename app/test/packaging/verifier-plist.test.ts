// La vérification du nom d'une Brigade.app construite : « Brigade » dans l'app, jamais « Electron » dans ses auxiliaires.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { defautsDeNom } from "../../packaging/verifier-plist.ts";

const plist = (nom: string, affiche = nom) => `<dict><key>CFBundleName</key><string>${nom}</string><key>CFBundleDisplayName</key><string>${affiche}</string></dict>`;

function paquet(t: TestContext, app: string, auxiliaire: string): string {
  const racine = mkdtempSync(join(tmpdir(), "brigade-verifier-plist-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const aide = join(racine, "Contents", "Frameworks", "Aide.app", "Contents");
  mkdirSync(aide, { recursive: true });
  writeFileSync(join(racine, "Contents", "Info.plist"), app);
  writeFileSync(join(aide, "Info.plist"), auxiliaire);
  return racine;
}

test("un paquet nommé Brigade, auxiliaires compris, n'a aucun défaut", (t) => {
  assert.deepEqual(defautsDeNom(paquet(t, plist("Brigade"), plist("Brigade Helper"))), []);
});

test("le nom de l'app qui n'est pas Brigade est un défaut", (t) => {
  assert.equal(defautsDeNom(paquet(t, plist("Electron", "Brigade"), plist("Brigade Helper"))).length, 1);
  assert.equal(defautsDeNom(paquet(t, plist("Brigade", "Electron"), plist("Brigade Helper"))).length, 1);
});

test("un auxiliaire qui dit encore Electron est un défaut", (t) => {
  assert.equal(defautsDeNom(paquet(t, plist("Brigade"), plist("Electron Helper (GPU)"))).length, 2);
});

test("un paquet illisible est un défaut, pas un succès", (t) => {
  const vide = mkdtempSync(join(tmpdir(), "brigade-verifier-plist-"));
  t.after(() => rmSync(vide, { recursive: true, force: true }));
  assert.ok(defautsDeNom(vide).length >= 2);
});
