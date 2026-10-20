// L'APK de l'app Android (app/packaging/android.ts) : ses prérequis, nommés quand ils manquent, la vue
// qu'il pose — celle d'app/src/vue/, sans copie dans le dépôt — et le pont d'attente qui la laisse
// s'ouvrir. Ni JDK, ni SDK Android, ni réseau : la construction elle-même, Gradle et l'APK qui
// s'ouvre sur un émulateur, sont éprouvés en CI (app/packaging/README.md, « L'APK Android »).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import vm from "node:vm";
import { ANDROID, dependancesDeLaVue, demarrageDuPont, majeureDuJdk, NATIF, plateformeVisee, poserLaVue, scriptDuPont, verifierPrerequis, type Machine } from "../../packaging/android.ts";
import { APP, Arret, IDENTIFIANT, NOM, type Executer } from "../../packaging/construire.ts";

const COMMANDE = join(APP, "packaging", "android.ts");

function dossier(t: TestContext): string {
  const cree = mkdtempSync(join(tmpdir(), "brigade-app-apk-"));
  t.after(() => rmSync(cree, { recursive: true, force: true }));
  return cree;
}

// Un `java` qui répond comme un JDK de cette version, ou aucun.
const java = (sortie: string | undefined): Executer => (commande) =>
  sortie === undefined ? { status: null, stdout: "", stderr: `spawnSync ${commande} ENOENT` } : { status: 0, stdout: "", stderr: sortie };
const JDK_21 = 'openjdk version "21.0.5" 2024-10-15\nOpenJDK Runtime Environment Temurin-21.0.5+11 (build 21.0.5+11-LTS)';

// Une machine : ses variables, son `java`, et les chemins qui y existent.
function machine(env: NodeJS.ProcessEnv, executer: Executer, chemins: readonly string[] = []): Machine {
  return { env, node: "26.11.1", executer, existe: (chemin) => chemins.includes(chemin) };
}

const refus = (faire: () => unknown): string => {
  try {
    faire();
  } catch (erreur) {
    assert.ok(erreur instanceof Arret);
    assert.equal(erreur.code, 2);
    return erreur.message;
  }
  return assert.fail("no refusal");
};

test("sans SDK Android ni JDK, la commande refuse (code 2) en nommant ce qui manque, sans pile d'appels ni rien écrire", (t) => {
  const ici = dossier(t);
  const vide = join(ici, "bin");
  mkdirSync(vide);
  const sortie = join(ici, "construit");
  const fait = spawnSync(process.execPath, [COMMANDE, "--sortie", sortie], { encoding: "utf8", env: { PATH: vide, HOME: ici } });
  assert.equal(fait.status, 2, fait.stderr);
  assert.match(fait.stderr, /^brigade: APK not built — missing prerequisites:/);
  assert.match(fait.stderr, /the Android SDK: ANDROID_HOME is not set/);
  assert.match(fait.stderr, /a JDK 21: no `java` found/);
  assert.doesNotMatch(fait.stderr, /^\s+at /m);
  assert.equal(existsSync(sortie), false);
});

test("une option inconnue est refusée avec l'usage", () => {
  const fait = spawnSync(process.execPath, [COMMANDE, "--autre"], { encoding: "utf8" });
  assert.equal(fait.status, 2);
  assert.match(fait.stderr, /usage: android\.ts \[--version <v>\] \[--sortie <folder>\]/);
});

