// Construit l'installeur Windows de l'app : un seul .exe, pour x64, qui pose l'app, le runtime de
// sa station et le `node.exe` qui le joue dans le dossier du compte (%LOCALAPPDATA%\Programs\Brigade),
// avec une entrée dans le menu Démarrer et un désinstalleur. Installée, l'app tourne sans clone du
// dépôt, sans `node` ni `npm` sur la machine (src/emplacements.ts) — et sans droits d'administrateur.
//
//   node app/packaging/windows.ts                       l'installeur du commit construit
//   node app/packaging/windows.ts --version 1.2.0
//   node app/packaging/windows.ts --electron <zip ou dossier> --node <node.exe> --nsis <bundle>
//   node app/packaging/windows.ts --sortie <dossier>
//
// L'installeur s'écrit dans app/packaging/construit/ (ou `--sortie`), sous le nom
// Brigade-<version>-x64-setup.exe, avec `latest.yml` à côté, et la commande dit son chemin. Elle
// tourne sous Linux, macOS ou Windows : rien de ce qu'elle lance n'est propre à Windows.
//
// Ce que porte le dossier installé — la forme d'un Electron pour Windows :
//   Brigade.exe            l'exécutable d'Electron, renommé ; ses DLL et ses `.pak` à côté
//   resources/app/         `src/`, son package.json et ses dépendances de production ; node-pty n'y
//                          garde que ce qui est compilé pour win32-x64
//   resources/runtime/     `src/` et package.json du runtime
//   resources/node/bin/node.exe   le `node` qui joue la station : celui de la machine n'y est pour rien
//   Uninstall Brigade.exe  le désinstalleur
//
// Electron vient, sans `--electron`, du dépôt de ses versions sur GitHub, vérifié contre les
// empreintes que porte son paquet npm. Le `node.exe` vient, sans `--node`, de nodejs.org, dans la
// version du `node` qui lance cette commande, vérifié contre les empreintes publiées avec lui. NSIS
// (`makensis`), qui écrit l'installeur, vient, sans `--nsis`, du paquet multi-plateforme
// d'electron-builder-binaries sur GitHub, épinglé par son empreinte : rien n'est à installer avant.
//
// L'installeur n'est pas signé (#1157) et ne se met pas à jour seul (#1156) : il s'installe par
// `/S` sans rien demander, par-dessus une version précédente, et `latest.yml` est le fichier qu'un
// updater de type electron-updater lit.
//
// Codes de sortie : 0 construit, 1 la construction a échoué, 2 refus (option invalide) — rien
// n'est écrit.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { crc32, inflateRawSync } from "node:zlib";
import { APP_DU_PAQUET, NODE_DU_PAQUET, RUNTIME_DU_PAQUET } from "../src/emplacements.ts";
import { APP, Arret, dependancesDeProduction, empreinteAnnoncee, IDENTIFIANT, majeureReclamee, metadonneesDeMiseAJour, NOM, RUNTIME, versionCourte, versionDuCommit } from "./construire.ts";

const REFUS = 2;
const ECHEC = 1;
const refuser = (motif: string): never => {
  throw new Arret(motif, REFUS);
};
const echouer = (motif: string): never => {
  throw new Arret(motif, ECHEC);
};

const ICI = import.meta.dirname;
export const ARCH = "x64";
// L'exécutable de l'app, et celui qui la retire.
export const EXE = `${NOM}.exe`;
export const DESINSTALLEUR = `Uninstall ${NOM}.exe`;
// Le `node` du paquet : NODE_DU_PAQUET, le nom que l'app lance, plus l'extension que Windows lui
// trouve tout seul (CreateProcess essaie `.com`, puis `.exe`).
export const NODE_EXE = `${NODE_DU_PAQUET}.exe`;
// La clé de désinstallation, sous HKCU : c'est elle qui fait paraître l'app dans « Applications installées ».
export const CLE_DE_DESINSTALLATION = `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${IDENTIFIANT}`;

