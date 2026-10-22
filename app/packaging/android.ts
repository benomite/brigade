// Construit l'APK de l'app Android : l'enveloppe Capacitor d'app/android/ autour de la même vue que
// l'app desktop (app/src/vue/), en une seule commande, depuis un clone, sur Linux ou macOS.
//
//   node app/packaging/android.ts                     l'APK du commit construit
//   node app/packaging/android.ts --version 1.2.0
//   node app/packaging/android.ts --sortie <dossier>
//
// L'APK s'écrit dans app/packaging/construit/ (ou `--sortie`), sous le nom
// Brigade-<version>.apk, et la commande dit son chemin. C'est un APK de debug : signé par la clé de
// debug du SDK (~/.android/debug.keystore, posée au premier besoin), il s'installe tel quel
// (`adb install`) ; il n'est pas fait pour un store.
//
// Les étapes, toutes depuis ce qui est épinglé dans le dépôt :
//   1. les prérequis — Node, un JDK, le SDK Android et sa plateforme — vérifiés avant tout : ce qui
//      manque est nommé, et rien n'est écrit ;
//   2. les dépendances d'app/android/ (Capacitor, à la version de son verrou, `npm ci`), et celles de
//      l'app si la vue n'a pas les siennes (`npm ci --ignore-scripts --prefix app`) ;
//   3. app/android/www/ : la vue d'app/src/vue/ telle quelle, ce qu'elle charge de node_modules
//      (xterm), l'entrée que Capacitor réclame et le pont d'attente (app/android/web/) ;
//   4. `cap sync android`, puis `./gradlew assembleDebug` dans app/android/natif/ — Gradle, Android
//      Gradle Plugin et le SDK visé sont ceux qu'épingle ce projet.
//
// La version vient, sans `--version`, du commit construit, comme pour le .dmg (construire.ts) :
// 0.<AAAAMMJJ>.<HHMMSS>+g<commit>. Elle est la `versionName` de l'APK.
//
// Codes de sortie : 0 construit, 1 la construction a échoué, 2 refus (option invalide, prérequis
// manquant) — rien n'est écrit.
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Pont } from "../src/vue/pont.d.ts";
import { APP, Arret, executerVraiment, versionDuCommit, type Executer } from "./construire.ts";

const REFUS = 2;
const ECHEC = 1;

const ICI = import.meta.dirname;
export const ANDROID = join(APP, "android");
export const NATIF = join(ANDROID, "natif");
export const WWW = join(ANDROID, "www");
// Les JDK sous lesquels ce projet se construit : Capacitor 8 compile en Java 21, Gradle 8.14 ne
// tourne pas au-delà de Java 24.
export const JDK_MIN = 21;
export const JDK_MAX = 24;

const refuser = (motif: string): never => {
  throw new Arret(motif, REFUS);
};
const echouer = (motif: string): never => {
  throw new Arret(motif, ECHEC);
};

// La majeure qu'un `engines.node` réclame.
const majeureDe = (engines: string | undefined) => Number(/\d+/.exec(engines ?? "")?.[0]);

// Le `compileSdkVersion` que le projet Gradle épingle : la plateforme du SDK qu'il lui faut.
export function plateformeVisee(natif = NATIF): number {
  const lu = /compileSdkVersion\s*=\s*(\d+)/.exec(readFileSync(join(natif, "variables.gradle"), "utf8"))?.[1];
  return lu === undefined ? echouer(`${join(natif, "variables.gradle")} declares no compileSdkVersion`) : Number(lu);
}

// La majeure d'un JDK, d'après ce que `java -version` écrit (« openjdk version "21.0.5" … »,
// « java version "1.8.0_402" »).
export function majeureDuJdk(sortie: string): number | undefined {
  const version = /version "([^"]+)"/.exec(sortie)?.[1];
  if (version === undefined) return undefined;
  const [premier, second] = version.split(/[.+_-]/).map(Number);
  return premier === 1 ? second : premier;
}

export type Machine = {
  env: NodeJS.ProcessEnv;
  // La version du `node` qui lance la construction (process.versions.node).
  node: string;
  executer: Executer;
  existe: (chemin: string) => boolean;
};

export type Prerequis = { java: string; sdk: string };