test("les prérequis : chacun nommé quand il manque, avec de quoi le poser", () => {
  const plateforme = plateformeVisee();
  const sdk = "/opt/android-sdk";
  const avecPlateforme = [sdk, join(sdk, "platforms", `android-${plateforme}`)];

  assert.deepEqual(verifierPrerequis(machine({ ANDROID_HOME: sdk }, java(JDK_21), avecPlateforme)), { java: "java", sdk });
  // ANDROID_SDK_ROOT vaut ANDROID_HOME ; JAVA_HOME est pris avant le PATH.
  assert.deepEqual(verifierPrerequis(machine({ ANDROID_SDK_ROOT: sdk, JAVA_HOME: "/jdk" }, java(JDK_21), [...avecPlateforme, "/jdk/bin/java"])), { java: "/jdk/bin/java", sdk });

  assert.match(refus(() => verifierPrerequis(machine({}, java(JDK_21)))), /the Android SDK: ANDROID_HOME is not set — install the Android SDK \(with `sdkmanager "platforms;android-\d+"`\)/);
  assert.match(refus(() => verifierPrerequis(machine({ ANDROID_HOME: sdk }, java(JDK_21)))), /ANDROID_HOME is \/opt\/android-sdk, which does not exist/);
  assert.match(refus(() => verifierPrerequis(machine({ ANDROID_HOME: sdk }, java(JDK_21), [sdk]))), new RegExp(`the Android SDK platform ${plateforme}: .* install it with \`sdkmanager "platforms;android-${plateforme}"\``));
  assert.match(refus(() => verifierPrerequis(machine({ ANDROID_HOME: sdk }, java(undefined), avecPlateforme))), /a JDK 21: no `java` found/);
  assert.match(refus(() => verifierPrerequis(machine({ ANDROID_HOME: sdk }, java('openjdk version "17.0.12" 2024-07-16'), avecPlateforme))), /java is Java 17, the build needs Java 21 to 24/);
  assert.match(refus(() => verifierPrerequis(machine({ ANDROID_HOME: sdk, JAVA_HOME: "/jdk" }, java(JDK_21), avecPlateforme))), /JAVA_HOME is \/jdk, and there is no \/jdk\/bin\/java/);
  assert.match(refus(() => verifierPrerequis({ ...machine({ ANDROID_HOME: sdk }, java(JDK_21), avecPlateforme), node: "24.1.0" })), /Node 26: this node is v24\.1\.0/);
  // Tout ce qui manque est dit d'un coup.
  assert.match(refus(() => verifierPrerequis(machine({}, java(undefined)))), /missing prerequisites:\n  - a JDK 21: .*\n  - the Android SDK: /);
});

test("la version d'un JDK, d'après `java -version`", () => {
  assert.equal(majeureDuJdk(JDK_21), 21);
  assert.equal(majeureDuJdk('openjdk version "24" 2025-03-18'), 24);
  assert.equal(majeureDuJdk('java version "1.8.0_402"'), 8);
  assert.equal(majeureDuJdk("rien"), undefined);
});

test("l'enveloppe déclare l'identifiant et le nom de l'app, les mêmes que ceux du Mac", () => {
  const config = JSON.parse(readFileSync(join(ANDROID, "capacitor.config.json"), "utf8"));
  assert.equal(config.appId, IDENTIFIANT);
  assert.equal(config.appName, NOM);
  assert.equal(resolve(ANDROID, config.android.path), NATIF);
  const gradle = readFileSync(join(NATIF, "app", "build.gradle"), "utf8");
  assert.match(gradle, new RegExp(`applicationId "${IDENTIFIANT}"`));
  assert.match(gradle, new RegExp(`namespace = "${IDENTIFIANT}"`));
  assert.match(readFileSync(join(NATIF, "app", "src", "main", "res", "values", "strings.xml"), "utf8"), new RegExp(`<string name="app_name">${NOM}</string>`));
  // L'activité est dans le paquet de l'app, et le pont qu'elle injecte est celui que la construction pose.
  const java = join(NATIF, "app", "src", "main", "java", ...IDENTIFIANT.split("."));
  assert.match(readFileSync(join(java, "MainActivity.java"), "utf8"), /registerPlugin\(Pont\.class\)/);
  assert.match(readFileSync(join(java, "Pont.java"), "utf8"), /"public\/android\/pont\.js"/);
});

test("les versions sont épinglées : Capacitor, Gradle et sa somme, Android Gradle Plugin", () => {
  const paquet = JSON.parse(readFileSync(join(ANDROID, "package.json"), "utf8"));
  for (const version of Object.values<string>({ ...paquet.dependencies, ...paquet.devDependencies })) assert.match(version, /^\d+\.\d+\.\d+$/);
  const verrou = JSON.parse(readFileSync(join(ANDROID, "package-lock.json"), "utf8"));
  for (const nom of ["@capacitor/android", "@capacitor/core", "@capacitor/cli"]) assert.equal(verrou.packages[`node_modules/${nom}`].version, paquet.dependencies[nom] ?? paquet.devDependencies[nom]);
  const wrapper = readFileSync(join(NATIF, "gradle", "wrapper", "gradle-wrapper.properties"), "utf8");
  assert.match(wrapper, /distributionUrl=.*gradle-\d+\.\d+(\.\d+)?-bin\.zip/);
  assert.match(wrapper, /distributionSha256Sum=[0-9a-f]{64}/);
  assert.match(readFileSync(join(NATIF, "build.gradle"), "utf8"), /com\.android\.tools\.build:gradle:\d+\.\d+\.\d+/);
});

test("aucun fichier d'app/src/ n'est recopié dans app/android/ : le dépôt n'y garde que l'enveloppe", () => {
  const blobs = (chemin: string) => {
    const lu = spawnSync("git", ["-C", APP, "ls-files", "-s", "--", chemin], { encoding: "utf8" });
    assert.equal(lu.status, 0, lu.stderr);
    return lu.stdout.split("\n").filter(Boolean).map((ligne) => ({ blob: ligne.split(/\s+/)[1] ?? "", chemin: ligne.split("\t")[1] ?? "" }));
  };
  const deLApp = new Set(blobs("src").map(({ blob }) => blob));
  const recopies = blobs("android").filter(({ blob }) => deLApp.has(blob));
  assert.deepEqual(recopies, []);
});