// NSIS 3.12, empaqueté pour Linux, macOS et Windows par electron-builder : `makensis` compilé
// pour chacun, et les fichiers de Windows (stubs, en-têtes, greffons) qu'il assemble. Le greffon
// WinShell en est : il donne au raccourci l'AppUserModelID de l'app, sans quoi Windows n'affiche
// pas ses notifications.
export const NSIS = {
  version: "3.12",
  adresse: "https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis@2.0.2/nsis-bundle-3.12.tar.gz",
  sha256: "83d80ee578cb19008b2a99e4fccfb5e7c023cc9bb791eb38f6048fccc875f62c",
};

export type Rendu = { status: number | null; stdout: string; stderr: string };
export type Executer = (commande: string, args: readonly string[], env?: NodeJS.ProcessEnv) => Rendu;
export const executerVraiment: Executer = (commande, args, env) => {
  const lu = spawnSync(commande, args, { encoding: "utf8", env: env ?? process.env, maxBuffer: 256 * 1024 * 1024 });
  return { status: lu.error === undefined ? lu.status : null, stdout: lu.stdout ?? "", stderr: lu.stderr ?? (lu.error?.message ?? "") };
};
const dit = (rendu: Rendu) => (rendu.stderr || rendu.stdout).trim() || `code ${String(rendu.status)}`;

// L'installeur que la construction écrit, et son chemin sous `sortie` : le seul nom que la CI
// ait à connaître, à une version donnée.
export const nomDeLInstalleur = (version: string) => `${NOM}-${version}-${ARCH}-setup.exe`;

// Un exécutable PE pour x64 : l'en-tête MZ, celui qu'il désigne (`PE\0\0`), puis sa machine.
export function estPeX64(debut: Uint8Array): boolean {
  if (debut.length < 0x40 || debut[0] !== 0x4d || debut[1] !== 0x5a) return false;
  const vue = new DataView(debut.buffer, debut.byteOffset, debut.byteLength);
  const pe = vue.getUint32(0x3c, true);
  if (pe + 6 > debut.length) return false;
  return vue.getUint32(pe, true) === 0x00004550 && vue.getUint16(pe + 4, true) === 0x8664;
}

// Le début d'un fichier : de quoi lire son en-tête.
function debutDe(chemin: string, taille = 4096): Buffer {
  const fd = openSync(chemin, "r");
  try {
    const debut = Buffer.alloc(taille);
    return debut.subarray(0, readSync(fd, debut, 0, taille, 0));
  } finally {
    closeSync(fd);
  }
}

// Extrait un zip dans `dossier` : ce qu'Electron publie pour Windows, sans dépendre d'un `unzip`
// de la machine. Rien que des fichiers et des dossiers, rangés ou dégonflés (deflate), chacun
// vérifié contre son CRC ; un nom qui sortirait du dossier est refusé.
export function extraireZip(zip: Buffer, dossier: string): void {
  const u16 = (position: number) => zip.readUInt16LE(position);
  const u32 = (position: number) => zip.readUInt32LE(position);
  let fin = -1;
  for (let position = zip.length - 22; position >= Math.max(0, zip.length - 22 - 0xffff); position--)
    if (u32(position) === 0x06054b50) {
      fin = position;
      break;
    }
  if (fin < 0) echouer("the zip has no central directory");
  const nombre = u16(fin + 10);
  let position = u32(fin + 16);
  if (nombre === 0xffff || position === 0xffffffff) echouer("the zip is a zip64, which is not read here");
  const racine = resolve(dossier);
  mkdirSync(racine, { recursive: true });
  for (let i = 0; i < nombre; i++) {
    if (u32(position) !== 0x02014b50) echouer("the zip's central directory is damaged");
    const methode = u16(position + 10);
    const crc = u32(position + 16);
    const compresse = u32(position + 20);
    const taille = u32(position + 24);
    const longueurNom = u16(position + 28);
    const local = u32(position + 42);
    const nom = zip.subarray(position + 46, position + 46 + longueurNom).toString("utf8");
    position += 46 + longueurNom + u16(position + 30) + u16(position + 32);
    const cible = resolve(racine, normalize(nom));
    if (isAbsolute(nom) || (cible !== racine && !cible.startsWith(racine + sep))) echouer(`the zip holds a path outside its folder (${nom})`);
    if (nom.endsWith("/")) {
      mkdirSync(cible, { recursive: true });
      continue;
    }
    if (u32(local) !== 0x04034b50) echouer(`the zip's entry ${nom} is damaged`);
    const debut = local + 30 + u16(local + 26) + u16(local + 28);
    const brut = zip.subarray(debut, debut + compresse);
    const contenu = methode === 0 ? brut : methode === 8 ? inflateRawSync(brut) : echouer(`the zip's entry ${nom} uses compression ${methode}, which is not read here`);
    if (contenu.length !== taille || crc32(contenu) !== crc) echouer(`the zip's entry ${nom} does not match its checksum`);
    mkdirSync(dirname(cible), { recursive: true });
    writeFileSync(cible, contenu);
  }
}

