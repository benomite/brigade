// Construit l'app installable du Mac : un seul .dmg, pour Apple Silicon, qui porte l'app, le
// runtime de sa station et le `node` qui le joue. Glissée dans Applications, l'app tourne sans
// clone du dépôt, sans `node` ni `npm` sur la machine (src/emplacements.ts).
//
//   npm --prefix app run dist                         le .dmg du commit construit
//   npm --prefix app run dist -- --version 1.2.0
//   npm --prefix app run dist -- --electron <zip ou Electron.app> --node <binaire node>
//   npm --prefix app run dist -- --sortie <dossier>
//   npm --prefix app run dist -- --identite "Developer ID Application: …" --notariser <profil>
//
// Le .dmg s'écrit dans app/packaging/construit/ (ou `--sortie`), sous le nom
// Brigade-<version>-arm64.dmg, et la commande dit son chemin.
//
// Ce que porte `Brigade.app/Contents/Resources/` :
//   app/            `src/`, son package.json et ses dépendances de production — ni tests, ni
//                   dépendances de dev ; node-pty n'y garde que ce qui est compilé pour darwin-arm64
//   runtime/        `src/` et package.json du runtime — il n'a pas d'autres dépendances
//   node/bin/node   le `node` qui joue la station : celui de la machine n'y est pour rien
// Le reste est l'Electron officiel pour darwin-arm64, de la version que l'app déclare, renommé.
//
// Electron vient, sans `--electron`, du dépôt de ses versions sur GitHub, vérifié contre les
// empreintes que porte son paquet npm. Le `node` vient, sans `--node`, de nodejs.org, dans la
// version du `node` qui lance cette commande — vérifié contre les empreintes publiées avec lui —,
// et doit être celle que le runtime réclame (`engines`). Donné par `--node`, ce doit être un
// binaire darwin-arm64 qui ne lie rien hors du système : le `node` d'Homebrew lie ses bibliothèques,
// absentes d'un Mac sans Homebrew.
//
// Sans `--identite`, l'app n'est pas signée par un développeur identifié : elle l'est « ad hoc »
// (`codesign -s -`), faute de quoi Apple Silicon refuse de lancer un binaire modifié. Avec
// `--identite` (ou BRIGADE_SIGN_IDENTITY), elle l'est par ce certificat Developer ID (runtime durci,
// droits de droits.plist) ; avec `--notariser <profil>` (un profil de `notarytool store-credentials`),
// l'app puis le .dmg sont notarisés par Apple et agrafés. Un `latest-mac.yml` s'écrit à côté du .dmg. Le .dmg se construit sur un
// Mac : il faut `ditto`, `codesign`, `otool` et `hdiutil`, tous du système.
//
// La version vient, sans `--version`, du commit construit : sa date (UTC) et son empreinte,
// 0.<AAAAMMJJ>.<HHMMSS>+g<commit> — la forme du paquet de la station (runtime/paquet/).
//
// Codes de sortie : 0 construit, 1 la construction a échoué, 2 refus (option invalide, machine
// qui n'est pas un Mac) — rien n'est écrit.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { APP_DU_PAQUET, NODE_DU_PAQUET, RUNTIME_DU_PAQUET } from "../src/emplacements.ts";

const REFUS = 2;
const ECHEC = 1;

export const NOM = "Brigade";
export const IDENTIFIANT = "com.github.benomite.brigade";
export const ARCH = "arm64";

const ICI = import.meta.dirname;
export const APP = resolve(ICI, "..");
export const RACINE = resolve(APP, "..");
export const RUNTIME = join(RACINE, "runtime");

// Un refus ou un échec de la construction, avec le code qui le dit.
export class Arret extends Error {
  readonly code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}
const refuser = (motif: string): never => {
  throw new Arret(motif, REFUS);
};
const echouer = (motif: string): never => {
  throw new Arret(motif, ECHEC);
};

