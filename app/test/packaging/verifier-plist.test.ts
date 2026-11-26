// La vérification du nom d'une Brigade.app construite : « Brigade » dans l'app, jamais « Electron » dans ses auxiliaires.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { defautsDeNom } from "../../packaging/verifier-plist.ts";
import { PAQUETS } from "../aides/posix.ts";

const plist = (nom: string, affiche = nom, executable = nom, identifiant = "com.github.benomite.brigade") =>
  `<dict><key>CFBundleName</key><string>${nom}</string><key>CFBundleDisplayName</key><string>${affiche}</string><key>CFBundleExecutable</key><string>${executable}</string><key>CFBundleIdentifier</key><string>${identifiant}</string></dict>`;

function paquet(t: TestContext, app: string, auxiliaire: string): string {
  const racine = mkdtempSync(join(tmpdir(), "brigade-verifier-plist-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const aide = join(racine, "Contents", "Frameworks", "Aide.app", "Contents");
  mkdirSync(aide, { recursive: true });
  writeFileSync(join(racine, "Contents", "Info.plist"), app);
  writeFileSync(join(aide, "Info.plist"), auxiliaire);
  for (const [dossier, xml] of [[join(racine, "Contents"), app], [aide, auxiliaire]] as const) {
    mkdirSync(join(dossier, "MacOS"), { recursive: true });
    const executable = /<key>CFBundleExecutable<\/key><string>([^<]*)/.exec(xml)?.[1];
    if (executable !== undefined) writeFileSync(join(dossier, "MacOS", executable), "");
  }
  return racine;
}

test("un paquet nommé Brigade, auxiliaires compris, n'a aucun défaut", { skip: PAQUETS }, (t) => {
  assert.deepEqual(defautsDeNom(paquet(t, plist("Brigade"), plist("Brigade Helper"))), []);
});

test("le nom de l'app qui n'est pas Brigade est un défaut", { skip: PAQUETS }, (t) => {
  assert.equal(defautsDeNom(paquet(t, plist("Electron", "Brigade", "Brigade"), plist("Brigade Helper"))).length, 1);
  assert.equal(defautsDeNom(paquet(t, plist("Brigade", "Electron", "Brigade"), plist("Brigade Helper"))).length, 1);
});

test("un auxiliaire qui dit encore Electron est un défaut", { skip: PAQUETS }, (t) => {
  assert.equal(defautsDeNom(paquet(t, plist("Brigade"), plist("Electron Helper (GPU)", "Electron Helper (GPU)", "Brigade Helper"))).length, 2);
  assert.equal(defautsDeNom(paquet(t, plist("Brigade"), plist("Brigade Helper", "Brigade Helper", "Brigade Helper", "com.github.Electron.helper"))).length, 2);
});

test("un paquet illisible est un défaut, pas un succès", { skip: PAQUETS }, (t) => {
  const vide = mkdtempSync(join(tmpdir(), "brigade-verifier-plist-"));
  t.after(() => rmSync(vide, { recursive: true, force: true }));
  assert.ok(defautsDeNom(vide).length >= 2);
});
