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
  assert.deepEqual(recu.configuration, { chemin: "no projects file on this phone — the Android app reads no project yet: this phone reads nothing and sends nothing", projets: [] });
  // Le reste est ce que le process principal rendrait : les constantes des modules d'app/src/ — et le téléphone, ni
  // appairé ni connecté à GitHub sans stockage ni coffre qui en garde rien (#2500).
  assert.deepEqual(recu.telephone, {});
  assert.deepEqual(Object.fromEntries(Object.entries(recu).filter(([cle]) => cle !== "configuration" && cle !== "telephone")), JSON.parse(JSON.stringify(demarrage)));
  assert.equal(pont.then, undefined);
  // Chaque geste que preload.cjs offre au desktop existe : un abonnement ne reçoit rien, un geste ne rend rien.
  const gestes = [...readFileSync(join(APP, "src", "preload.cjs"), "utf8").matchAll(/^ {2}([a-zA-Z]+): /gm)].map((trouve) => trouve[1] ?? "");
  assert.ok(gestes.length > 50);
  for (const geste of gestes) assert.equal(typeof pont[geste], "function", geste);
  assert.equal(pont.surConfiguration!(() => assert.fail("nothing is received")), undefined);
  assert.equal(await pont.verifier!("projet"), undefined);
});

// Le pont joué comme dans la WebView (#1161) : son stockage, et le pont natif de Capacitor (`nativePromise`), dont
// chaque appel est noté et reçoit la réponse de `natif` — ce que CapacitorHttp rendrait du guichet ou de GitHub, ce que
// rendrait le coffre, ou ce que lève un réseau qui ne joint rien.
type AppelNatif = { plugin: string; methode: string; options: Record<string, unknown> };
async function pontDuTelephone(natif: (appel: AppelNatif) => unknown, stockage = new Map<string, string>()) {
  const appels: AppelNatif[] = [];
  const window: Record<string, unknown> = {
    localStorage: { getItem: (cle: string) => stockage.get(cle) ?? null, setItem: (cle: string, valeur: string) => void stockage.set(cle, valeur), removeItem: (cle: string) => void stockage.delete(cle) },
    // Le pas d'attente de la connexion à GitHub, que les tests rendent nul.
    setTimeout,
    Capacitor: {
      nativePromise: async (plugin: string, methode: string, options: Record<string, unknown>) => {
        // Les options viennent du contexte du pont : on les garde en JSON, comme elles passent au natif.
        appels.push({ plugin, methode, options: JSON.parse(JSON.stringify(options)) });
        return natif({ plugin, methode, options });
      },
    },
  };
  // Le pont tel que la construction le pose, à côté de la vue : connecté, il y charge sa lecture GitHub (#2501).
  const www = await laVuePosee();
  window.location = { href: pathToFileURL(join(www, "src", "vue", "index.html")).href };
  vm.runInNewContext(readFileSync(join(www, "android", "pont.js"), "utf8"), { window, URL }, { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  const pont = window.brigade as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const json = async (promesse: Promise<unknown>) => JSON.parse(JSON.stringify(await promesse));
  return { pont, appels, stockage, json, window };
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
// GitHub tel que CapacitorHttp le rendrait au « device flow » (#2500) : le code demandé, puis, à chaque question, ce
// que `jetons` dit à son tour — le dernier se répète —, le compte qu'ouvre le jeton, et le coffre et le navigateur du
// téléphone, qui répondent sans rien dire. Le pas d'attente est nul : le pont ne patiente pas pour de faux.
const CODE_DE_GITHUB = { status: 200, headers: {}, data: { device_code: "dc_123", user_code: "A1B2-C3D4", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 0 } };
function github(jetons: unknown[], { code = CODE_DE_GITHUB as unknown, compte = { status: 200, headers: {}, data: { login: "benomite" } } as unknown } = {}) {
  let question = 0;
  return ({ plugin, methode, options }: AppelNatif) => {
    if (plugin === "Pont" || (plugin === "Coffre" && methode === "garder")) return {};
    if (plugin === "Coffre") return {};
    if (options.url === "https://github.com/login/device/code") return typeof code === "function" ? code() : code;
    if (options.url === "https://github.com/login/oauth/access_token") return jetons[Math.min(question++, jetons.length - 1)];
    if (options.url === "https://api.github.com/user") return compte;
    return assert.fail(`unexpected call: ${plugin}.${methode} ${JSON.stringify(options)}`);
  };
}
const EN_ATTENTE = { status: 200, headers: {}, data: { error: "authorization_pending", error_description: "The authorization request is still pending." } };
const JETON = { status: 200, headers: {}, data: { access_token: "gho_secret", token_type: "bearer", scope: "gist,read:org,repo" } };
// La fin du login, qui arrive par `surConnexionGitHub`.
const laFin = (pont: Record<string, (...args: unknown[]) => unknown>) => new Promise<unknown>((rendre) => void pont.surConnexionGitHub!((fin: unknown) => rendre(JSON.parse(JSON.stringify(fin)))));

test("le pont connecte le téléphone à GitHub : le code et sa page rendus, la page ouverte, puis, le code tapé, le jeton au coffre et le compte gardé", async () => {
  const lent = { status: 200, headers: {}, data: { error: "slow_down", interval: 0 } };
  const { pont, appels, stockage, json } = await pontDuTelephone(github([EN_ATTENTE, lent, JETON]));
  const fin = laFin(pont);
  assert.deepEqual(await json(pont.seConnecterAGitHub!()), { code: "A1B2-C3D4", page: "https://github.com/login/device" });
  // Un second geste pendant que le premier attend le chef rend le même code, sans rien redemander.
  assert.deepEqual(await json(pont.seConnecterAGitHub!()), { code: "A1B2-C3D4", page: "https://github.com/login/device" });
  assert.deepEqual(await fin, { connecte: true, compte: "benomite" });
  const versGitHub = { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, connectTimeout: 10_000, readTimeout: 10_000 };
  const question = { plugin: "CapacitorHttp", methode: "request", options: { url: "https://github.com/login/oauth/access_token", ...versGitHub, data: { client_id: "178c6fc778ccc68e1d6a", device_code: "dc_123", grant_type: "urn:ietf:params:oauth:grant-type:device_code" } } };
  assert.deepEqual(appels, [
    { plugin: "CapacitorHttp", methode: "request", options: { url: "https://github.com/login/device/code", ...versGitHub, data: { client_id: "178c6fc778ccc68e1d6a", scope: "repo read:org gist" } } },
    { plugin: "Pont", methode: "ouvrir", options: { url: "https://github.com/login/device" } },
    question,
    question,
    question,
    { plugin: "Coffre", methode: "garder", options: { cle: "github", valeur: "gho_secret" } },
    { plugin: "CapacitorHttp", methode: "request", options: { url: "https://api.github.com/user", method: "GET", headers: { Accept: "application/vnd.github+json", Authorization: "Bearer gho_secret" }, connectTimeout: 10_000, readTimeout: 10_000 } },
  ]);
  // Le jeton est au coffre, jamais dans le stockage de l'app : celui-ci ne garde que le compte.
  assert.deepEqual([...stockage], [["brigade.github", "benomite"]]);
});

test("au lancement, le pont dit le téléphone connecté quand le coffre garde son jeton — et rien sur une installation neuve", async () => {
  const stockage = new Map([["brigade.github", "benomite"]]);
  const coffre = (valeur: string | undefined) => ({ plugin, methode, options }: AppelNatif) => {
    assert.deepEqual([plugin, methode, JSON.parse(JSON.stringify(options))], ["Coffre", "lire", { cle: "github" }]);
    return valeur === undefined ? {} : { valeur };
  };
  const relance = await pontDuTelephone(coffre("gho_secret"), stockage);
  assert.deepEqual((await relance.json(relance.pont.demarrage!())).telephone, { github: { compte: "benomite" } });
  const neuve = await pontDuTelephone(coffre(undefined));
  assert.deepEqual((await neuve.json(neuve.pont.demarrage!())).telephone, {});
  // Le compte que GitHub n'a pas dit : connecté quand même, sous un compte nul.
  const muet = await pontDuTelephone(coffre("gho_secret"));
  assert.deepEqual((await muet.json(muet.pont.demarrage!())).telephone, { github: { compte: null } });
});

test("refusée ou expirée sur GitHub, la connexion finit en le disant, rien n'est gardé, et un nouveau geste repart de zéro", async () => {
  const refus = { status: 200, headers: {}, data: { error: "access_denied", error_description: "The user has denied your application access." } };
  const annule = await pontDuTelephone(github([EN_ATTENTE, refus]));
  let fin = laFin(annule.pont);
  assert.ok("code" in (await annule.json(annule.pont.seConnecterAGitHub!())));
  assert.deepEqual(await fin, { refus: "The sign-in was cancelled on GitHub: this phone is not signed in.", detail: "github.com answered 200 — access_denied — The user has denied your application access." });
  assert.equal(annule.appels.filter(({ plugin }) => plugin === "Coffre").length, 0);
  assert.equal(annule.stockage.size, 0);
  // Le geste suivant redemande un code.
  annule.appels.length = 0;
  fin = laFin(annule.pont);
  assert.ok("code" in (await annule.json(annule.pont.seConnecterAGitHub!())));
  assert.equal(annule.appels[0]?.options.url, "https://github.com/login/device/code");
  await fin;

  const expire = await pontDuTelephone(github([{ status: 200, headers: {}, data: { error: "expired_token", error_description: "The device_code has expired." } }]));
  fin = laFin(expire.pont);
  await expire.pont.seConnecterAGitHub!();
  assert.deepEqual(await fin, { refus: "The code expired before it was typed on GitHub: sign in again.", detail: "github.com answered 200 — expired_token — The device_code has expired." });

  // Le coffre qui refuse d'écrire : le téléphone n'est pas connecté, et le dit.
  const sansCoffre = await pontDuTelephone((appel) => (appel.plugin === "Coffre" ? Promise.reject(new Error("the phone's keystore refused to encrypt")) : github([JETON])(appel)));
  fin = laFin(sansCoffre.pont);
  await sansCoffre.pont.seConnecterAGitHub!();
  assert.deepEqual(await fin, { refus: "This phone could not keep its GitHub sign-in: sign in again.", detail: "the phone's keystore refused to encrypt" });
  assert.equal(sansCoffre.stockage.size, 0);
});

test("GitHub injoignable, ou qui refuse de donner un code : le geste le dit aussitôt, sans rien ouvrir", async () => {
  const horsLigne = await pontDuTelephone(() => Promise.reject(new Error('Unable to resolve host "github.com": No address associated with hostname')));
  assert.deepEqual(await horsLigne.json(horsLigne.pont.seConnecterAGitHub!()), { refus: "This phone could not reach GitHub: check its connection, then try again.", detail: 'Unable to resolve host "github.com": No address associated with hostname' });
  const ferme = await pontDuTelephone(github([], { code: { status: 400, headers: {}, data: JSON.stringify({ error: "device_flow_disabled", error_description: "Device Flow must be explicitly enabled for this App" }) } }));
  assert.deepEqual(await ferme.json(ferme.pont.seConnecterAGitHub!()), { refus: "GitHub did not start the sign-in: try again.", detail: "github.com answered 400 — device_flow_disabled — Device Flow must be explicitly enabled for this App" });
  assert.equal(ferme.appels.some(({ plugin }) => plugin === "Pont"), false);
  // Refusé, le geste suivant redemande.
  await ferme.pont.seConnecterAGitHub!();
  assert.equal(ferme.appels.filter(({ options }) => options.url === "https://github.com/login/device/code").length, 2);
});

test("le pont rouvre la page de GitHub où taper le code dans le navigateur du téléphone — et nulle autre", async () => {
  const { pont, appels } = await pontDuTelephone(() => ({}));
  assert.equal(await pont.ouvrirLaPage!("https://github.com/login/device"), true);
  assert.deepEqual(appels, [{ plugin: "Pont", methode: "ouvrir", options: { url: "https://github.com/login/device" } }]);
  assert.equal(await pont.ouvrirLaPage!("https://example.com/login/device"), false);
  assert.equal(appels.length, 1);
});

// Les modules que le pont charge à côté de la vue posée pour Capacitor — la lecture de GitHub (#2501,
// www/src/lecture-github-telephone.js) —, sans leurs types, avec ce qu'ils importent d'app/src/.
test("les lectures du pont sont posées à côté de la vue, sans types ni modules de Node, et chaque import y tient", async (t) => {
  const www = join(dossier(t), "www");
  poserLaVue(await demarrageDuPont(), www);
  const poses = poserLesModules(www);
  assert.ok(!poses.includes("android/lecture.js") && poses.includes("src/lecture-github-telephone.js") && poses.includes("src/gestes-github-telephone.js"));
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

// La WebView n'a rien de Node : ni `process`, ni ses modules. La lecture posée, et tout ce qu'elle importe d'app/src/,
// se charge dans un Node privé de `process` — un module qui le lit à son chargement l'y ferait lever, et le téléphone
// ne lirait rien (#1420 : `plateforme.ts`, par les gestes de la fiche).
test("la lecture posée se charge sans rien de Node, comme dans la WebView", async (t) => {
  const www = join(dossier(t), "www");
  poserLaVue(await demarrageDuPont(), www);
  const charge = spawnSync(process.execPath, ["--input-type=module", "-e", 'const lu = process.argv[1]; delete globalThis.process; import(lu).then((module) => console.log(Object.keys(module).sort().join(" ")), (erreur) => console.log(`KO ${erreur.message}`))', pathToFileURL(join(www, "src", "lecture-github-telephone.js")).href], { encoding: "utf8" });
  assert.equal(charge.stdout.trim(), "INTERVALLE_MS lireLesProjetsDuCompte ouvrirLaLectureGitHub parCapacitor", charge.stderr);
});

test("l'enveloppe native n'appaire plus : ni lecteur de QR ni lien `brigade://pair` ; le navigateur du pont, et aucun http en clair", () => {
  const java = join(NATIF, "app", "src", "main", "java", ...IDENTIFIANT.split("."));
  const pont = readFileSync(join(java, "Pont.java"), "utf8");
  assert.match(pont, /@PluginMethod\s+public void ouvrir\(PluginCall call\)/);
  assert.doesNotMatch(pont, /public void (scanner|lien)\(|mlkit/);
  // Une intention neuve n'ouvre plus d'appairage : elle ouvre la carte d'une notification de TODO (#2747).
  assert.doesNotMatch(readFileSync(join(NATIF, "app", "build.gradle"), "utf8"), /code-scanner/);
  assert.doesNotMatch(readFileSync(join(NATIF, "variables.gradle"), "utf8"), /codeScannerVersion/);
  const manifeste = readFileSync(join(NATIF, "app", "src", "main", "AndroidManifest.xml"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  assert.doesNotMatch(manifeste, /usesCleartextTraffic/);
  assert.doesNotMatch(manifeste, /mlkit|android:scheme="brigade"/);
  // Le coffre où la connexion à GitHub garde son jeton (#2500) est enregistré.
  assert.match(readFileSync(join(java, "MainActivity.java"), "utf8"), /registerPlugin\(Coffre\.class\)/);
});

test("ce que posent la construction et `cap sync` n'est pas une source : git l'ignore", () => {
  for (const chemin of ["android/www/index.html", "android/node_modules/x", "android/natif/app/src/main/assets/public/index.html", "android/natif/capacitor.settings.gradle", "android/natif/app/capacitor.build.gradle", "android/natif/app/build/outputs/apk/debug/app-debug.apk", "packaging/construit/Brigade-1.0.0.apk"]) {
    const lu = spawnSync("git", ["-C", APP, "check-ignore", "-q", "--no-index", chemin]);
    assert.equal(lu.status, 0, `${chemin} is not ignored`);
  }
});