export type OptionsAssemblage = {
  version: string;
  // L'Electron pour win32-x64, déjà extrait : `electron.exe` à sa racine.
  electron: string;
  // Le `node.exe` win-x64 à porter.
  node: string;
  app?: string;
  runtime?: string;
};

// Pose dans `dossier` ce que l'installeur copie dans le dossier de l'app : Electron, l'app, le
// runtime et le `node.exe`. Rend `dossier`.
export function assembler(options: OptionsAssemblage, dossier: string): string {
  const app = options.app ?? APP;
  const runtime = options.runtime ?? RUNTIME;
  versionCourte(options.version);
  if (!existsSync(join(options.electron, "electron.exe"))) refuser(`${options.electron} is not an Electron for Windows (no electron.exe)`);
  mkdirSync(dirname(dossier), { recursive: true });
  cpSync(options.electron, dossier, { recursive: true });
  // L'exécutable au nom de l'app : sous Windows, Electron ne cherche rien d'après le sien.
  renameSync(join(dossier, "electron.exe"), join(dossier, EXE));
  const ressources = join(dossier, "resources");
  rmSync(join(ressources, "default_app.asar"), { force: true });

  // L'app : ses sources, son package.json — au nom de l'app, à la version construite — et ses
  // dépendances de production, rangées comme dans le dépôt : la vue les charge par `../../node_modules`.
  const dansApp = join(ressources, APP_DU_PAQUET);
  cpSync(join(app, "src"), join(dansApp, "src"), { recursive: true });
  const { devDependencies: _dev, scripts: _scripts, ...declare } = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  writeFileSync(join(dansApp, "package.json"), `${JSON.stringify({ ...declare, productName: NOM, version: options.version }, null, 2)}\n`);
  for (const dependance of dependancesDeProduction(JSON.parse(readFileSync(join(app, "package-lock.json"), "utf8")))) {
    const source = join(app, dependance);
    if (!existsSync(source)) echouer(`${dependance} is missing from ${app} — install the app's dependencies first (\`npm ci --ignore-scripts --prefix app\`)`);
    cpSync(source, join(dansApp, dependance), { recursive: true });
  }
  // node-pty : rien que ce qui est compilé pour win32-x64, sans ses symboles de débogage (`.pdb`),
  // ni ses sources. Un `build/` compilé ici passerait devant, pour l'architecture de cette machine.
  const pty = join(dansApp, "node_modules", "node-pty");
  if (existsSync(pty)) {
    for (const source of ["build", "deps", "src", "third_party", "scripts", "binding.gyp"]) rmSync(join(pty, source), { recursive: true, force: true });
    const compiles = join(pty, "prebuilds");
    const visee = `win32-${ARCH}`;
    for (const binaire of ["pty.node", "conpty.node"]) if (!existsSync(join(compiles, visee, binaire))) echouer(`node-pty has no build for ${visee} (${join(compiles, visee, binaire)})`);
    for (const nom of readdirSync(compiles)) if (nom !== visee) rmSync(join(compiles, nom), { recursive: true, force: true });
    for (const nom of readdirSync(join(compiles, visee))) if (nom.endsWith(".pdb")) rmSync(join(compiles, visee, nom));
  }

  // Le runtime : ce que `node` exécute et le package.json qui en fait des modules ES — à la
  // version construite, celle que la station dit d'elle-même en démarrant.
  const dansRuntime = join(ressources, RUNTIME_DU_PAQUET);
  cpSync(join(runtime, "src"), join(dansRuntime, "src"), { recursive: true });
  writeFileSync(join(dansRuntime, "package.json"), `${JSON.stringify({ ...JSON.parse(readFileSync(join(runtime, "package.json"), "utf8")), version: options.version }, null, 2)}\n`);

  const node = join(ressources, NODE_EXE);
  mkdirSync(dirname(node), { recursive: true });
  cpSync(options.node, node);
  return dossier;
}