export type Rendu = { status: number | null; stdout: string; stderr: string };
export type Executer = (commande: string, args: readonly string[]) => Rendu;
export const executerVraiment: Executer = (commande, args) => {
  const lu = spawnSync(commande, args, { encoding: "utf8" });
  return { status: lu.error === undefined ? lu.status : null, stdout: lu.stdout ?? "", stderr: lu.stderr ?? (lu.error?.message ?? "") };
};
const dit = (rendu: Rendu) => (rendu.stderr || rendu.stdout).trim() || `code ${String(rendu.status)}`;

// La version du commit construit : 0.<AAAAMMJJ>.<HHMMSS>+g<commit>, d'après `git log` en UTC.
export function versionDuCommit(executer: Executer, racine = RACINE): string {
  const lu = executer("git", ["-C", racine, "log", "-1", "--date=format-local:%Y%m%d.%H%M%S", "--format=%cd+g%h"]);
  const brut = lu.stdout.trim();
  if (lu.status !== 0 || !/^\d{8}\.\d{6}\+g[0-9a-f]+$/.test(brut)) refuser(`the version cannot be read from the repository (${dit(lu)}) — give it with --version`);
  return `0.${brut}`;
}

// Ce qu'un Mac accepte pour la version d'une app : des entiers séparés de points, trois au plus.
export function versionCourte(version: string): string {
  const courte = version.split("+")[0] ?? "";
  if (!/^\d+(\.\d+){0,2}$/.test(courte)) refuser(`invalid version “${version}” — up to three numbers separated by dots, then optionally “+” and anything`);
  return courte;
}

// Le `Info.plist` d'Electron, au nom de l'app. L'exécutable et les auxiliaires gardent le nom
// d'Electron : c'est sous lui qu'Electron cherche ses auxiliaires. L'intégrité de `default_app.asar`
// part avec lui — l'app n'est pas une archive asar.
export function reecrirePlist(xml: string, courte: string): string {
  const remplacer = (texte: string, cle: string, valeur: string) => {
    const motif = new RegExp(`(<key>${cle}</key>\\s*<string>)[^<]*(</string>)`);
    if (!motif.test(texte)) echouer(`Electron's Info.plist has no ${cle}`);
    return texte.replace(motif, `$1${valeur}$2`);
  };
  let texte = xml;
  for (const [cle, valeur] of [
    ["CFBundleName", NOM],
    ["CFBundleDisplayName", NOM],
    ["CFBundleIdentifier", IDENTIFIANT],
    ["CFBundleShortVersionString", courte],
    ["CFBundleVersion", courte],
  ] as const)
    texte = remplacer(texte, cle, valeur);
  return sansCle(texte, "ElectronAsarIntegrity");
}

// Le plist sans une clé de premier niveau ni sa valeur : un dictionnaire, jusqu'à son `</dict>`
// — ceux qu'il contient compris.
function sansCle(xml: string, cle: string): string {
  const debut = new RegExp(`\\s*<key>${cle}</key>\\s*<dict>`).exec(xml);
  if (debut === null) return xml;
  const balise = /<(\/?)dict>/g;
  balise.lastIndex = debut.index + debut[0].length;
  let profondeur = 1;
  for (let trouvee = balise.exec(xml); trouvee !== null; trouvee = balise.exec(xml)) {
    profondeur += trouvee[1] === "/" ? -1 : 1;
    if (profondeur === 0) return xml.slice(0, debut.index) + xml.slice(balise.lastIndex);
  }
  return echouer(`Electron's Info.plist does not close its ${cle}`);
}

// Les dépendances de production de l'app, d'après son verrou : les chemins de `node_modules` qui
// ne sont pas de dev.
export function dependancesDeProduction(verrou: { packages?: Record<string, { dev?: boolean; devOptional?: boolean }> }): string[] {
  return Object.entries(verrou.packages ?? {})
    .filter(([chemin, paquet]) => chemin.startsWith("node_modules/") && paquet.dev !== true && paquet.devOptional !== true)
    .map(([chemin]) => chemin)
    .sort();
}