test("la vue posée pour Capacitor est celle d'app/src/vue/, et ce qu'elle charge y est", async (t) => {
  const www = join(dossier(t), "www");
  poserLaVue(await demarrageDuPont(), www);
  const config = JSON.parse(readFileSync(join(ANDROID, "capacitor.config.json"), "utf8"));
  // Capacitor réclame une entrée à la racine ; l'app s'ouvre sur la vue.
  assert.ok(existsSync(join(www, "index.html")));
  const entree = join(www, config.server.appStartPath);
  assert.deepEqual(readFileSync(entree), readFileSync(join(APP, "src", "vue", "index.html")));
  assert.deepEqual(readFileSync(join(www, "src", "vue", "vue.js")), readFileSync(join(APP, "src", "vue", "vue.js")));
  // Chaque chemin de la vue hors de son dossier tient, relatif à elle, comme dans l'app.
  const html = readFileSync(entree, "utf8");
  const horsDeLaVue = [...html.matchAll(/(?:href|src)="([^"]+)"|"@[^"]+":\s*"([^"]+)"/g)].map((trouve) => trouve[1] ?? trouve[2] ?? "");
  assert.ok(horsDeLaVue.length > 0);
  for (const chemin of horsDeLaVue) assert.ok(existsSync(resolve(dirname(entree), chemin)), chemin);
  assert.deepEqual(dependancesDeLaVue(html), ["node_modules/@xterm/addon-fit/lib/addon-fit.mjs", "node_modules/@xterm/xterm/css/xterm.css", "node_modules/@xterm/xterm/lib/xterm.mjs"]);
  assert.ok(existsSync(join(www, "android", "pont.js")));
});

test("le pont d'attente : la vue s'ouvre sans projet, chaque geste répond sans rien faire", async () => {
  const demarrage = await demarrageDuPont();
  const window: Record<string, unknown> = {};
  vm.runInNewContext(scriptDuPont(demarrage), { window });
  const pont = window.brigade as Record<string, (...args: unknown[]) => unknown>;
  // Ce que le pont rend vient d'un autre contexte : on le compare en JSON, comme il voyagerait.
  const json = (valeur: unknown) => JSON.parse(JSON.stringify(valeur));
  const recu = json(await pont.demarrage!()) as Record<string, unknown>;
  assert.deepEqual(recu.configuration, { chemin: "no projects file on this phone — the Android app is not paired with a station yet: this phone reads nothing and sends nothing", projets: [] });
  // Le reste est ce que le process principal rendrait : les constantes des modules d'app/src/.
  assert.deepEqual(Object.fromEntries(Object.entries(recu).filter(([cle]) => cle !== "configuration")), JSON.parse(JSON.stringify(demarrage)));
  assert.equal(await pont.choisirDossier!(), undefined);
  assert.deepEqual(json(await pont.ajouter!({ dossier: "/x", depot: "a/b", base: "main" })), { etat: "pas-ajoute", titre: "Nothing was added: the Android app is not paired with a station yet: this phone reads nothing and sends nothing." });
  assert.equal(pont.then, undefined);
  // Chaque geste que preload.cjs offre au desktop existe : un abonnement ne reçoit rien, un geste ne rend rien.
  const gestes = [...readFileSync(join(APP, "src", "preload.cjs"), "utf8").matchAll(/^ {2}([a-zA-Z]+): /gm)].map((trouve) => trouve[1] ?? "");
  assert.ok(gestes.length > 50);
  for (const geste of gestes) assert.equal(typeof pont[geste], "function", geste);
  assert.equal(pont.surConfiguration!(() => assert.fail("nothing is received")), undefined);
  assert.equal(await pont.verifier!("projet"), undefined);
});

test("ce que posent la construction et `cap sync` n'est pas une source : git l'ignore", () => {
  for (const chemin of ["android/www/index.html", "android/node_modules/x", "android/natif/app/src/main/assets/public/index.html", "android/natif/capacitor.settings.gradle", "android/natif/app/capacitor.build.gradle", "android/natif/app/build/outputs/apk/debug/app-debug.apk", "packaging/construit/Brigade-1.0.0.apk"]) {
    const lu = spawnSync("git", ["-C", APP, "check-ignore", "-q", "--no-index", chemin]);
    assert.equal(lu.status, 0, `${chemin} is not ignored`);
  }
});