// Les prérequis, tous vérifiés avant de rien écrire : ce qui manque est nommé, avec de quoi le poser.
export function verifierPrerequis(machine: Machine, natif = NATIF, app = APP): Prerequis {
  const manques: string[] = [];

  const reclamee = majeureDe(JSON.parse(readFileSync(join(app, "package.json"), "utf8")).engines?.node);
  const majeureNode = Number(machine.node.split(".")[0]);
  if (majeureNode < reclamee) manques.push(`Node ${reclamee}: this node is v${machine.node} — run the command with Node ${reclamee} or newer`);

  const javaHome = machine.env.JAVA_HOME;
  const java = javaHome !== undefined && javaHome !== "" ? join(javaHome, "bin", "java") : "java";
  if (javaHome !== undefined && javaHome !== "" && !machine.existe(java)) manques.push(`a JDK ${JDK_MIN}: JAVA_HOME is ${javaHome}, and there is no ${java}`);
  else {
    const lu = machine.executer(java, ["-version"]);
    const majeure = lu.status === 0 ? majeureDuJdk(`${lu.stderr}\n${lu.stdout}`) : undefined;
    if (lu.status !== 0) manques.push(`a JDK ${JDK_MIN}: no \`java\` found (JAVA_HOME is not set, and none is on the PATH) — install a JDK ${JDK_MIN} and set JAVA_HOME to it`);
    else if (majeure === undefined) manques.push(`a JDK ${JDK_MIN}: \`${java} -version\` does not say its version`);
    else if (majeure < JDK_MIN || majeure > JDK_MAX) manques.push(`a JDK ${JDK_MIN}: ${java} is Java ${majeure}, the build needs Java ${JDK_MIN} to ${JDK_MAX} — set JAVA_HOME to a JDK ${JDK_MIN}`);
  }

  const sdk = [machine.env.ANDROID_HOME, machine.env.ANDROID_SDK_ROOT].find((chemin) => chemin !== undefined && chemin !== "");
  const plateforme = plateformeVisee(natif);
  if (sdk === undefined) manques.push(`the Android SDK: ANDROID_HOME is not set — install the Android SDK (with \`sdkmanager "platforms;android-${plateforme}"\`) and set ANDROID_HOME to it`);
  else if (!machine.existe(sdk)) manques.push(`the Android SDK: ANDROID_HOME is ${sdk}, which does not exist`);
  else if (!machine.existe(join(sdk, "platforms", `android-${plateforme}`))) manques.push(`the Android SDK platform ${plateforme}: ${join(sdk, "platforms", `android-${plateforme}`)} does not exist — install it with \`sdkmanager "platforms;android-${plateforme}"\``);

  if (manques.length > 0) refuser(`missing prerequisite${manques.length > 1 ? "s" : ""}:\n${manques.map((manque) => `  - ${manque}`).join("\n")}`);
  return { java, sdk: sdk ?? "" };
}

// Ce que le process principal du desktop rend à la vue au démarrage (main.ts, « demarrage »), sans
// ce qui s'y lit des projets et des stations : les constantes des modules d'app/src/, telles
// quelles. Le pont d'attente y ajoute une liste de projets vide.
export type Demarrage = Omit<Awaited<ReturnType<Pont["demarrage"]>>, "configuration">;
export async function demarrageDuPont(): Promise<Demarrage> {
  const [{ PALETTE }, { EXEMPLE }, { ONGLETS, RUBRIQUES }, { BOUTONS }, { ALLUMAGE }, { GESTES_DE_LA_CUISINE }, { GESTES_DES_GRANTS }, { CONFIRMES, DIRECTS, GRANTS }, { GESTES_D_ATTENTE }, { BANNIERE }, { MODELES, EFFORTS }] = await Promise.all([
    import("../src/couleurs.ts"),
    import("../src/config.ts"),
    import("../src/onglets.ts"),
    import("../src/boutons.ts"),
    import("../src/allumage.ts"),
    import("../src/cuisine.ts"),
    import("../src/grants.ts"),
    import("../src/gestes.ts"),
    import("../src/attente.ts"),
    import("../src/faits.ts"),
    import("../src/projets/projets.ts"),
  ]);
  return {
    palette: PALETTE,
    exemple: EXEMPLE,
    onglets: ONGLETS,
    rubriques: RUBRIQUES,
    boutons: BOUTONS,
    gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES, attente: GESTES_D_ATTENTE },
    banniere: BANNIERE,
    calibrage: { modeles: MODELES, efforts: EFFORTS },
    code: undefined,
  };
}

// Le script que l'activité injecte au début de chaque document (Pont.java) : le pont d'attente
// d'app/android/web/pont.js, avec ce qu'il rend au démarrage.
export function scriptDuPont(demarrage: Demarrage, pont = readFileSync(join(ANDROID, "web", "pont.js"), "utf8")): string {
  return `// Écrit par app/packaging/android.ts — depuis app/android/web/pont.js et les modules d'app/src/.\n(() => {\n"use strict";\nconst DEMARRAGE = ${JSON.stringify(demarrage)};\n${pont}\n})();\n`;
}

// Ce que la vue charge hors d'app/src/vue/ : les chemins `../../node_modules/…` d'index.html — ses
// feuilles de style et son importmap —, relatifs à l'app.
export function dependancesDeLaVue(html: string): string[] {
  const chemins = [...html.matchAll(/(?:href|src)="([^"]+)"|"(?:@[^"]+)":\s*"([^"]+)"/g)].map((trouve) => trouve[1] ?? trouve[2] ?? "");
  return [...new Set(chemins.filter((chemin) => chemin.startsWith("../../node_modules/")).map((chemin) => chemin.slice("../../".length)))].sort();
}