// Un binaire Mach-O 64 bits pour arm64 : son nombre magique, puis son processeur.
export function estMachOArm64(debut: Uint8Array): boolean {
  if (debut.length < 8) return false;
  const vue = new DataView(debut.buffer, debut.byteOffset, debut.byteLength);
  return vue.getUint32(0, true) === 0xfeedfacf && vue.getUint32(4, true) === 0x0100000c;
}

// Ce qu'un binaire lie hors du système, d'après `otool -L` : ce qu'un Mac nu n'aurait pas.
export function bibliothequesHorsSysteme(otool: string): string[] {
  return otool
    .split("\n")
    .slice(1)
    .map((ligne) => ligne.trim().split(" (")[0]?.trim() ?? "")
    .filter((chemin) => chemin !== "" && !chemin.startsWith("/usr/lib/") && !chemin.startsWith("/System/"));
}

// L'empreinte qu'annonce un SHASUMS256.txt pour un fichier.
export function empreinteAnnoncee(sommes: string, fichier: string): string | undefined {
  for (const ligne of sommes.split("\n")) {
    const [empreinte, nom] = ligne.trim().split(/\s+/);
    if (nom === fichier && empreinte !== undefined && /^[0-9a-f]{64}$/.test(empreinte)) return empreinte;
  }
  return undefined;
}

// La majeure de `node` que le runtime réclame (`engines`).
export function majeureReclamee(runtime = RUNTIME): number {
  return Number(/\d+/.exec(JSON.parse(readFileSync(join(runtime, "package.json"), "utf8")).engines?.node ?? "")?.[0]);
}

export type OptionsConstruction = {
  version: string;
  // Electron.app pour darwin-arm64, déjà extrait.
  electron: string;
  // Le `node` darwin-arm64 à porter.
  node: string;
  // Où le .dmg s'écrit.
  sortie: string;
  // Où l'arbre se pose le temps de la construction.
  atelier: string;
  executer: Executer;
  app?: string;
  runtime?: string;
  // Le nom d'un certificat « Developer ID Application » : l'app est alors signée par ce
  // développeur (runtime durci, horodatage) au lieu d'être signée ad hoc.
  identite?: string;
  // Le profil de trousseau de `xcrun notarytool store-credentials` : l'app, puis le .dmg, sont
  // notarisés par Apple et agrafés. Réclame `identite`.
  profilNotarisation?: string;
};

export const DROITS = join(ICI, "droits.plist");

