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
import { CACHE_OF_COMPILATION } from "../helpers/cache-of-compilation.ts";
import { PACKAGES } from "../helpers/posix.ts";

const COMMAND = join(APP, "packaging", "android.ts");

function folder(t: TestContext): string {
  const created = mkdtempSync(join(tmpdir(), "brigade-app-apk-"));
  t.after(() => rmSync(created, { recursive: true, force: true }));
  return created;
}

// Un `java` qui répond comme un JDK de cette version, ou aucun.
const java = (output: string | undefined): Executer => (command) =>
  output === undefined ? { status: null, stdout: "", stderr: `spawnSync ${command} ENOENT` } : { status: 0, stdout: "", stderr: output };
const JDK_21 = 'openjdk version "21.0.5" 2024-10-15\nOpenJDK Runtime Environment Temurin-21.0.5+11 (build 21.0.5+11-LTS)';

// Une machine : ses variables, son `java`, et les chemins qui y existent.
function machine(env: NodeJS.ProcessEnv, run: Executer, paths: readonly string[] = []): Machine {
  return { env, node: "26.11.1", executer: run, existe: (path) => paths.includes(path) };
}

const refusal = (doIt: () => unknown): string => {
  try {
    doIt();
  } catch (error) {
    assert.ok(error instanceof Arret);
    assert.equal(error.code, 2);
    return error.message;
  }
  return assert.fail("no refusal");
};

test("sans SDK Android ni JDK, la commande refuse (code 2) en nommant ce qui manque, sans pile d'appels ni rien écrire", (t) => {
  const here = folder(t);
  const empty = join(here, "bin");
  mkdirSync(empty);
  const output = join(here, "construit");
  const done = spawnSync(process.execPath, [COMMAND, "--sortie", output], { encoding: "utf8", env: { PATH: empty, HOME: here, ...CACHE_OF_COMPILATION } });
  assert.equal(done.status, 2, done.stderr);
  assert.match(done.stderr, /^brigade: APK not built — missing prerequisites:/);
  assert.match(done.stderr, /the Android SDK: ANDROID_HOME is not set/);
  assert.match(done.stderr, /a JDK 21: no `java` found/);
  assert.doesNotMatch(done.stderr, /^\s+at /m);
  assert.equal(existsSync(output), false);
});

test("une option inconnue est refusée avec l'usage", () => {
  const done = spawnSync(process.execPath, [COMMAND, "--autre"], { encoding: "utf8" });
  assert.equal(done.status, 2);
  assert.match(done.stderr, /usage: android\.ts \[--version <v>\] \[--sortie <folder>\]/);
});

