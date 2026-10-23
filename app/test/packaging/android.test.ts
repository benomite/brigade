// L'APK de l'app Android (app/packaging/android.ts) : ses prérequis, nommés quand ils manquent, la vue
// qu'il pose — celle d'app/src/vue/, sans copie dans le dépôt — et le pont d'attente qui la laisse
// s'ouvrir. Ni JDK, ni SDK Android, ni réseau : la construction elle-même, Gradle et l'APK qui
// s'ouvre sur un émulateur, sont éprouvés en CI (app/packaging/README.md, « L'APK Android »).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test, type TestContext } from "node:test";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { ANDROID, dependancesDeLaVue, demarrageDuPont, majeureDuJdk, NATIF, plateformeVisee, poserLaVue, poserLesModules, scriptDuPont, verifierPrerequis, type Machine } from "../../packaging/android.ts";
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
    localStorage: { getItem: (cle: string) => stockage.get(cle) ?? null, setItem: (cle: string, valeur: string) => void stockage.set(cle, valeur), removeItem: (cle: string) => void stockage.delete(cle) },
    Capacitor: {
      nativePromise: async (plugin: string, methode: string, options: Record<string, unknown>) => {
        // Les options viennent du contexte du pont : on les garde en JSON, comme elles passent au natif.
        appels.push({ plugin, methode, options: JSON.parse(JSON.stringify(options)) });
        return natif({ plugin, methode, options });
      },
    },
  };
  // Le pont tel que la construction le pose, à côté de la vue : appairé, il y charge sa lecture (#1414).
  const www = await laVuePosee();
  window.location = { href: pathToFileURL(join(www, "src", "vue", "index.html")).href };
  vm.runInNewContext(readFileSync(join(www, "android", "pont.js"), "utf8"), { window, URL }, { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  const pont = window.brigade as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const json = async (promesse: Promise<unknown>) => JSON.parse(JSON.stringify(await promesse));
  return { pont, appels, stockage, json };
}
// La vue posée pour Capacitor, une fois pour ce fichier, et effacée après lui.
const POSEE = mkdtempSync(join(tmpdir(), "brigade-app-apk-"));
after(() => rmSync(POSEE, { recursive: true, force: true }));
let posee: Promise<string> | undefined;
function laVuePosee(): Promise<string> {
  posee ??= demarrageDuPont().then((demarrage) => {
    poserLaVue(demarrage, join(POSEE, "www"));
    return join(POSEE, "www");
  });
  return posee;
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

// Une box louée ailleurs, jointe du réseau mobile par le tailnet du chef (#1409) : `tailscale serve` publie son guichet
// en https, et répond 502 quand rien n'écoute derrière lui.
const TAILNET = { ...DEMANDE, adresse: "https://box.tail1234.ts.net" };

test("le pont appaire le téléphone par le tailnet : la demande part en https au nom de la box, et l'app se sait appairée à elle", async () => {
  const { pont, appels, stockage, json } = await pontDuTelephone(() => ({ status: 201, headers: {}, data: { paired: true, station: { ...STATION, nom: "box" }, token: "brgt_secret" } }));
  assert.deepEqual(await json(pont.appairerLeTelephone!(TAILNET)), { paired: true, station: "box" });
  assert.equal(appels[0]?.options.url, "https://box.tail1234.ts.net/pairing");
  const relance = await pontDuTelephone(() => assert.fail("nothing is sent at launch"), stockage);
  assert.deepEqual((await relance.json(relance.pont.demarrage!())).telephone, { appaire: true, station: "box", adresse: "https://box.tail1234.ts.net" });
});

test("par le tailnet, le pont dit ce qui ne se joint pas : la box elle-même, ou le guichet derrière `tailscale serve`", async () => {
  const eteint = await pontDuTelephone(() => {
    throw { message: 'Unable to resolve host "box.tail1234.ts.net": No address associated with hostname' };
  });
  assert.deepEqual(await eteint.json(eteint.pont.appairerLeTelephone!(TAILNET)), { paired: false, reason: "injoignable", said: 'Unable to resolve host "box.tail1234.ts.net": No address associated with hostname' });
  for (const status of [502, 503, 504]) {
    const muet = await pontDuTelephone(() => ({ status, headers: {}, data: "" }));
    assert.deepEqual(await muet.json(muet.pont.appairerLeTelephone!(TAILNET)), { paired: false, reason: "sans-guichet", said: `https://box.tail1234.ts.net answered ${status}: nothing answers behind it` });
    assert.equal(muet.stockage.size, 0);
  }
  assert.equal(eteint.stockage.size, 0);
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

// Le pont appairé lit sa station (#1414) : joué depuis la vue posée pour Capacitor, comme dans la WebView — son script,
// et le module de lecture qu'il charge à côté d'elle (www/android/lecture.js), sans ses types, avec ce qu'il importe
// d'app/src/. Seul le HTTP natif est un faux, qui rend ce que le guichet rend.
test("la lecture de la station est posée à côté de la vue, sans types ni modules de Node, et chaque import y tient", async (t) => {
  const www = join(dossier(t), "www");
  poserLaVue(await demarrageDuPont(), www);
  const poses = poserLesModules(www);
  assert.ok(poses.includes("android/lecture.js"));
  assert.ok(poses.includes("src/faits.js") && poses.includes("src/attend.js") && poses.includes("src/accueil.js"));
  for (const pose of poses.filter((chemin) => chemin.endsWith(".js"))) {
    const code = readFileSync(join(www, pose), "utf8");
    // Aucun import ne reste vers un fichier TypeScript, ni vers un module de Node : chacun est un fichier posé.
    for (const [, specificateur = ""] of code.matchAll(/\b(?:import|export)\b[^"'`;]*?\bfrom\s*"([^"]+)"/g)) {
      assert.ok(specificateur.startsWith("."), `${pose} imports ${specificateur}`);
      assert.ok(existsSync(resolve(dirname(join(www, pose)), specificateur)), `${pose} imports ${specificateur}, absent`);
    }
  }
  // Ce que les modules d'app/src/ importent de Node pour le desktop est inerte : rien ne l'appelle sur le téléphone.
  assert.match(readFileSync(join(www, "android", "node", "child_process.js"), "utf8"), /export const execFile = inerte;/);
});

test("le pont appairé lit les projets de sa station et leur file au guichet, avec son jeton, et les dit à la vue", async (t) => {
  const www = join(dossier(t), "www");
  poserLaVue(await demarrageDuPont(), www);
  const facts = { etat: "ouverte", lu: "2026-10-23T08:04:11.000Z", dernierTick: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [], stations: [] };
  const projets = [
    { name: "parade", repository: "chef/parade", state: "served" },
    { name: "cantine", repository: "chef/cantine", state: "served" },
  ];
  const stockage = new Map([
    ["brigade.telephone", JSON.stringify({ station: "atelier", adresse: "http://192.168.1.20:7010", jeton: "brgt_secret" })],
    ["brigade.telephone.projets", JSON.stringify([projets[0]])],
  ]);
  const appels: Record<string, unknown>[] = [];
  const window: Record<string, unknown> = {
    location: { href: pathToFileURL(join(www, "src", "vue", "index.html")).href },
    localStorage: { getItem: (cle: string) => stockage.get(cle) ?? null, setItem: (cle: string, valeur: string) => void stockage.set(cle, valeur), removeItem: (cle: string) => void stockage.delete(cle) },
    Capacitor: {
      nativePromise: async (_plugin: string, _methode: string, options: Record<string, unknown>) => {
        appels.push(JSON.parse(JSON.stringify(options)));
        const chemin = String(options.url).replace("http://192.168.1.20:7010", "");
        if (chemin === "/projects") return { status: 200, headers: {}, data: { projects: projets } };
        return { status: 200, headers: {}, data: JSON.stringify({ project: "x", repository: "chef/x", facts, status: "état : cuisine ouverte\n" }) };
      },
    },
  };
  const script = readFileSync(join(www, "android", "pont.js"), "utf8");
  vm.runInNewContext(script, { window, URL }, { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  const pont = window.brigade as Record<string, (...args: unknown[]) => unknown>;
  const recus: Record<string, unknown[][]> = {};
  for (const canal of ["surConfiguration", "surFaits", "surTelephone", "surAccueil", "surAlertes", "surLecture"]) pont[canal]!((...args: unknown[]) => void (recus[canal] ??= []).push(JSON.parse(JSON.stringify(args))));
  // Relancée, l'app s'ouvre sur les projets de la dernière liste lue, avant toute lecture.
  const demarrage = JSON.parse(JSON.stringify(await pont.demarrage!()));
  assert.deepEqual(demarrage.configuration.projets.map(({ nom }: { nom: string }) => nom), ["parade"]);
  assert.deepEqual(demarrage.telephone, { appaire: true, station: "atelier", adresse: "http://192.168.1.20:7010" });
  assert.deepEqual(appels, []);
  pont.faits!(1);
  pont.tous!(2);
  // La lecture répond sans attendre d'horloge : on attend qu'elle ait dit les deux files.
  for (let tour = 0; tour < 1000 && (recus.surFaits ?? []).filter(([recue]) => (recue as { demande: number }).demande === 1).length < 2; tour++) await new Promise((fait) => setImmediate(fait));
  assert.deepEqual(recus.surConfiguration?.[0]?.[0] && (recus.surConfiguration[0][0] as { projets: { nom: string }[] }).projets.map(({ nom }) => nom), ["parade", "cantine"]);
  assert.deepEqual(JSON.parse(stockage.get("brigade.telephone.projets") ?? "null"), projets);
  assert.deepEqual(
    appels.slice(0, 3).map(({ url, method, headers }) => ({ url, method, headers })),
    ["/projects", "/projects/parade/queue", "/projects/cantine/queue"].map((chemin) => ({ url: `http://192.168.1.20:7010${chemin}`, method: "GET", headers: { Authorization: "Bearer brgt_secret" } })),
  );
  const dessines = (recus.surFaits ?? []).map(([recue]) => recue as { projet: string; demande: number; tableau?: unknown });
  assert.deepEqual([...new Set(dessines.filter(({ demande }) => demande === 1).map(({ projet }) => projet))].sort(), ["cantine", "parade"]);
  assert.ok(dessines.every((recue) => "tableau" in recue));
  assert.ok((recus.surLecture ?? []).some(([montree]) => (montree as { projet: string; demande: number }).demande === 2));
  assert.equal((recus.surTelephone?.at(-1)?.[0] as { liste?: { lue: boolean } }).liste?.lue, true);
  // Oublié, l'appairage s'efface — le jeton et la liste — et le lancement suivant ouvre l'écran qui relie le téléphone.
  await pont.oublierLeTelephone!();
  assert.equal(stockage.size, 0);
});

// La WebView n'a rien de Node : ni `process`, ni ses modules. La lecture posée, et tout ce qu'elle importe d'app/src/,
// se charge dans un Node privé de `process` — un module qui le lit à son chargement l'y ferait lever, et le téléphone
// appairé ne lirait rien (#1420 : `plateforme.ts`, par les gestes de la fiche).
test("la lecture posée se charge sans rien de Node, comme dans la WebView", async (t) => {
  const www = join(dossier(t), "www");
  poserLaVue(await demarrageDuPont(), www);
  const charge = spawnSync(process.execPath, ["--input-type=module", "-e", 'const lu = process.argv[1]; delete globalThis.process; import(lu).then((module) => console.log(Object.keys(module).sort().join(" ")), (erreur) => console.log(`KO ${erreur.message}`))', pathToFileURL(join(www, "android", "lecture.js")).href], { encoding: "utf8" });
  assert.equal(charge.stdout.trim(), "GESTES_DU_GUICHET INTERVALLE_MS ouvrirLaLecture", charge.stderr);
});

// Les gestes de la fiche, par le pont appairé (#1420) : un `POST` au guichet, avec le jeton, le geste et le ticket, et
// le temps qu'un merge prend sur la station ; ce que la station en dit revient à la vue.
test("le pont appairé joue les gestes de la fiche au guichet, avec son jeton, et rend ce que la station en a dit", async () => {
  const stockage = new Map([["brigade.telephone", JSON.stringify({ station: "atelier", adresse: "http://192.168.1.20:7010", jeton: "brgt_secret" })]]);
  const reponses: unknown[] = [
    { status: 200, headers: {}, data: { done: true, said: "#12: merged (PR #40)", detail: "$ brigade parade rail merge 12\n→ exit code 0" } },
    { status: 409, headers: {}, data: JSON.stringify({ done: false, said: "#31 is not on the rail", detail: "$ brigade parade rail remove 31\n→ exit code 1" }) },
  ];
  const { pont, appels, json } = await pontDuTelephone(() => {
    const reponse = reponses.shift();
    if (reponse === undefined) throw new Error("failed to connect to /192.168.1.20 (port 7010) after 10000ms");
    return reponse;
  }, stockage);
  const carte = { ticket: 12, etat: "en pass", ouvrable: true, attendu: true, decision: { quoi: "merge", motif: "no-grant", cause: null, pr: "https://github.com/chef/parade/pull/40" }, pr: true };
  assert.deepEqual((await json(pont.gestesDeFiche!(carte))).map(({ id }: { id: string }) => id), ["merger"]);
  assert.deepEqual(await json(pont.gesteDeFiche!("parade", "merger", 12)), { fait: "#12: merged (PR #40)", detail: "$ brigade parade rail merge 12\n→ exit code 0" });
  assert.deepEqual(appels, [
    {
      plugin: "CapacitorHttp",
      methode: "request",
      options: { url: "http://192.168.1.20:7010/projects/parade/gestures", method: "POST", headers: { Authorization: "Bearer brgt_secret", "Content-Type": "application/json" }, data: { gesture: "merge", ticket: 12 }, connectTimeout: 10_000, readTimeout: 130_000 },
    },
  ]);
  assert.deepEqual(await json(pont.gesteDeFiche!("parade", "retirer", 31)), { refus: "#31 is not on the rail", detail: "$ brigade parade rail remove 31\n→ exit code 1" });
  assert.deepEqual((appels.at(-1)?.options as { data: unknown }).data, { gesture: "remove", ticket: 31 });
  assert.deepEqual(await json(pont.gesteDeFiche!("parade", "cuisine", 44)), { refus: "atelier could not be reached: nothing was changed", detail: "failed to connect to /192.168.1.20 (port 7010) after 10000ms" });
  assert.deepEqual((appels.at(-1)?.options as { data: unknown }).data, { gesture: "back-to-kitchen", ticket: 44 });
  // Un geste que le guichet ne porte pas ne part pas.
  const envoyes = appels.length;
  assert.equal((await json(pont.gesteDeFiche!("parade", "priorite", 12, "1"))).refus, "nothing was sent: this phone does not carry this action to its station");
  assert.equal(appels.length, envoyes);
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