// Pose `Brigade.app` dans `dossier`, depuis Electron, l'app, le runtime et le `node` : rend son chemin.
export function assembler(options: Omit<OptionsConstruction, "sortie" | "atelier" | "executer">, dossier: string): string {
  const app = options.app ?? APP;
  const runtime = options.runtime ?? RUNTIME;
  const paquet = join(dossier, `${NOM}.app`);
  const courte = versionCourte(options.version);
  mkdirSync(dossier, { recursive: true });
  // Les liens des frameworks d'Electron restent des liens.
  cpSync(options.electron, paquet, { recursive: true, verbatimSymlinks: true });
  const contenu = join(paquet, "Contents");
  const ressources = join(contenu, "Resources");
  const plist = join(contenu, "Info.plist");
  writeFileSync(plist, reecrirePlist(readFileSync(plist, "utf8"), courte));
  rmSync(join(ressources, "default_app.asar"), { force: true });
  // L'icône du Dock : Electron la lit dans `electron.icns` (CFBundleIconFile), qu'on remplace.
  cpSync(join(ICI, "icones", "Brigade.icns"), join(ressources, "electron.icns"));

  // L'app : ses sources, son package.json — au nom de l'app, à la version construite — et ses
  // dépendances de production, rangées comme dans le dépôt : la vue les charge par `../../node_modules`.
  const dansApp = join(ressources, APP_DU_PAQUET);
  cpSync(join(app, "src"), join(dansApp, "src"), { recursive: true });
  const { devDependencies: _dev, scripts: _scripts, ...declare } = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  writeFileSync(join(dansApp, "package.json"), `${JSON.stringify({ ...declare, productName: NOM, version: options.version }, null, 2)}\n`);
  for (const dependance of dependancesDeProduction(JSON.parse(readFileSync(join(app, "package-lock.json"), "utf8")))) {
    const source = join(app, dependance);
    if (!existsSync(source)) echouer(`${dependance} is missing from ${app} — install the app's dependencies first (\`npm ci --ignore-scripts --prefix app\`)`);
    cpSync(source, join(dansApp, dependance), { recursive: true, verbatimSymlinks: true });
  }
  // node-pty : rien que ce qui est compilé pour darwin-arm64, ni ses sources. Un `build/` compilé
  // ici passerait devant, pour l'architecture de cette machine.
  const pty = join(dansApp, "node_modules", "node-pty");
  if (existsSync(pty)) {
    for (const source of ["build", "deps", "src", "third_party", "scripts", "binding.gyp"]) rmSync(join(pty, source), { recursive: true, force: true });
    const compiles = join(pty, "prebuilds");
    if (!existsSync(join(compiles, `darwin-${ARCH}`, "pty.node"))) echouer(`node-pty has no build for darwin-${ARCH} (${join(compiles, `darwin-${ARCH}`)})`);
    for (const nom of readdirSync(compiles)) if (nom !== `darwin-${ARCH}`) rmSync(join(compiles, nom), { recursive: true, force: true });
    chmodSync(join(compiles, `darwin-${ARCH}`, "spawn-helper"), 0o755);
  }

  // Le runtime : ce que `node` exécute et le package.json qui en fait des modules ES — à la
  // version construite, celle que la station dit d'elle-même en démarrant.
  const dansRuntime = join(ressources, RUNTIME_DU_PAQUET);
  cpSync(join(runtime, "src"), join(dansRuntime, "src"), { recursive: true });
  writeFileSync(join(dansRuntime, "package.json"), `${JSON.stringify({ ...JSON.parse(readFileSync(join(runtime, "package.json"), "utf8")), version: options.version }, null, 2)}\n`);

  const node = join(ressources, NODE_DU_PAQUET);
  mkdirSync(join(node, ".."), { recursive: true });
  cpSync(options.node, node);
  chmodSync(node, 0o755);
  return paquet;
}

// Vérifie le `node` à porter : un binaire darwin-arm64, qui ne lie rien hors du système.
export function verifierNode(node: string, executer: Executer): void {
  let debut: Buffer;
  try {
    if (!statSync(node).isFile()) refuser(`--node is not a file (${node})`);
    debut = readFileSync(node).subarray(0, 8);
  } catch (erreur) {
    if (erreur instanceof Arret) throw erreur;
    return refuser(`--node is a missing file (${node})`);
  }
  if (!estMachOArm64(debut)) refuser(`the node to bundle (${node}) is not a macOS arm64 binary`);
  const liens = executer("otool", ["-L", node]);
  if (liens.status !== 0) echouer(`\`otool -L ${node}\` failed: ${dit(liens)}`);
  const ailleurs = bibliothequesHorsSysteme(liens.stdout);
  if (ailleurs.length > 0) refuser(`the node to bundle (${node}) links libraries a bare Mac does not have (${ailleurs.join(", ")}) — use the official build from nodejs.org`);
}

const ENTETES_MACHO = new Set([0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca]);
const estMacho = (chemin: string): boolean => {
  const fd = openSync(chemin, "r");
  try {
    const debut = Buffer.alloc(4);
    return readSync(fd, debut, 0, 4, 0) === 4 && ENTETES_MACHO.has(debut.readUInt32BE(0));
  } finally {
    closeSync(fd);
  }
};