test("les prérequis : chacun nommé quand il manque, avec de quoi le poser", { skip: PACKAGES }, () => {
  const platform = plateformeVisee();
  const sdk = "/opt/android-sdk";
  const withPlatform = [sdk, join(sdk, "platforms", `android-${platform}`)];

  assert.deepEqual(verifierPrerequis(machine({ ANDROID_HOME: sdk }, java(JDK_21), withPlatform)), { java: "java", sdk });
  // ANDROID_SDK_ROOT vaut ANDROID_HOME ; JAVA_HOME est pris avant le PATH.
  assert.deepEqual(verifierPrerequis(machine({ ANDROID_SDK_ROOT: sdk, JAVA_HOME: "/jdk" }, java(JDK_21), [...withPlatform, "/jdk/bin/java"])), { java: "/jdk/bin/java", sdk });

  assert.match(refusal(() => verifierPrerequis(machine({}, java(JDK_21)))), /the Android SDK: ANDROID_HOME is not set — install the Android SDK \(with `sdkmanager "platforms;android-\d+"`\)/);
  assert.match(refusal(() => verifierPrerequis(machine({ ANDROID_HOME: sdk }, java(JDK_21)))), /ANDROID_HOME is \/opt\/android-sdk, which does not exist/);
  assert.match(refusal(() => verifierPrerequis(machine({ ANDROID_HOME: sdk }, java(JDK_21), [sdk]))), new RegExp(`the Android SDK platform ${platform}: .* install it with \`sdkmanager "platforms;android-${platform}"\``));
  assert.match(refusal(() => verifierPrerequis(machine({ ANDROID_HOME: sdk }, java(undefined), withPlatform))), /a JDK 21: no `java` found/);
  assert.match(refusal(() => verifierPrerequis(machine({ ANDROID_HOME: sdk }, java('openjdk version "17.0.12" 2024-07-16'), withPlatform))), /java is Java 17, the build needs Java 21 to 24/);
  assert.match(refusal(() => verifierPrerequis(machine({ ANDROID_HOME: sdk, JAVA_HOME: "/jdk" }, java(JDK_21), withPlatform))), /JAVA_HOME is \/jdk, and there is no \/jdk\/bin\/java/);
  assert.match(refusal(() => verifierPrerequis({ ...machine({ ANDROID_HOME: sdk }, java(JDK_21), withPlatform), node: "24.1.0" })), /Node 26: this node is v24\.1\.0/);
  // Tout ce qui manque est dit d'un coup.
  assert.match(refusal(() => verifierPrerequis(machine({}, java(undefined)))), /missing prerequisites:\n  - a JDK 21: .*\n  - the Android SDK: /);
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
  const pkg = JSON.parse(readFileSync(join(ANDROID, "package.json"), "utf8"));
  for (const version of Object.values<string>({ ...pkg.dependencies, ...pkg.devDependencies })) assert.match(version, /^\d+\.\d+\.\d+$/);
  const lock = JSON.parse(readFileSync(join(ANDROID, "package-lock.json"), "utf8"));
  for (const name of ["@capacitor/android", "@capacitor/core", "@capacitor/cli"]) assert.equal(lock.packages[`node_modules/${name}`].version, pkg.dependencies[name] ?? pkg.devDependencies[name]);
  const wrapper = readFileSync(join(NATIF, "gradle", "wrapper", "gradle-wrapper.properties"), "utf8");
  assert.match(wrapper, /distributionUrl=.*gradle-\d+\.\d+(\.\d+)?-bin\.zip/);
  assert.match(wrapper, /distributionSha256Sum=[0-9a-f]{64}/);
  assert.match(readFileSync(join(NATIF, "build.gradle"), "utf8"), /com\.android\.tools\.build:gradle:\d+\.\d+\.\d+/);
});

test("aucun fichier d'app/src/ n'est recopié dans app/android/ : le dépôt n'y garde que l'enveloppe", () => {
  const blobs = (path: string) => {
    const readOne = spawnSync("git", ["-C", APP, "ls-files", "-s", "--", path], { encoding: "utf8" });
    assert.equal(readOne.status, 0, readOne.stderr);
    return readOne.stdout.split("\n").filter(Boolean).map((line) => ({ blob: line.split(/\s+/)[1] ?? "", chemin: line.split("\t")[1] ?? "" }));
  };
  const ofTheApp = new Set(blobs("src").map(({ blob }) => blob));
  const copied = blobs("android").filter(({ blob }) => ofTheApp.has(blob));
  assert.deepEqual(copied, []);
});

test("la vue posée pour Capacitor est celle d'app/src/vue/, et ce qu'elle charge y est", async (t) => {
  const www = join(folder(t), "www");
  poserLaVue(await demarrageDuPont(), www);
  const config = JSON.parse(readFileSync(join(ANDROID, "capacitor.config.json"), "utf8"));
  // Capacitor réclame une entrée à la racine ; l'app s'ouvre sur la vue.
  assert.ok(existsSync(join(www, "index.html")));
  const entry = join(www, config.server.appStartPath);
  assert.deepEqual(readFileSync(entry), readFileSync(join(APP, "src", "vue", "index.html")));
  assert.deepEqual(readFileSync(join(www, "src", "vue", "vue.js")), readFileSync(join(APP, "src", "vue", "vue.js")));
  // Chaque chemin de la vue hors de son dossier tient, relatif à elle, comme dans l'app.
  const html = readFileSync(entry, "utf8");
  const outsideOfTheVue = [...html.matchAll(/(?:href|src)="([^"]+)"|"@[^"]+":\s*"([^"]+)"/g)].map((finds) => finds[1] ?? finds[2] ?? "");
  assert.ok(outsideOfTheVue.length > 0);
  for (const path of outsideOfTheVue) assert.ok(existsSync(resolve(dirname(entry), path)), path);
  assert.deepEqual(dependancesDeLaVue(html), ["node_modules/@xterm/addon-fit/lib/addon-fit.mjs", "node_modules/@xterm/xterm/css/xterm.css", "node_modules/@xterm/xterm/lib/xterm.mjs", "node_modules/mermaid/dist/mermaid.min.js"]);
  assert.ok(existsSync(join(www, "android", "pont.js")));
});

