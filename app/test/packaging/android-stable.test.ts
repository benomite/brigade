// La stabilité de l'APK Android d'une release à l'autre (app/packaging/android-stable.ts) : même
// identifiant, même clé (lue de l'environnement), versionCode croissante, permission d'installer et
// fournisseur de fichiers. Sur une copie des fichiers lus : rien du dépôt n'est modifié.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { ANDROID } from "../../packaging/android.ts";
import { POINT_FIXE, verifier } from "../../packaging/android-stable.ts";
import { APP } from "../../packaging/construire.ts";

const COMMAND = join(APP, "packaging", "android-stable.ts");
const FILES = ["capacitor.config.json", "natif/app/build.gradle", "natif/app/src/main/AndroidManifest.xml", "natif/app/src/main/res/xml/file_paths.xml", "natif/app/src/main/res/values/strings.xml"];

// Une copie des fichiers lus, et de quoi les modifier.
function copy(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "brigade-app-stable-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const f of FILES) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    cpSync(join(ANDROID, f), join(root, f));
  }
  const path = (f: string) => join(root, f);
  return {
    racine: root,
    changer: (f: string, of: string | RegExp, to: string) => {
      const before = readFileSync(path(f), "utf8");
      const after = before.replace(of, to);
      assert.notEqual(after, before, `${f} has nothing to change`);
      writeFileSync(path(f), after);
    },
    verifier: (previous?: number) =>
      verifier(previous, { gradle: path("natif/app/build.gradle"), manifeste: path("natif/app/src/main/AndroidManifest.xml"), chemins: path("natif/app/src/main/res/xml/file_paths.xml"), android: root, point: POINT_FIXE }).erreurs,
  };
}

test("le dépôt est stable : la commande sort 0 et dit l'identifiant, la versionCode et la source de la clé", () => {
  const done = spawnSync(process.execPath, [COMMAND], { encoding: "utf8" });
  assert.equal(done.status, 0, done.stderr);
  assert.match(done.stdout, /application id com\.github\.benomite\.brigade/);
  assert.match(done.stdout, /version code \d+/);
  assert.match(done.stdout, /signing source environment \(BRIGADE_KEYSTORE_FILE/);
});

test("une versionCode plus basse ou égale à la précédente fait échouer, en nommant la versionCode", (t) => {
  const code = Number(/versionCode (\d+)/.exec(readFileSync(join(ANDROID, "natif/app/build.gradle"), "utf8"))?.[1]);
  for (const previous of [code, code + 5]) {
    const done = spawnSync(process.execPath, [COMMAND, "--previous-version-code", String(previous)], { encoding: "utf8" });
    assert.equal(done.status, 1);
    assert.match(done.stderr, /version code/);
  }
  assert.equal(spawnSync(process.execPath, [COMMAND, "--previous-version-code", String(code - 1)], { encoding: "utf8" }).status, 0);
  assert.equal(spawnSync(process.execPath, [COMMAND, "--previous-version-code", "x"], { encoding: "utf8" }).status, 2);
  assert.deepEqual(copy(t).verifier(0), []);
});

test("changer l'identifiant fait échouer, en nommant l'identifiant", (t) => {
  const c = copy(t);
  c.changer("natif/app/build.gradle", /applicationId "[^"]+"/, 'applicationId "com.exemple.autre"');
  assert.ok(c.verifier().some((e) => /application id changed.*com\.exemple\.autre/.test(e)));
  const d = copy(t);
  d.changer("capacitor.config.json", /"appId": "[^"]+"/, '"appId": "com.exemple.autre"');
  assert.ok(d.verifier().some((e) => /application id differs in capacitor\.config\.json/.test(e)));
});

test("la signature doit rester celle de l'environnement, sans clé ni mot de passe écrits", (t) => {
  const without = copy(t);
  without.changer("natif/app/build.gradle", /signingConfig signingConfigs\.release/, "signingConfig signingConfigs.debug");
  assert.ok(without.verifier().some((e) => /signing configuration changed.*release build type/.test(e)));
  const readEntry = copy(t);
  readEntry.changer("natif/app/build.gradle", "System.getenv('BRIGADE_KEY_ALIAS')", "'brigade'");
  assert.ok(readEntry.verifier().some((e) => /BRIGADE_KEY_ALIAS/.test(e)));
  const written = copy(t);
  written.changer("natif/app/build.gradle", "storePassword System.getenv('BRIGADE_KEYSTORE_PASSWORD')", "storePassword 'hunter2'");
  assert.ok(written.verifier().some((e) => /storePassword/.test(e)));
  const key = copy(t);
  writeFileSync(join(key.racine, "natif", "release.jks"), "x");
  assert.ok(key.verifier().some((e) => /signing key is in the repo.*release\.jks/.test(e)));
});

test("la permission d'installer et le fournisseur de fichiers sont requis", (t) => {
  const permission = copy(t);
  permission.changer("natif/app/src/main/AndroidManifest.xml", /<uses-permission android:name="android\.permission\.REQUEST_INSTALL_PACKAGES" \/>/, "");
  assert.ok(permission.verifier().some((e) => /install permission is missing/.test(e)));
  const provider = copy(t);
  provider.changer("natif/app/src/main/AndroidManifest.xml", /<provider[\s\S]*<\/provider>/, "");
  assert.ok(provider.verifier().some((e) => /file provider is missing/.test(e)));
  const paths = copy(t);
  paths.changer("natif/app/src/main/res/xml/file_paths.xml", /<cache-path[^>]*>|<external-path[^>]*>/g, "");
  assert.ok(paths.verifier().some((e) => /shares no path/.test(e)));
});

test("aucun fichier de clé n'est versionné sous app/android/", () => {
  const done = spawnSync("git", ["ls-files", ANDROID], { encoding: "utf8" });
  assert.doesNotMatch(done.stdout, /\.(jks|keystore|p12|pfx)$/im);
});