// Ce qui se signe dans l'app, du plus profond au moins profond — signer un paquet scelle ce qu'il
// contient : chaque binaire Mach-O (les liens ne sont pas suivis), puis les paquets (.framework,
// .app), l'app elle-même en dernier.
export function aSigner(paquet: string): string[] {
  const binaires: string[] = [];
  const paquets: string[] = [];
  const parcourir = (dossier: string) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isSymbolicLink()) continue;
      if (entree.isDirectory()) {
        parcourir(chemin);
        if (/\.(framework|app)$/.test(entree.name)) paquets.push(chemin);
      } else if (entree.isFile() && estMacho(chemin)) binaires.push(chemin);
    }
  };
  parcourir(paquet);
  const profondeur = (chemin: string) => chemin.split("/").length;
  const plusProfondDabord = (a: string, b: string) => profondeur(b) - profondeur(a) || a.localeCompare(b);
  return [...binaires.sort(plusProfondDabord), ...paquets.sort(plusProfondDabord), paquet];
}

// Soumet un fichier à Apple et attend le verdict : « Accepted », ou la construction échoue.
function notariser(fichier: string, profil: string, executer: Executer): void {
  const rendu = executer("xcrun", ["notarytool", "submit", fichier, "--keychain-profile", profil, "--wait"]);
  if (rendu.status !== 0 || !/status:\s*Accepted/.test(rendu.stdout)) echouer(`Apple did not accept ${basename(fichier)} for notarization: ${dit(rendu)}`);
}

// Signe l'app — par un développeur identifié si `identite`, sinon « ad hoc » —, la notarise et
// l'agrafe si `profilNotarisation`, puis écrit le .dmg : l'app, et un lien vers Applications où la
// glisser. Avec une identité, le .dmg est signé à son tour, et notarisé et agrafé de même.
export function construire(options: OptionsConstruction): string {
  const { executer, identite, profilNotarisation } = options;
  if (profilNotarisation !== undefined && identite === undefined) refuser("notarization needs a Developer ID identity (--identite)");
  verifierNode(options.node, executer);
  const volume = join(options.atelier, "volume");
  const paquet = assembler(options, volume);
  const lancer = (commande: string, args: string[], quoi: string) => {
    const rendu = executer(commande, args);
    if (rendu.status !== 0) echouer(`${quoi} failed (\`${commande} ${args.join(" ")}\`): ${dit(rendu)}`);
  };
  if (identite === undefined) {
    // Ce que node-pty lance est signé à part : `--deep` ne signe que ce qui est rangé en paquet.
    const pty = join(paquet, "Contents", "Resources", APP_DU_PAQUET, "node_modules", "node-pty", "prebuilds", `darwin-${ARCH}`);
    for (const binaire of ["pty.node", "spawn-helper"]) if (existsSync(join(pty, binaire))) lancer("codesign", ["--force", "--sign", "-", join(pty, binaire)], `signing ${binaire}`);
    lancer("codesign", ["--force", "--deep", "--sign", "-", paquet], "signing the app");
    lancer("codesign", ["--verify", paquet], "checking the app's signature");
  } else {
    // Le runtime durci et l'horodatage sont ce qu'Apple exige pour notariser ; les droits
    // laissent V8 et le `node` porté faire ce qu'ils font.
    for (const chemin of aSigner(paquet))
      lancer("codesign", ["--force", "--sign", identite, "--options", "runtime", "--timestamp", "--entitlements", DROITS, chemin], `signing ${relative(paquet, chemin) || basename(paquet)}`);
    lancer("codesign", ["--verify", "--deep", "--strict", paquet], "checking the app's signature");
    if (profilNotarisation !== undefined) {
      const zip = join(options.atelier, `${NOM}.zip`);
      lancer("ditto", ["-c", "-k", "--keepParent", paquet, zip], "zipping the app for notarization");
      notariser(zip, profilNotarisation, executer);
      lancer("xcrun", ["stapler", "staple", paquet], "stapling the app");
    }
  }
  symlinkSync("/Applications", join(volume, "Applications"));
  mkdirSync(options.sortie, { recursive: true });
  const dmg = join(options.sortie, `${NOM}-${options.version}-${ARCH}.dmg`);
  lancer("hdiutil", ["create", "-volname", NOM, "-srcfolder", volume, "-fs", "HFS+", "-format", "UDZO", "-ov", dmg], "writing the .dmg");
  if (identite !== undefined) {
    lancer("codesign", ["--force", "--sign", identite, "--timestamp", dmg], "signing the .dmg");
    if (profilNotarisation !== undefined) {
      notariser(dmg, profilNotarisation, executer);
      lancer("xcrun", ["stapler", "staple", dmg], "stapling the .dmg");
    }
  }
  return dmg;
}