// Pose `www` : la vue d'app/src/vue/ à `src/vue/`, ce qu'elle charge de node_modules à
// `node_modules/`, comme dans l'app — ses chemins relatifs y tiennent sans rien changer —, l'entrée
// de Capacitor à la racine et le pont d'attente dans `android/pont.js`.
export function poserLaVue(demarrage: Demarrage, www = WWW, app = APP): void {
  const vue = join(app, "src", "vue");
  const manquantes = dependancesDeLaVue(readFileSync(join(vue, "index.html"), "utf8")).filter((chemin) => !existsSync(join(app, chemin)));
  if (manquantes.length > 0) echouer(`the view needs ${manquantes.join(", ")}, absent from the app's node_modules`);
  rmSync(www, { recursive: true, force: true });
  cpSync(vue, join(www, "src", "vue"), { recursive: true });
  for (const chemin of dependancesDeLaVue(readFileSync(join(vue, "index.html"), "utf8"))) {
    mkdirSync(join(www, chemin, ".."), { recursive: true });
    copyFileSync(join(app, chemin), join(www, chemin));
  }
  copyFileSync(join(ANDROID, "web", "index.html"), join(www, "index.html"));
  mkdirSync(join(www, "android"), { recursive: true });
  writeFileSync(join(www, "android", "pont.js"), scriptDuPont(demarrage));
}

// Une étape longue : sa sortie passe telle quelle, et elle échoue si son code n'est pas 0.
function lancer(etape: string, commande: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): void {
  console.log(`brigade: ${etape}…`);
  const fait = spawnSync(commande, args, { cwd, env, stdio: "inherit" });
  if (fait.error !== undefined) echouer(`${etape}: ${commande} could not be run (${fait.error.message})`);
  if (fait.status !== 0) echouer(`${etape}: ${commande} ${args.join(" ")} exited with ${fait.status ?? fait.signal ?? "?"}`);
}

async function principal(): Promise<void> {
  let options: { version?: string; sortie?: string };
  try {
    options = parseArgs({ options: { version: { type: "string" }, sortie: { type: "string" } }, strict: true }).values;
  } catch (erreur) {
    return refuser(`${erreur instanceof Error ? erreur.message : String(erreur)} — usage: android.ts [--version <v>] [--sortie <folder>]`);
  }
  const machine: Machine = { env: process.env, node: process.versions.node, executer: executerVraiment, existe: existsSync };
  const { sdk } = verifierPrerequis(machine);
  const version = options.version ?? versionDuCommit(executerVraiment);
  if (!/^[0-9A-Za-z.+-]+$/.test(version)) refuser(`invalid version “${version}” — letters, digits, “.”, “+” and “-” only`);
  const sortie = resolve(options.sortie ?? join(ICI, "construit"));

  // Le SDK que les prérequis ont trouvé : Gradle prend le même, et le JDK de JAVA_HOME — sinon
  // celui du PATH —, comme `java` plus haut.
  const env: NodeJS.ProcessEnv = { ...process.env, ANDROID_HOME: sdk };
  lancer("installing Capacitor (app/android/package-lock.json)", "npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], ANDROID, env);
  if (dependancesDeLaVue(readFileSync(join(APP, "src", "vue", "index.html"), "utf8")).some((chemin) => !existsSync(join(APP, chemin))))
    lancer("installing the app's dependencies (app/package-lock.json)", "npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], APP, env);
  console.log("brigade: laying the view of app/src/vue/ in app/android/www/…");
  poserLaVue(await demarrageDuPont());
  lancer("syncing the Android project (cap sync android)", join(ANDROID, "node_modules", ".bin", "cap"), ["sync", "android"], ANDROID, env);
  lancer("building the APK (gradlew assembleDebug)", "./gradlew", ["assembleDebug", "--no-daemon", "--stacktrace", `-PbrigadeVersion=${version}`], NATIF, env);

  const construit = join(NATIF, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  if (!existsSync(construit) || statSync(construit).size === 0) echouer(`Gradle succeeded but wrote no ${relative(process.cwd(), construit)}`);
  mkdirSync(sortie, { recursive: true });
  const apk = join(sortie, `Brigade-${version}.apk`);
  copyFileSync(construit, apk);
  console.log(`brigade: Android app built — ${relative(process.cwd(), apk) || apk} (version ${version}, debug-signed)`);
}

if (import.meta.main) {
  try {
    await principal();
  } catch (erreur) {
    if (!(erreur instanceof Arret)) throw erreur;
    console.error(`brigade: APK not built — ${erreur.message}`);
    process.exit(erreur.code);
  }
}