// Vérifie le `node.exe` à porter : un exécutable Windows pour x64.
export function verifierNode(node: string): void {
  try {
    if (!statSync(node).isFile()) refuser(`--node is not a file (${node})`);
  } catch (erreur) {
    if (erreur instanceof Arret) throw erreur;
    refuser(`--node is a missing file (${node})`);
  }
  if (!estPeX64(debutDe(node))) refuser(`the node to bundle (${node}) is not a Windows x64 executable`);
}

// Un texte de la machine qui construit, dans une chaîne NSIS : `$` et `"` y sont échappés. Les
// variables de NSIS (`$INSTDIR`…) s'écrivent à côté, telles quelles.
const echapper = (texte: string) => texte.replaceAll("$", "$$$$").replaceAll('"', '$\\"');

export type OptionsScript = {
  version: string;
  // Le dossier assemblé : ce que l'installeur copie.
  arbre: string;
  // Le chemin de l'installeur à écrire.
  installeur: string;
};

// Le script NSIS de l'installeur. Ce qu'il retire, à la désinstallation comme avant de poser une
// nouvelle version, est ce qu'il pose — chaque entrée de premier niveau du dossier assemblé, par
// son nom —, jamais le dossier entier : installée ailleurs par `/D=`, l'app ne retire rien d'autre.
export function scriptNsis(options: OptionsScript): string {
  const entrees = readdirSync(options.arbre, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const dossiers = entrees.filter((entree) => entree.isDirectory()).map((entree) => entree.name);
  const fichiers = entrees.filter((entree) => !entree.isDirectory()).map((entree) => entree.name);
  if (!fichiers.includes(EXE)) echouer(`the assembled folder has no ${EXE}`);
  const tailleKo = Math.ceil(tailleDe(options.arbre) / 1024);
  const dansLApp = (nom: string) => `"$INSTDIR\\${echapper(nom)}"`;
  const retirer = [...dossiers.map((nom) => `  RMDir /r ${dansLApp(nom)}`), ...fichiers.map((nom) => `  Delete ${dansLApp(nom)}`)];
  const raccourci = `"$SMPROGRAMS\\${NOM}.lnk"`;
  const cle = `HKCU "${CLE_DE_DESINSTALLATION}"`;
  return [
    `; The installer of ${NOM} ${options.version} for Windows ${ARCH}, written by app/packaging/windows.ts.`,
    "Unicode true",
    "ManifestDPIAware true",
    "SetCompressor /SOLID lzma",
    '!include "MUI2.nsh"',
    "",
    `Name "${NOM}"`,
    `Caption "${NOM} ${echapper(options.version)} Setup"`,
    `OutFile "${echapper(options.installeur)}"`,
    // Dans le dossier du compte : ni droits d'administrateur, ni invite de l'UAC.
    "RequestExecutionLevel user",
    `InstallDir "$LOCALAPPDATA\\Programs\\${NOM}"`,
    `InstallDirRegKey ${cle} "InstallLocation"`,
    `BrandingText "${NOM} ${echapper(options.version)}"`,
    "",
    `!define MUI_FINISHPAGE_RUN ${dansLApp(EXE)}`,
    `!define MUI_FINISHPAGE_RUN_TEXT "Open ${NOM}"`,
    "!insertmacro MUI_PAGE_INSTFILES",
    "!insertmacro MUI_PAGE_FINISH",
    "!insertmacro MUI_UNPAGE_CONFIRM",
    "!insertmacro MUI_UNPAGE_INSTFILES",
    '!insertmacro MUI_LANGUAGE "English"',
    "",
    `Section "${NOM}"`,
    "  SetShellVarContext current",
    // Une version précédente : ce qu'elle a posé part, pour qu'aucun de ses fichiers ne survive à la nouvelle.
    ...retirer,
    '  SetOutPath "$INSTDIR"',
    `  File /r "${echapper(join(options.arbre, "*"))}"`,
    `  WriteUninstaller ${dansLApp(DESINSTALLEUR)}`,
    `  CreateShortcut ${raccourci} ${dansLApp(EXE)} "" ${dansLApp(EXE)} 0`,
    // L'AppUserModelID que l'app se donne (process.execPath, main.ts) : Windows n'affiche les
    // notifications d'une app que si un raccourci du menu Démarrer porte le même.
    `  WinShell::SetLnkAUMI ${raccourci} ${dansLApp(EXE)}`,
    `  WriteRegStr ${cle} "DisplayName" "${NOM}"`,
    `  WriteRegStr ${cle} "DisplayVersion" "${echapper(options.version)}"`,
    `  WriteRegStr ${cle} "Publisher" "benomite"`,
    `  WriteRegStr ${cle} "DisplayIcon" "$INSTDIR\\${EXE},0"`,
    `  WriteRegStr ${cle} "InstallLocation" "$INSTDIR"`,
    `  WriteRegStr ${cle} "UninstallString" '"$INSTDIR\\${DESINSTALLEUR}"'`,
    `  WriteRegStr ${cle} "QuietUninstallString" '"$INSTDIR\\${DESINSTALLEUR}" /S'`,
    `  WriteRegDWORD ${cle} "NoModify" 1`,
    `  WriteRegDWORD ${cle} "NoRepair" 1`,
    `  WriteRegDWORD ${cle} "EstimatedSize" ${tailleKo}`,
    "SectionEnd",
    "",
    // Le désinstalleur retire l'app, son raccourci et sa clé — pas les projets ni les réglages du
    // chef (`~/.config/brigade/`), qui ne sont pas à l'app.
    'Section "Uninstall"',
    "  SetShellVarContext current",
    `  Delete ${raccourci}`,
    ...retirer,
    `  Delete ${dansLApp(DESINSTALLEUR)}`,
    '  RMDir "$INSTDIR"',
    `  DeleteRegKey ${cle}`,
    "SectionEnd",
    "",
  ].join("\n");
}

// La taille d'un dossier, ses fichiers additionnés.
function tailleDe(dossier: string): number {
  let taille = 0;
  for (const entree of readdirSync(dossier, { withFileTypes: true, recursive: true })) if (entree.isFile()) taille += statSync(join(entree.parentPath, entree.name)).size;
  return taille;
}

// Le `makensis` du paquet NSIS pour la machine qui construit, et le dossier de ses fichiers de
// Windows (NSISDIR), que le paquet range à part.
export function makensisDe(paquet: string, plateforme: string = process.platform, arch: string = process.arch): { commande: string; nsisdir: string } {
  const nsisdir = join(paquet, "windows");
  const visee = arch === "arm64" ? "arm64" : arch === "x64" ? "x64" : undefined;
  const commande =
    plateforme === "win32"
      ? join(nsisdir, "makensis.exe")
      : plateforme === "linux" && visee !== undefined
        ? join(paquet, "linux", visee, "makensis")
        : plateforme === "darwin" && visee !== undefined
          ? join(paquet, "mac", visee, "makensis")
          : refuser(`NSIS ${NSIS.version} has no makensis for ${plateforme}-${arch}`);
  if (!existsSync(commande)) refuser(`${paquet} is not the NSIS bundle (no ${relative(paquet, commande)})`);
  return { commande, nsisdir };
}

export type OptionsConstruction = OptionsAssemblage & {
  // Le paquet NSIS, extrait.
  nsis: string;
  // Où l'installeur s'écrit.
  sortie: string;
  // Où l'arbre se pose le temps de la construction.
  atelier: string;
  executer: Executer;
};

// Assemble l'app, écrit le script NSIS et le compile : rend le chemin de l'installeur.
export function construire(options: OptionsConstruction): string {
  verifierNode(options.node);
  const { commande, nsisdir } = makensisDe(options.nsis);
  const arbre = assembler(options, join(options.atelier, NOM));
  mkdirSync(options.sortie, { recursive: true });
  const installeur = join(options.sortie, nomDeLInstalleur(options.version));
  const script = join(options.atelier, `${NOM}.nsi`);
  writeFileSync(script, scriptNsis({ version: options.version, arbre, installeur }));
  rmSync(installeur, { force: true });
  const rendu = options.executer(commande, ["-V2", "-NOCD", script], { ...process.env, NSISDIR: nsisdir });
  if (rendu.status !== 0) echouer(`makensis failed (\`${commande} ${script}\`): ${dit(rendu)}`);
  if (!existsSync(installeur) || statSync(installeur).size === 0) echouer(`makensis succeeded but wrote no ${installeur}`);
  return installeur;
}

// Un fichier téléchargé, vérifié contre son empreinte SHA-256.
async function telecharger(adresse: string, quoi: string): Promise<Buffer> {
  const reponse = await fetch(adresse).catch((erreur: unknown) => echouer(`${adresse} could not be fetched: ${erreur instanceof Error ? erreur.message : String(erreur)} — give ${quoi}`));
  if (!reponse.ok) echouer(`${adresse} answered ${reponse.status} — give ${quoi}`);
  return Buffer.from(await reponse.arrayBuffer());
}
const sha256 = (contenu: Buffer) => createHash("sha256").update(contenu).digest("hex");

// Electron pour win32-x64, de la version que l'app déclare : son zip, téléchargé et vérifié
// comme `npm start` pose le sien (node_modules/electron/install.js).
async function zipDElectron(): Promise<string> {
  const electron = join(APP, "node_modules", "electron");
  const { version } = JSON.parse(readFileSync(join(electron, "package.json"), "utf8"));
  const checksums = JSON.parse(readFileSync(join(electron, "checksums.json"), "utf8"));
  const { downloadArtifact } = await import(pathToFileURL(join(APP, "node_modules", "@electron", "get", "dist", "index.js")).href);
  console.log(`brigade: downloading Electron ${version} for win32-${ARCH}…`);
  return downloadArtifact({ version, artifactName: "electron", platform: "win32", arch: ARCH, checksums });
}

// Le `node.exe` officiel pour win-x64, dans la version de celui qui lance cette commande.
async function nodeOfficiel(atelier: string): Promise<string> {
  const version = process.versions.node;
  const adresse = `https://nodejs.org/dist/v${version}`;
  const fichier = `win-${ARCH}/node.exe`;
  console.log(`brigade: downloading Node ${version} for win-${ARCH}…`);
  const sommes = (await telecharger(`${adresse}/SHASUMS256.txt`, "a node.exe with --node")).toString("utf8");
  const attendue = empreinteAnnoncee(sommes, fichier) ?? echouer(`SHASUMS256.txt of Node ${version} does not list ${fichier}`);
  const contenu = await telecharger(`${adresse}/${fichier}`, "a node.exe with --node");
  if (sha256(contenu) !== attendue) echouer(`${fichier} of Node ${version} does not match its published checksum`);
  const chemin = join(atelier, "node.exe");
  writeFileSync(chemin, contenu);
  return chemin;
}

// Le paquet NSIS, extrait dans l'atelier : celui qu'on donne (son archive ou son dossier), sinon
// celui qu'épingle NSIS, téléchargé et vérifié.
async function paquetNsis(donne: string | undefined, atelier: string, executer: Executer): Promise<string> {
  if (donne !== undefined && statSync(donne, { throwIfNoEntry: false })?.isDirectory()) return donne;
  let archive = donne;
  if (archive === undefined) {
    console.log(`brigade: downloading NSIS ${NSIS.version}…`);
    const contenu = await telecharger(NSIS.adresse, "an NSIS bundle with --nsis");
    if (sha256(contenu) !== NSIS.sha256) echouer(`${basename(NSIS.adresse)} does not match its pinned checksum`);
    archive = join(atelier, basename(NSIS.adresse));
    writeFileSync(archive, contenu);
  }
  const extrait = join(atelier, "nsis");
  mkdirSync(extrait, { recursive: true });
  // Le `tar` de Windows est celui du système : un `tar` de Git lirait `C:` comme un hôte distant.
  const tar = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
  const rendu = executer(tar, ["-xzf", archive, "-C", extrait]);
  if (rendu.status !== 0) echouer(`${basename(archive)} could not be extracted: ${dit(rendu)}`);
  return join(extrait, "nsis-bundle");
}

// Les dépendances de l'app — Electron, son téléchargeur et ce que l'app installée porte —, posées
// si l'une manque : depuis un clone neuf, la commande se suffit.
function poserLesDependances(): void {
  const verrou = JSON.parse(readFileSync(join(APP, "package-lock.json"), "utf8"));
  const requises = [...dependancesDeProduction(verrou), "node_modules/electron", "node_modules/@electron/get"];
  if (requises.every((chemin) => existsSync(join(APP, chemin)))) return;
  console.log("brigade: installing the app's dependencies (app/package-lock.json)…");
  // Sous Windows, `npm` est un `npm.cmd` : seul un shell le lance, et il lui faut la commande entière.
  const ci = ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"];
  const fait = process.platform === "win32" ? spawnSync(ci.join(" "), { cwd: APP, stdio: "inherit", shell: true }) : spawnSync(ci[0] ?? "npm", ci.slice(1), { cwd: APP, stdio: "inherit" });
  if (fait.error !== undefined) echouer(`installing the app's dependencies: npm could not be run (${fait.error.message})`);
  if (fait.status !== 0) echouer(`installing the app's dependencies: npm ci exited with ${fait.status ?? fait.signal ?? "?"}`);
}

async function principal(): Promise<void> {
  let options: { version?: string; sortie?: string; electron?: string; node?: string; nsis?: string };
  try {
    options = parseArgs({ options: { version: { type: "string" }, sortie: { type: "string" }, electron: { type: "string" }, node: { type: "string" }, nsis: { type: "string" } }, strict: true }).values;
  } catch (erreur) {
    return refuser(`${erreur instanceof Error ? erreur.message : String(erreur)} — usage: windows.ts [--version <v>] [--sortie <folder>] [--electron <zip or folder>] [--node <node.exe>] [--nsis <NSIS bundle .tar.gz or folder>]`);
  }
  const executer = executerVraiment;
  const version = options.version ?? versionDuCommit(executer);
  versionCourte(version);
  const reclamee = majeureReclamee();
  if (options.node === undefined && Number(process.versions.node.split(".")[0]) < reclamee) refuser(`this node is ${process.version}, the runtime needs ${reclamee} at least — run with a newer node, or give one with --node`);
  for (const [option, chemin] of [["--electron", options.electron], ["--node", options.node], ["--nsis", options.nsis]] as const)
    if (chemin !== undefined && !existsSync(chemin)) refuser(`${option} is a missing file (${chemin})`);
  if (options.node !== undefined) verifierNode(resolve(options.node));
  const sortie = resolve(options.sortie ?? join(ICI, "construit"));
  poserLesDependances();

  const atelier = mkdtempSync(join(tmpdir(), "brigade-windows-"));
  try {
    let electron = options.electron === undefined ? await zipDElectron() : resolve(options.electron);
    if (!statSync(electron).isDirectory()) {
      const extrait = join(atelier, "electron");
      extraireZip(readFileSync(electron), extrait);
      electron = extrait;
    }
    const node = options.node === undefined ? await nodeOfficiel(atelier) : resolve(options.node);
    const nsis = await paquetNsis(options.nsis === undefined ? undefined : resolve(options.nsis), atelier, executer);
    console.log(`brigade: writing the installer (NSIS ${NSIS.version})…`);
    const installeur = construire({ version, electron, node, nsis, sortie, atelier: join(atelier, "arbre"), executer });
    const yml = join(sortie, "latest.yml");
    writeFileSync(yml, metadonneesDeMiseAJour(version, installeur, new Date().toISOString()));
    console.log(`brigade: Windows installer built — ${relative(process.cwd(), installeur) || installeur} (version ${version}, ${ARCH}, not signed; updater metadata ${relative(process.cwd(), yml) || yml})`);
  } finally {
    rmSync(atelier, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    await principal();
  } catch (erreur) {
    if (!(erreur instanceof Arret)) throw erreur;
    console.error(`brigade: Windows installer not built — ${erreur.message}`);
    process.exit(erreur.code);
  }
}
