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

const COMMANDE = join(APP, "packaging", "android-stable.ts");
const FICHIERS = ["capacitor.config.json", "natif/app/build.gradle", "natif/app/src/main/AndroidManifest.xml", "natif/app/src/main/res/xml/file_paths.xml", "natif/app/src/main/res/values/strings.xml"];

// Une copie des fichiers lus, et de quoi les modifier.
function copie(t: TestContext) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-stable-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  for (const f of FICHIERS) {
    mkdirSync(dirname(join(racine, f)), { recursive: true });
    cpSync(join(ANDROID, f), join(racine, f));
  }
  const chemin = (f: string) => join(racine, f);
  return {
    racine,
    changer: (f: string, de: string | RegExp, vers: string) => {
      const avant = readFileSync(chemin(f), "utf8");
      const apres = avant.replace(de, vers);
      assert.notEqual(apres, avant, `${f} has nothing to change`);
      writeFileSync(chemin(f), apres);
    },
    verifier: (precedente?: number) =>
      verifier(precedente, { gradle: chemin("natif/app/build.gradle"), manifeste: chemin("natif/app/src/main/AndroidManifest.xml"), chemins: chemin("natif/app/src/main/res/xml/file_paths.xml"), android: racine, point: POINT_FIXE }).erreurs,
  };
}

test("le dépôt est stable : la commande sort 0 et dit l'identifiant, la versionCode et la source de la clé", () => {
  const fait = spawnSync(process.execPath, [COMMANDE], { encoding: "utf8" });
  assert.equal(fait.status, 0, fait.stderr);
  assert.match(fait.stdout, /application id com\.github\.benomite\.brigade/);
  assert.match(fait.stdout, /version code \d+/);
  assert.match(fait.stdout, /signing source environment \(BRIGADE_KEYSTORE_FILE/);
});

test("une versionCode plus basse ou égale à la précédente fait échouer, en nommant la versionCode", (t) => {
  const code = Number(/versionCode (\d+)/.exec(readFileSync(join(ANDROID, "natif/app/build.gradle"), "utf8"))?.[1]);
  for (const precedente of [code, code + 5]) {
    const fait = spawnSync(process.execPath, [COMMANDE, "--previous-version-code", String(precedente)], { encoding: "utf8" });
    assert.equal(fait.status, 1);
    assert.match(fait.stderr, /version code/);
  }
  assert.equal(spawnSync(process.execPath, [COMMANDE, "--previous-version-code", String(code - 1)], { encoding: "utf8" }).status, 0);
  assert.equal(spawnSync(process.execPath, [COMMANDE, "--previous-version-code", "x"], { encoding: "utf8" }).status, 2);
  assert.deepEqual(copie(t).verifier(0), []);
});

test("changer l'identifiant fait échouer, en nommant l'identifiant", (t) => {
  const c = copie(t);
  c.changer("natif/app/build.gradle", /applicationId "[^"]+"/, 'applicationId "com.exemple.autre"');
  assert.ok(c.verifier().some((e) => /application id changed.*com\.exemple\.autre/.test(e)));
  const d = copie(t);
  d.changer("capacitor.config.json", /"appId": "[^"]+"/, '"appId": "com.exemple.autre"');
  assert.ok(d.verifier().some((e) => /application id differs in capacitor\.config\.json/.test(e)));
});

test("la signature doit rester celle de l'environnement, sans clé ni mot de passe écrits", (t) => {
  const sans = copie(t);
  sans.changer("natif/app/build.gradle", /signingConfig signingConfigs\.release/, "signingConfig signingConfigs.debug");
  assert.ok(sans.verifier().some((e) => /signing configuration changed.*release build type/.test(e)));
  const lue = copie(t);
  lue.changer("natif/app/build.gradle", "System.getenv('BRIGADE_KEY_ALIAS')", "'brigade'");
  assert.ok(lue.verifier().some((e) => /BRIGADE_KEY_ALIAS/.test(e)));
  const ecrit = copie(t);
  ecrit.changer("natif/app/build.gradle", "storePassword System.getenv('BRIGADE_KEYSTORE_PASSWORD')", "storePassword 'hunter2'");
  assert.ok(ecrit.verifier().some((e) => /storePassword/.test(e)));
  const cle = copie(t);
  writeFileSync(join(cle.racine, "natif", "release.jks"), "x");
  assert.ok(cle.verifier().some((e) => /signing key is in the repo.*release\.jks/.test(e)));
});

test("la permission d'installer et le fournisseur de fichiers sont requis", (t) => {
  const permission = copie(t);
  permission.changer("natif/app/src/main/AndroidManifest.xml", /<uses-permission android:name="android\.permission\.REQUEST_INSTALL_PACKAGES" \/>/, "");
  assert.ok(permission.verifier().some((e) => /install permission is missing/.test(e)));
  const fournisseur = copie(t);
  fournisseur.changer("natif/app/src/main/AndroidManifest.xml", /<provider[\s\S]*<\/provider>/, "");
  assert.ok(fournisseur.verifier().some((e) => /file provider is missing/.test(e)));
  const chemins = copie(t);
  chemins.changer("natif/app/src/main/res/xml/file_paths.xml", /<cache-path[^>]*>|<external-path[^>]*>/g, "");
  assert.ok(chemins.verifier().some((e) => /shares no path/.test(e)));
});

test("aucun fichier de clé n'est versionné sous app/android/", () => {
  const fait = spawnSync("git", ["ls-files", ANDROID], { encoding: "utf8" });
  assert.doesNotMatch(fait.stdout, /\.(jks|keystore|p12|pfx)$/im);
});