// Le fichier que lit un updater de type electron-updater (`latest-mac.yml`) : la version, et pour
// le .dmg son nom, son empreinte sha512 (base64) et sa taille.
export function metadonneesDeMiseAJour(version: string, dmg: string, date: string): string {
  const contenu = readFileSync(dmg);
  const sha512 = createHash("sha512").update(contenu).digest("base64");
  const nom = basename(dmg);
  return [
    `version: ${version}`,
    "files:",
    `  - url: ${nom}`,
    `    sha512: ${sha512}`,
    `    size: ${contenu.length}`,
    `path: ${nom}`,
    `sha512: ${sha512}`,
    `releaseDate: '${date}'`,
    "",
  ].join("\n");
}

// Electron pour darwin-arm64, de la version que l'app déclare : son zip, téléchargé et vérifié
// comme `npm start` pose le sien (node_modules/electron/install.js).
async function zipDElectron(): Promise<string> {
  const electron = join(APP, "node_modules", "electron");
  if (!existsSync(join(electron, "package.json"))) refuser("Electron is not in app/node_modules — install the app's dependencies first (`npm ci --ignore-scripts --prefix app`)");
  const { version } = JSON.parse(readFileSync(join(electron, "package.json"), "utf8"));
  const checksums = JSON.parse(readFileSync(join(electron, "checksums.json"), "utf8"));
  const { downloadArtifact } = await import(pathToFileURL(join(APP, "node_modules", "@electron", "get", "dist", "index.js")).href);
  console.log(`brigade: downloading Electron ${version} for darwin-${ARCH}…`);
  return downloadArtifact({ version, artifactName: "electron", platform: "darwin", arch: ARCH, checksums });
}

// Le `node` officiel pour darwin-arm64, dans la version de celui qui lance cette commande.
async function nodeOfficiel(atelier: string, executer: Executer): Promise<string> {
  const version = process.versions.node;
  const nom = `node-v${version}-darwin-${ARCH}`;
  const adresse = `https://nodejs.org/dist/v${version}`;
  console.log(`brigade: downloading Node ${version} for darwin-${ARCH}…`);
  const lire = async (fichier: string) => {
    const reponse = await fetch(`${adresse}/${fichier}`).catch((erreur: unknown) => echouer(`${adresse}/${fichier} could not be fetched: ${erreur instanceof Error ? erreur.message : String(erreur)} — give a node with --node`));
    if (!reponse.ok) echouer(`${adresse}/${fichier} answered ${reponse.status} — give a node with --node`);
    return Buffer.from(await reponse.arrayBuffer());
  };
  const archive = `${nom}.tar.gz`;
  const attendue = empreinteAnnoncee((await lire("SHASUMS256.txt")).toString("utf8"), archive) ?? echouer(`SHASUMS256.txt of Node ${version} does not list ${archive}`);
  const contenu = await lire(archive);
  if (createHash("sha256").update(contenu).digest("hex") !== attendue) echouer(`${archive} does not match its published checksum`);
  const chemin = join(atelier, archive);
  writeFileSync(chemin, contenu);
  const extrait = executer("tar", ["-xzf", chemin, "-C", atelier, `${nom}/bin/node`]);
  if (extrait.status !== 0) echouer(`${archive} could not be extracted: ${dit(extrait)}`);
  return join(atelier, nom, "bin", "node");
}

