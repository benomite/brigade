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
import { CACHE_DE_COMPILATION } from "../aides/cache-de-compilation.ts";
import { PAQUETS } from "../aides/posix.ts";

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
  const fait = spawnSync(process.execPath, [COMMANDE, "--sortie", sortie], { encoding: "utf8", env: { PATH: vide, HOME: ici, ...CACHE_DE_COMPILATION } });
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

test("les prérequis : chacun nommé quand il manque, avec de quoi le poser", { skip: PAQUETS }, () => {
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
  // Le reste est ce que le process principal rendrait : les constantes des modules d'app/src/ — et l'appairage du
  // téléphone, aucun sans stockage qui en garde un (#1161).
  assert.deepEqual(recu.telephone, { appaire: false });
  assert.deepEqual(Object.fromEntries(Object.entries(recu).filter(([cle]) => cle !== "configuration" && cle !== "telephone")), JSON.parse(JSON.stringify(demarrage)));
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

// Le pont joué comme dans la WebView (#1161) : son stockage, et le pont natif de Capacitor (`nativePromise`), dont
// chaque appel est noté et reçoit la réponse de `natif` — ce que CapacitorHttp rendrait du guichet, ou ce que lève
// un réseau qui ne joint rien.
type AppelNatif = { plugin: string; methode: string; options: Record<string, unknown> };
async function pontDuTelephone(natif: (appel: AppelNatif) => unknown, stockage = new Map<string, string>()) {
  const appels: AppelNatif[] = [];
  const window: Record<string, unknown> = {
    localStorage: { getItem: (cle: string) => stockage.get(cle) ?? null, setItem: (cle: string, valeur: string) => void stockage.set(cle, valeur) },
    Capacitor: {
      nativePromise: async (plugin: string, methode: string, options: Record<string, unknown>) => {
        // Les options viennent du contexte du pont : on les garde en JSON, comme elles passent au natif.
        appels.push({ plugin, methode, options: JSON.parse(JSON.stringify(options)) });
        return natif({ plugin, methode, options });
      },
    },
  };
  vm.runInNewContext(scriptDuPont(await demarrageDuPont()), { window });
  const pont = window.brigade as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const json = async (promesse: Promise<unknown>) => JSON.parse(JSON.stringify(await promesse));
  return { pont, appels, stockage, json };
}
const DEMANDE = { adresse: "http://192.168.1.20:7010", code: "7KQ2-M9XD", nom: "pixel-8", machine: "Android 14 · Pixel 8" };
const STATION = { nom: "pixel-8", machine: "Android 14 · Pixel 8", sorte: "telephone", cuisine: false, statut: "acceptee" };

test("le pont appaire le téléphone : le code part au guichet par le HTTP natif, le jeton est gardé, et le lancement suivant le sait", async () => {
  const { pont, appels, stockage, json } = await pontDuTelephone(() => ({ status: 201, headers: {}, data: { paired: true, station: STATION, token: "brgt_secret" } }));
  assert.deepEqual(await json(pont.appairerLeTelephone!(DEMANDE)), { paired: true, station: "pixel-8" });
  assert.deepEqual(appels, [
    {
      plugin: "CapacitorHttp",
      methode: "request",
      options: { url: "http://192.168.1.20:7010/pairing", method: "POST", headers: { "Content-Type": "application/json" }, data: { code: "7KQ2-M9XD", name: "pixel-8", machine: "Android 14 · Pixel 8" }, connectTimeout: 10_000, readTimeout: 10_000 },
    },
  ]);
  // Le jeton est gardé, et la vue n'en reçoit rien.
  assert.deepEqual(JSON.parse(stockage.get("brigade.telephone") ?? "null"), { station: "pixel-8", adresse: "http://192.168.1.20:7010", jeton: "brgt_secret" });
  // Relancée sur le même stockage, l'app se sait appairée.
  const relance = await pontDuTelephone(() => assert.fail("nothing is sent at launch"), stockage);
  assert.deepEqual((await relance.json(relance.pont.demarrage!())).telephone, { appaire: true, station: "pixel-8", adresse: "http://192.168.1.20:7010" });
});

test("le pont rend le refus du guichet tel quel, et ne garde rien", async () => {
  const said = "code refused: it expired at 2026-10-21T09:58:00.000Z — ask your station for a new one";
  const { pont, stockage, json } = await pontDuTelephone(() => ({ status: 403, headers: {}, data: { paired: false, reason: "expire", said } }));
  assert.deepEqual(await json(pont.appairerLeTelephone!(DEMANDE)), { paired: false, reason: "expire", said });
  // Un corps resté en texte se lit aussi.
  const texte = await pontDuTelephone(() => ({ status: 403, headers: {}, data: JSON.stringify({ paired: false, reason: "inconnu", said: "no code" }) }));
  assert.deepEqual(await texte.json(texte.pont.appairerLeTelephone!(DEMANDE)), { paired: false, reason: "inconnu", said: "no code" });
  assert.equal(stockage.size, 0);
  assert.deepEqual((await json(pont.demarrage!())).telephone, { appaire: false });
});

test("le pont dit la station injoignable quand la demande n'arrive pas, et une réponse qui n'est pas d'un guichet comme telle", async () => {
  const muet = await pontDuTelephone(() => {
    throw new Error("failed to connect to /192.168.1.20 (port 7010) after 10000ms");
  });
  assert.deepEqual(await muet.json(muet.pont.appairerLeTelephone!(DEMANDE)), { paired: false, reason: "injoignable", said: "failed to connect to /192.168.1.20 (port 7010) after 10000ms" });
  const autre = await pontDuTelephone(() => ({ status: 404, headers: {}, data: "<html>not found</html>" }));
  assert.deepEqual(await autre.json(autre.pont.appairerLeTelephone!(DEMANDE)), { paired: false, reason: "inattendu", said: "http://192.168.1.20:7010 answered 404, not as a station's phone desk" });
  assert.equal(muet.stockage.size + autre.stockage.size, 0);
});

test("le pont lit le QR par le plugin natif : son texte, un renoncement, ou la raison d'un échec", async () => {
  for (const [rendu, attendu] of [
    [{ texte: "brigade://pair?code=7KQ2-M9XD" }, { lu: "brigade://pair?code=7KQ2-M9XD" }],
    [{}, { annule: true }],
  ] as const) {
    const { pont, appels, json } = await pontDuTelephone(() => rendu);
    assert.deepEqual(await json(pont.scannerLeQr!()), attendu);
    assert.deepEqual(appels, [{ plugin: "Pont", methode: "scanner", options: {} }]);
  }
  const { pont, json } = await pontDuTelephone(() => {
    throw { message: "Waiting for the Barcode UI module to be downloaded." };
  });
  assert.deepEqual(await json(pont.scannerLeQr!()), { refus: "Waiting for the Barcode UI module to be downloaded." });
});

test("l'enveloppe native a de quoi appairer : le lecteur de QR du pont, et le http en clair vers le guichet", () => {
  const java = join(NATIF, "app", "src", "main", "java", ...IDENTIFIANT.split("."));
  assert.match(readFileSync(join(java, "Pont.java"), "utf8"), /@PluginMethod\s+public void scanner\(PluginCall call\)/);
  assert.match(readFileSync(join(NATIF, "app", "build.gradle"), "utf8"), /com\.google\.android\.gms:play-services-code-scanner:\$codeScannerVersion/);
  assert.match(readFileSync(join(NATIF, "variables.gradle"), "utf8"), /codeScannerVersion = '\d+\.\d+\.\d+'/);
  const manifeste = readFileSync(join(NATIF, "app", "src", "main", "AndroidManifest.xml"), "utf8");
  assert.match(manifeste, /android:usesCleartextTraffic="true"/);
  assert.match(manifeste, /android:name="com\.google\.mlkit\.vision\.DEPENDENCIES"\s+android:value="barcode_ui"/);
});

test("ce que posent la construction et `cap sync` n'est pas une source : git l'ignore", () => {
  for (const chemin of ["android/www/index.html", "android/node_modules/x", "android/natif/app/src/main/assets/public/index.html", "android/natif/capacitor.settings.gradle", "android/natif/app/capacitor.build.gradle", "android/natif/app/build/outputs/apk/debug/app-debug.apk", "packaging/construit/Brigade-1.0.0.apk"]) {
    const lu = spawnSync("git", ["-C", APP, "check-ignore", "-q", "--no-index", chemin]);
    assert.equal(lu.status, 0, `${chemin} is not ignored`);
  }
});