test("le pont d'attente : la vue s'ouvre sans projet, chaque geste répond sans rien faire", async () => {
  const startup = await demarrageDuPont();
  const window: Record<string, unknown> = {};
  vm.runInNewContext(scriptDuPont(startup), { window });
  const bridge = window.brigade as Record<string, (...args: unknown[]) => unknown>;
  // Ce que le pont rend vient d'un autre contexte : on le compare en JSON, comme il voyagerait.
  const json = (value: unknown) => JSON.parse(JSON.stringify(value));
  const received = json(await bridge.demarrage!()) as Record<string, unknown>;
  assert.deepEqual(received.configuration, { chemin: "no projects file on this phone — the Android app reads no project yet: this phone reads nothing and sends nothing", projets: [] });
  // Le reste est ce que le process principal rendrait : les constantes des modules d'app/src/ — et le téléphone, ni
  // appairé ni connecté à GitHub sans stockage ni coffre qui en garde rien (#2500).
  assert.deepEqual(received.telephone, {});
  assert.deepEqual(Object.fromEntries(Object.entries(received).filter(([key]) => key !== "configuration" && key !== "telephone")), JSON.parse(JSON.stringify(startup)));
  assert.equal(bridge.then, undefined);
  // Chaque geste que preload.cjs offre au desktop existe : un abonnement ne reçoit rien, un geste ne rend rien.
  const actions = [...readFileSync(join(APP, "src", "preload.cjs"), "utf8").matchAll(/^ {2}([a-zA-Z]+): /gm)].map((finds) => finds[1] ?? "");
  assert.ok(actions.length > 50);
  for (const action of actions) assert.equal(typeof bridge[action], "function", action);
  assert.equal(bridge.surConfiguration!(() => assert.fail("nothing is received")), undefined);
  assert.equal(await bridge.verifier!("projet"), undefined);
});

