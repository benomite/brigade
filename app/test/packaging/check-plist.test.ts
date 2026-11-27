// La vérification du nom d'une Brigade.app construite : « Brigade » dans l'app, jamais « Electron » dans ses auxiliaires.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { defautsDeNom } from "../../packaging/verifier-plist.ts";
import { PACKAGES } from "../helpers/posix.ts";

const plist = (name: string, shows = name, executable = name, identifier = "com.github.benomite.brigade") =>
  `<dict><key>CFBundleName</key><string>${name}</string><key>CFBundleDisplayName</key><string>${shows}</string><key>CFBundleExecutable</key><string>${executable}</string><key>CFBundleIdentifier</key><string>${identifier}</string></dict>`;

function pkg(t: TestContext, app: string, auxiliaire: string): string {
  const root = mkdtempSync(join(tmpdir(), "brigade-verifier-plist-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const help = join(root, "Contents", "Frameworks", "Aide.app", "Contents");
  mkdirSync(help, { recursive: true });
  writeFileSync(join(root, "Contents", "Info.plist"), app);
  writeFileSync(join(help, "Info.plist"), auxiliaire);
  for (const [folder, xml] of [[join(root, "Contents"), app], [help, auxiliaire]] as const) {
    mkdirSync(join(folder, "MacOS"), { recursive: true });
    const executable = /<key>CFBundleExecutable<\/key><string>([^<]*)/.exec(xml)?.[1];
    if (executable !== undefined) writeFileSync(join(folder, "MacOS", executable), "");
  }
  return root;
}

test("un paquet nommé Brigade, auxiliaires compris, n'a aucun défaut", { skip: PACKAGES }, (t) => {
  assert.deepEqual(defautsDeNom(pkg(t, plist("Brigade"), plist("Brigade Helper"))), []);
});

test("le nom de l'app qui n'est pas Brigade est un défaut", { skip: PACKAGES }, (t) => {
  assert.equal(defautsDeNom(pkg(t, plist("Electron", "Brigade", "Brigade"), plist("Brigade Helper"))).length, 1);
  assert.equal(defautsDeNom(pkg(t, plist("Brigade", "Electron", "Brigade"), plist("Brigade Helper"))).length, 1);
});

test("un auxiliaire qui dit encore Electron est un défaut", { skip: PACKAGES }, (t) => {
  assert.equal(defautsDeNom(pkg(t, plist("Brigade"), plist("Electron Helper (GPU)", "Electron Helper (GPU)", "Brigade Helper"))).length, 2);
  assert.equal(defautsDeNom(pkg(t, plist("Brigade"), plist("Brigade Helper", "Brigade Helper", "Brigade Helper", "com.github.Electron.helper"))).length, 2);
});

test("un paquet illisible est un défaut, pas un succès", { skip: PACKAGES }, (t) => {
  const empty = mkdtempSync(join(tmpdir(), "brigade-verifier-plist-"));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  assert.ok(defautsDeNom(empty).length >= 2);
});