async function principal(): Promise<void> {
  let options: { version?: string; sortie?: string; electron?: string; node?: string; identite?: string; notariser?: string };
  try {
    options = parseArgs({ options: { version: { type: "string" }, sortie: { type: "string" }, electron: { type: "string" }, node: { type: "string" }, identite: { type: "string" }, notariser: { type: "string" } }, strict: true }).values;
  } catch (erreur) {
    return refuser(`${erreur instanceof Error ? erreur.message : String(erreur)} — usage: construire.ts [--version <v>] [--sortie <folder>] [--electron <zip or Electron.app>] [--node <binary>] [--identite <Developer ID>] [--notariser <notarytool profile>]`);
  }
  if (process.platform !== "darwin") refuser(`the .dmg is built on a Mac (\`codesign\`, \`hdiutil\`), not on ${process.platform}`);
  const executer = executerVraiment;
  const version = options.version ?? versionDuCommit(executer);
  versionCourte(version);
  const reclamee = majeureReclamee();
  if (options.node === undefined && Number(process.versions.node.split(".")[0]) < reclamee) refuser(`this node is ${process.version}, the runtime needs ${reclamee} at least — run with a newer node, or give one with --node`);
  const identite = options.identite ?? process.env.BRIGADE_SIGN_IDENTITY;
  if (options.notariser !== undefined && identite === undefined) refuser("--notariser needs --identite (or BRIGADE_SIGN_IDENTITY)");
  const sortie = resolve(options.sortie ?? join(ICI, "construit"));

  const atelier = mkdtempSync(join(tmpdir(), "brigade-dmg-"));
  try {
    let electron = options.electron === undefined ? await zipDElectron() : resolve(options.electron);
    if (!electron.endsWith(".app")) {
      const extrait = join(atelier, "electron");
      const rendu = executer("ditto", ["-x", "-k", electron, extrait]);
      if (rendu.status !== 0) echouer(`${basename(electron)} could not be extracted: ${dit(rendu)}`);
      electron = join(extrait, "Electron.app");
    }
    if (!existsSync(join(electron, "Contents", "Info.plist"))) refuser(`${electron} is not an Electron.app`);
    const node = options.node === undefined ? await nodeOfficiel(atelier, executer) : resolve(options.node);
    const lu = executer(node, ["--version"]);
    const majeure = Number(/^v(\d+)\./.exec(lu.stdout)?.[1]);
    if (lu.status === 0 && Number.isFinite(majeure) && majeure < reclamee) refuser(`the node to bundle (${node}) is ${lu.stdout.trim()}, the runtime needs ${reclamee} at least`);
    const dmg = construire({ version, electron, node, sortie, atelier: join(atelier, "arbre"), executer, identite, profilNotarisation: options.notariser });
    const yml = join(sortie, "latest-mac.yml");
    writeFileSync(yml, metadonneesDeMiseAJour(version, dmg, new Date().toISOString()));
    const signature = identite === undefined ? "signed ad hoc" : options.notariser === undefined ? "signed, not notarized" : "signed, notarized, stapled";
    console.log(`brigade: app built — ${relative(process.cwd(), dmg) || dmg} (version ${version}, ${ARCH}, ${signature}; updater metadata ${relative(process.cwd(), yml) || yml})`);
  } finally {
    rmSync(atelier, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    await principal();
  } catch (erreur) {
    if (!(erreur instanceof Arret)) throw erreur;
    console.error(`brigade: app not built — ${erreur.message}`);
    process.exit(erreur.code);
  }
}