// Le pont joué comme dans la WebView (#1161) : son stockage, et le pont natif de Capacitor (`nativePromise`), dont
// chaque appel est noté et reçoit la réponse de `natif` — ce que CapacitorHttp rendrait du guichet ou de GitHub, ce que
// rendrait le coffre, ou ce que lève un réseau qui ne joint rien.
type CallNative = { plugin: string; methode: string; options: Record<string, unknown> };
async function bridgeOfPhone(native: (call: CallNative) => unknown, storage = new Map<string, string>()) {
  const calls: CallNative[] = [];
  const window: Record<string, unknown> = {
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => void storage.set(key, value), removeItem: (key: string) => void storage.delete(key) },
    // Le pas d'attente de la connexion à GitHub, que les tests rendent nul.
    setTimeout,
    Capacitor: {
      nativePromise: async (plugin: string, method: string, options: Record<string, unknown>) => {
        // Les options viennent du contexte du pont : on les garde en JSON, comme elles passent au natif.
        calls.push({ plugin, methode: method, options: JSON.parse(JSON.stringify(options)) });
        return native({ plugin, methode: method, options });
      },
    },
  };
  // Le pont tel que la construction le pose, à côté de la vue : connecté, il y charge sa lecture GitHub (#2501).
  const www = await theVueSet();
  window.location = { href: pathToFileURL(join(www, "src", "vue", "index.html")).href };
  vm.runInNewContext(readFileSync(join(www, "android", "pont.js"), "utf8"), { window, URL }, { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  const bridge = window.brigade as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const json = async (promise: Promise<unknown>) => JSON.parse(JSON.stringify(await promise));
  return { pont: bridge, appels: calls, stockage: storage, json, window };
}
// La vue posée pour Capacitor, une fois pour ce fichier, et effacée après lui.
const SET = mkdtempSync(join(tmpdir(), "brigade-app-apk-"));
after(() => rmSync(SET, { recursive: true, force: true }));
let setOne: Promise<string> | undefined;
function theVueSet(): Promise<string> {
  setOne ??= demarrageDuPont().then((startup) => {
    poserLaVue(startup, join(SET, "www"));
    return join(SET, "www");
  });
  return setOne;
}
// GitHub tel que CapacitorHttp le rendrait au « device flow » (#2500) : le code demandé, puis, à chaque question, ce
// que `jetons` dit à son tour — le dernier se répète —, le compte qu'ouvre le jeton, et le coffre et le navigateur du
// téléphone, qui répondent sans rien dire. Le pas d'attente est nul : le pont ne patiente pas pour de faux.
const CODE_OF_GITHUB = { status: 200, headers: {}, data: { device_code: "dc_123", user_code: "A1B2-C3D4", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 0 } };
function github(tokens: unknown[], { code = CODE_OF_GITHUB as unknown, compte: account = { status: 200, headers: {}, data: { login: "benomite" } } as unknown } = {}) {
  let question = 0;
  return ({ plugin, methode: method, options }: CallNative) => {
    if (plugin === "Pont" || (plugin === "Coffre" && method === "garder")) return {};
    if (plugin === "Coffre") return {};
    if (options.url === "https://github.com/login/device/code") return typeof code === "function" ? code() : code;
    if (options.url === "https://github.com/login/oauth/access_token") return tokens[Math.min(question++, tokens.length - 1)];
    if (options.url === "https://api.github.com/user") return account;
    return assert.fail(`unexpected call: ${plugin}.${method} ${JSON.stringify(options)}`);
  };
}
const QUEUED = { status: 200, headers: {}, data: { error: "authorization_pending", error_description: "The authorization request is still pending." } };
const TOKEN = { status: 200, headers: {}, data: { access_token: "gho_secret", token_type: "bearer", scope: "gist,read:org,repo" } };
// La fin du login, qui arrive par `surConnexionGitHub`.
const theEnd = (bridge: Record<string, (...args: unknown[]) => unknown>) => new Promise<unknown>((render) => void bridge.surConnexionGitHub!((end: unknown) => render(JSON.parse(JSON.stringify(end)))));

test("le pont connecte le téléphone à GitHub : le code et sa page rendus, la page ouverte, puis, le code tapé, le jeton au coffre et le compte gardé", async () => {
  const slow = { status: 200, headers: {}, data: { error: "slow_down", interval: 0 } };
  const { pont: bridge, appels: calls, stockage: storage, json } = await bridgeOfPhone(github([QUEUED, slow, TOKEN]));
  const end = theEnd(bridge);
  assert.deepEqual(await json(bridge.seConnecterAGitHub!()), { code: "A1B2-C3D4", page: "https://github.com/login/device" });
  // Un second geste pendant que le premier attend le chef rend le même code, sans rien redemander.
  assert.deepEqual(await json(bridge.seConnecterAGitHub!()), { code: "A1B2-C3D4", page: "https://github.com/login/device" });
  assert.deepEqual(await end, { connecte: true, compte: "benomite" });
  const toGitHub = { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, connectTimeout: 10_000, readTimeout: 10_000 };
  const question = { plugin: "CapacitorHttp", methode: "request", options: { url: "https://github.com/login/oauth/access_token", ...toGitHub, data: { client_id: "178c6fc778ccc68e1d6a", device_code: "dc_123", grant_type: "urn:ietf:params:oauth:grant-type:device_code" } } };
  assert.deepEqual(calls, [
    { plugin: "CapacitorHttp", methode: "request", options: { url: "https://github.com/login/device/code", ...toGitHub, data: { client_id: "178c6fc778ccc68e1d6a", scope: "repo read:org gist" } } },
    { plugin: "Pont", methode: "ouvrir", options: { url: "https://github.com/login/device" } },
    question,
    question,
    question,
    { plugin: "Coffre", methode: "garder", options: { cle: "github", valeur: "gho_secret" } },
    { plugin: "CapacitorHttp", methode: "request", options: { url: "https://api.github.com/user", method: "GET", headers: { Accept: "application/vnd.github+json", Authorization: "Bearer gho_secret" }, connectTimeout: 10_000, readTimeout: 10_000 } },
  ]);
  // Le jeton est au coffre, jamais dans le stockage de l'app : celui-ci ne garde que le compte.
  assert.deepEqual([...storage], [["brigade.github", "benomite"]]);
});

test("au lancement, le pont dit le téléphone connecté quand le coffre garde son jeton — et rien sur une installation neuve", async () => {
  const storage = new Map([["brigade.github", "benomite"]]);
  const vault = (value: string | undefined) => ({ plugin, methode: method, options }: CallNative) => {
    assert.deepEqual([plugin, method, JSON.parse(JSON.stringify(options))], ["Coffre", "lire", { cle: "github" }]);
    return value === undefined ? {} : { valeur: value };
  };
  const relaunch = await bridgeOfPhone(vault("gho_secret"), storage);
  assert.deepEqual((await relaunch.json(relaunch.pont.demarrage!())).telephone, { github: { compte: "benomite" } });
  const freshOne = await bridgeOfPhone(vault(undefined));
  assert.deepEqual((await freshOne.json(freshOne.pont.demarrage!())).telephone, {});
  // Le compte que GitHub n'a pas dit : connecté quand même, sous un compte nul.
  const silent = await bridgeOfPhone(vault("gho_secret"));
  assert.deepEqual((await silent.json(silent.pont.demarrage!())).telephone, { github: { compte: null } });
});

test("refusée ou expirée sur GitHub, la connexion finit en le disant, rien n'est gardé, et un nouveau geste repart de zéro", async () => {
  const refusal = { status: 200, headers: {}, data: { error: "access_denied", error_description: "The user has denied your application access." } };
  const cancelled = await bridgeOfPhone(github([QUEUED, refusal]));
  let end = theEnd(cancelled.pont);
  assert.ok("code" in (await cancelled.json(cancelled.pont.seConnecterAGitHub!())));
  assert.deepEqual(await end, { refus: "The sign-in was cancelled on GitHub: this phone is not signed in.", detail: "github.com answered 200 — access_denied — The user has denied your application access." });
  assert.equal(cancelled.appels.filter(({ plugin }) => plugin === "Coffre").length, 0);
  assert.equal(cancelled.stockage.size, 0);
  // Le geste suivant redemande un code.
  cancelled.appels.length = 0;
  end = theEnd(cancelled.pont);
  assert.ok("code" in (await cancelled.json(cancelled.pont.seConnecterAGitHub!())));
  assert.equal(cancelled.appels[0]?.options.url, "https://github.com/login/device/code");
  await end;

  const expire = await bridgeOfPhone(github([{ status: 200, headers: {}, data: { error: "expired_token", error_description: "The device_code has expired." } }]));
  end = theEnd(expire.pont);
  await expire.pont.seConnecterAGitHub!();
  assert.deepEqual(await end, { refus: "The code expired before it was typed on GitHub: sign in again.", detail: "github.com answered 200 — expired_token — The device_code has expired." });

  // Le coffre qui refuse d'écrire : le téléphone n'est pas connecté, et le dit.
  const withoutVault = await bridgeOfPhone((call) => (call.plugin === "Coffre" ? Promise.reject(new Error("the phone's keystore refused to encrypt")) : github([TOKEN])(call)));
  end = theEnd(withoutVault.pont);
  await withoutVault.pont.seConnecterAGitHub!();
  assert.deepEqual(await end, { refus: "This phone could not keep its GitHub sign-in: sign in again.", detail: "the phone's keystore refused to encrypt" });
  assert.equal(withoutVault.stockage.size, 0);
});

test("GitHub injoignable, ou qui refuse de donner un code : le geste le dit aussitôt, sans rien ouvrir", async () => {
  const outsideLine = await bridgeOfPhone(() => Promise.reject(new Error('Unable to resolve host "github.com": No address associated with hostname')));
  assert.deepEqual(await outsideLine.json(outsideLine.pont.seConnecterAGitHub!()), { refus: "This phone could not reach GitHub: check its connection, then try again.", detail: 'Unable to resolve host "github.com": No address associated with hostname' });
  const closes = await bridgeOfPhone(github([], { code: { status: 400, headers: {}, data: JSON.stringify({ error: "device_flow_disabled", error_description: "Device Flow must be explicitly enabled for this App" }) } }));
  assert.deepEqual(await closes.json(closes.pont.seConnecterAGitHub!()), { refus: "GitHub did not start the sign-in: try again.", detail: "github.com answered 400 — device_flow_disabled — Device Flow must be explicitly enabled for this App" });
  assert.equal(closes.appels.some(({ plugin }) => plugin === "Pont"), false);
  // Refusé, le geste suivant redemande.
  await closes.pont.seConnecterAGitHub!();
  assert.equal(closes.appels.filter(({ options }) => options.url === "https://github.com/login/device/code").length, 2);
});

test("le pont rouvre la page de GitHub où taper le code dans le navigateur du téléphone — et nulle autre", async () => {
  const { pont: bridge, appels: calls } = await bridgeOfPhone(() => ({}));
  assert.equal(await bridge.ouvrirLaPage!("https://github.com/login/device"), true);
  assert.deepEqual(calls, [{ plugin: "Pont", methode: "ouvrir", options: { url: "https://github.com/login/device" } }]);
  assert.equal(await bridge.ouvrirLaPage!("https://example.com/login/device"), false);
  assert.equal(calls.length, 1);
});

// Les modules que le pont charge à côté de la vue posée pour Capacitor — la lecture de GitHub (#2501,
// www/src/lecture-github-telephone.js) —, sans leurs types, avec ce qu'ils importent d'app/src/.
test("les lectures du pont sont posées à côté de la vue, sans types ni modules de Node, et chaque import y tient", async (t) => {
  const www = join(folder(t), "www");
  poserLaVue(await demarrageDuPont(), www);
  const poses = poserLesModules(www);
  assert.ok(!poses.includes("android/lecture.js") && poses.includes("src/lecture-github-telephone.js") && poses.includes("src/gestes-github-telephone.js"));
  assert.ok(poses.includes("src/faits.js") && poses.includes("src/attend.js") && poses.includes("src/accueil.js"));
  for (const pose of poses.filter((path) => path.endsWith(".js"))) {
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

// La WebView n'a rien de Node : ni `process`, ni ses modules. La lecture posée, et tout ce qu'elle importe d'app/src/,
// se charge dans un Node privé de `process` — un module qui le lit à son chargement l'y ferait lever, et le téléphone
// ne lirait rien (#1420 : `platform.ts`, par les gestes de la fiche).
test("la lecture posée se charge sans rien de Node, comme dans la WebView", async (t) => {
  const www = join(folder(t), "www");
  poserLaVue(await demarrageDuPont(), www);
  const load = spawnSync(process.execPath, ["--input-type=module", "-e", 'const lu = process.argv[1]; delete globalThis.process; import(lu).then((module) => console.log(Object.keys(module).sort().join(" ")), (erreur) => console.log(`KO ${erreur.message}`))', pathToFileURL(join(www, "src", "lecture-github-telephone.js")).href], { encoding: "utf8" });
  assert.equal(load.stdout.trim(), "INTERVALLE_MS lireLesProjetsDuCompte ouvrirLaLectureGitHub parCapacitor", load.stderr);
});

test("l'enveloppe native n'appaire plus : ni lecteur de QR ni lien `brigade://pair` ; le navigateur du pont, et aucun http en clair", () => {
  const java = join(NATIF, "app", "src", "main", "java", ...IDENTIFIANT.split("."));
  const bridge = readFileSync(join(java, "Pont.java"), "utf8");
  assert.match(bridge, /@PluginMethod\s+public void ouvrir\(PluginCall call\)/);
  assert.doesNotMatch(bridge, /public void (scanner|lien)\(|mlkit/);
  // Une intention neuve n'ouvre plus d'appairage : elle ouvre la carte d'une notification de TODO (#2747).
  assert.doesNotMatch(readFileSync(join(NATIF, "app", "build.gradle"), "utf8"), /code-scanner/);
  assert.doesNotMatch(readFileSync(join(NATIF, "variables.gradle"), "utf8"), /codeScannerVersion/);
  const manifest = readFileSync(join(NATIF, "app", "src", "main", "AndroidManifest.xml"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  assert.doesNotMatch(manifest, /usesCleartextTraffic/);
  assert.doesNotMatch(manifest, /mlkit|android:scheme="brigade"/);
  // Le coffre où la connexion à GitHub garde son jeton (#2500) est enregistré.
  assert.match(readFileSync(join(java, "MainActivity.java"), "utf8"), /registerPlugin\(Coffre\.class\)/);
});

test("ce que posent la construction et `cap sync` n'est pas une source : git l'ignore", () => {
  for (const path of ["android/www/index.html", "android/node_modules/x", "android/natif/app/src/main/assets/public/index.html", "android/natif/capacitor.settings.gradle", "android/natif/app/capacitor.build.gradle", "android/natif/app/build/outputs/apk/debug/app-debug.apk", "packaging/construit/Brigade-1.0.0.apk"]) {
    const readOne = spawnSync("git", ["-C", APP, "check-ignore", "-q", "--no-index", path]);
    assert.equal(readOne.status, 0, `${path} is not ignored`);
  }
});
