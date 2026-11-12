// Construit l'app pour Linux x64 : une seule AppImage, brigade-<version>-linux-x64.AppImage, qui
// porte l'app, le runtime de sa station et le `node` qui le joue. Rendue exécutable, elle s'ouvre
// sans rien installer, sans clone du dépôt, sans `node` ni `npm` sur la machine (src/emplacements.ts).
//
//   node app/packaging/linux.ts                         l'AppImage du commit construit
//   node app/packaging/linux.ts --version 1.2.0
//   node app/packaging/linux.ts --electron <zip ou dossier> --node <binaire> --pty <pty.node> --appimage-runtime <fichier>
//   node app/packaging/linux.ts --sortie <dossier>
//
// L'AppImage s'écrit dans app/packaging/construit/ (ou `--sortie`) et la commande dit son chemin.
// Elle tourne sur un Linux x64, avec `mksquashfs` (squashfs-tools) dans le PATH, et, sans `--pty`,
// ce qu'il faut à `node-gyp` pour compiler node-pty : `make`, un compilateur C++, `python3`.
//
// Ce que porte l'AppImage — la forme d'un Electron pour Linux, sous la racine de son AppDir :
//   AppRun                 ce que l'AppImage lance : `brigade`, avec `--no-sandbox` (plus bas)
//   brigade                l'exécutable d'Electron, renommé ; ses `.so` et ses `.pak` à côté
//   brigade.desktop, brigade.png, .DirIcon   son entrée de bureau et son icône
//   resources/app/         `src/`, son package.json et ses dépendances de production ; node-pty n'y
//                          garde que son `pty.node`, compilé pour linux-x64 (`prebuilds/linux-x64/`)
//   resources/runtime/     `src/` et package.json du runtime
//   resources/node/bin/node   le `node` qui joue la station : celui de la machine n'y est pour rien
//   resources/plugin/commands/   `dev.md` et `ask.md` de `commands/` (src/plugin-app.ts)
//
// Une AppImage est le runtime d'AppImage (un exécutable ELF qui monte ce qui le suit), suivi de
// l'AppDir en squashfs. Monté par FUSE, ce dossier appartient à root : le bac à sable SUID de
// Chromium (`chrome-sandbox`) ne peut pas y être setuid, et là où les espaces de noms sans privilège
// sont refusés (Ubuntu 24.04), Electron refuserait de s'ouvrir. AppRun le lance donc sans bac à
// sable, et `chrome-sandbox` n'est pas porté.
//
// Electron vient, sans `--electron`, du dépôt de ses versions sur GitHub, vérifié contre les
// empreintes que porte son paquet npm. Le `node` vient, sans `--node`, de nodejs.org, dans la
// version du `node` qui lance cette commande, vérifié contre les empreintes publiées avec lui.
// node-pty n'a pas de build linux-x64 dans son paquet : sans `--pty`, il est compilé (`npm rebuild`,
// donc `node-gyp`) dans l'arbre de l'app ; c'est un module Node-API, que l'Electron de l'app charge
// tel quel. Le runtime d'AppImage vient, sans `--appimage-runtime`, de sa release sur GitHub,
// épinglé par son empreinte.
//
// L'AppImage n'est pas signée et ne se met pas à jour seule : elle se remplace par la suivante,
// prise sur la page des releases.
//
// Codes de sortie : 0 construit, 1 la construction a échoué, 2 refus (option invalide, machine
// qui n'est pas un Linux x64) — rien n'est écrit.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { APP_DU_PAQUET, NODE_DU_PAQUET, RUNTIME_DU_PAQUET } from "../src/emplacements.ts";
import { APP, Arret, dependancesDeProduction, empreinteAnnoncee, majeureReclamee, NOM, porterLesCommandes, RUNTIME, versionCourte, versionDuCommit } from "./construire.ts";
import { extraireZip } from "./windows.ts";

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
// Le nom de l'exécutable, de l'entrée de bureau et de l'icône.
export const EXECUTABLE = "brigade";
// Ce qu'Electron pour Linux porte d'exécutable, hors du sien : un zip n'en garde pas le bit.
export const AUXILIAIRES = ["chrome_crashpad_handler"];

// Le runtime d'AppImage (type 2) pour x86_64, épinglé : celui de sa release datée.
export const RUNTIME_APPIMAGE = {
  version: "20251108",
  adresse: "https://github.com/AppImage/type2-runtime/releases/download/20251108/runtime-x86_64",
  sha256: "2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d",
};

export type Rendu = { status: number | null; stdout: string; stderr: string };
export type Executer = (commande: string, args: readonly string[], options?: { cwd?: string }) => Rendu;
export const executerVraiment: Executer = (commande, args, options) => {
  const lu = spawnSync(commande, args, { encoding: "utf8", cwd: options?.cwd, maxBuffer: 256 * 1024 * 1024 });
  return { status: lu.error === undefined ? lu.status : null, stdout: lu.stdout ?? "", stderr: lu.stderr ?? (lu.error?.message ?? "") };
};
const dit = (rendu: Rendu) => (rendu.stderr || rendu.stdout).trim() || `code ${String(rendu.status)}`;

// L'AppImage que la construction écrit : le seul nom que la CI ait à connaître, à une version donnée.
export const nomDeLAppImage = (version: string) => `${EXECUTABLE}-${version}-linux-${ARCH}.AppImage`;

// Un ELF 64 bits pour x86-64 : le type d'objet n'est pas regardé (exécutable, ou `.so` comme `pty.node`).
export function estElfX64(debut: Uint8Array): boolean {
  if (debut.length < 20 || debut[0] !== 0x7f || debut[1] !== 0x45 || debut[2] !== 0x4c || debut[3] !== 0x46) return false;
  // ELFCLASS64, petit-boutiste, machine EM_X86_64.
  return debut[4] === 2 && debut[5] === 1 && (debut[18] ?? 0) + ((debut[19] ?? 0) << 8) === 0x3e;
}

// Le début d'un fichier : de quoi lire son en-tête.
function debutDe(chemin: string, taille = 64): Buffer {
  const fd = openSync(chemin, "r");
  try {
    const debut = Buffer.alloc(taille);
    return debut.subarray(0, readSync(fd, debut, 0, taille, 0));
  } finally {
    closeSync(fd);
  }
}

// Un fichier à porter, qui doit être un ELF x86-64 : refusé sinon, en nommant l'option qui l'a donné.
export function verifierElf(chemin: string, option: string): void {
  try {
    if (!statSync(chemin).isFile()) refuser(`${option} is not a file (${chemin})`);
  } catch (erreur) {
    if (erreur instanceof Arret) throw erreur;
    refuser(`${option} is a missing file (${chemin})`);
  }
  if (!estElfX64(debutDe(chemin))) refuser(`${option} (${chemin}) is not a Linux x64 binary`);
}

// AppRun : l'exécutable de l'app, sans bac à sable (en tête de ce fichier), avec ce qu'on lui passe.
export const APPRUN = [
  "#!/bin/sh",
  `# Written by app/packaging/linux.ts: starts ${NOM} from the mounted AppImage.`,
  'ICI="$(dirname "$(readlink -f "$0")")"',
  `exec "$ICI/${EXECUTABLE}" --no-sandbox "$@"`,
  "",
].join("\n");

export const entreeDeBureau = (version: string) =>
  [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${NOM}`,
    `Exec=${EXECUTABLE} %U`,
    `Icon=${EXECUTABLE}`,
    "Categories=Development;",
    "Terminal=false",
    `X-AppImage-Version=${version}`,
    "",
  ].join("\n");

export type OptionsAssemblage = {
  version: string;
  // L'Electron pour linux-x64, déjà extrait : `electron` à sa racine.
  electron: string;
  // Le `node` linux-x64 à porter.
  node: string;
  // Le `pty.node` de node-pty, déjà compilé pour linux-x64 ; sans lui, il est compilé dans l'arbre.
  pty?: string;
  app?: string;
  runtime?: string;
  // Le dossier des commandes du plugin de l'app : `commands/` du dépôt.
  commandes?: string;
  executer: Executer;
};

// Là où le `pty.node` de linux-x64 se range dans node-pty : node-pty l'y charge (lib/utils.js), et
// c'est ce dossier qui dit à l'app que son terminal est là (`ptyDisponible`, src/pty.ts).
export const PTY_LINUX = join("prebuilds", `linux-${ARCH}`, "pty.node");

// node-pty, dans l'arbre de l'app : rien que son JavaScript et son `pty.node` pour linux-x64. Ni
// ses sources, ni ses builds des autres machines.
function porterNodePty(pty: string, donne: string | undefined, executer: Executer): void {
  const range = join(pty, PTY_LINUX);
  rmSync(join(pty, "build"), { recursive: true, force: true });
  rmSync(dirname(range), { recursive: true, force: true });
  let source = donne;
  if (source === undefined) {
    // `npm rebuild` joue le script d'installation de node-pty : sans build pour linux-x64 dans son
    // paquet, c'est `node-gyp rebuild`, que npm porte. Il écrit `build/Release/pty.node`.
    const dansApp = resolve(pty, "..", "..");
    const rendu = executer("npm", ["rebuild", "node-pty", "--foreground-scripts", "--no-audit", "--no-fund"], { cwd: dansApp });
    source = join(pty, "build", "Release", "pty.node");
    if (rendu.status !== 0) echouer(`node-pty could not be compiled for linux-${ARCH} (\`npm rebuild node-pty\`; it needs make, a C++ compiler and python3, or give a pty.node with --pty): ${dit(rendu)}`);
    if (!existsSync(source)) echouer(`\`npm rebuild node-pty\` succeeded but wrote no ${source}`);
  }
  if (!estElfX64(debutDe(source))) echouer(`node-pty's ${source} is not built for linux-${ARCH}`);
  mkdirSync(dirname(range), { recursive: true });
  cpSync(source, range);
  for (const nom of readdirSync(join(pty, "prebuilds"))) if (nom !== `linux-${ARCH}`) rmSync(join(pty, "prebuilds", nom), { recursive: true, force: true });
  for (const reste of ["build", "deps", "src", "third_party", "scripts", "binding.gyp"]) rmSync(join(pty, reste), { recursive: true, force: true });
}

// Pose dans `dossier` l'AppDir de l'AppImage : Electron, l'app, le runtime, le `node`, AppRun,
// l'entrée de bureau et l'icône. Rend `dossier`.
export function assembler(options: OptionsAssemblage, dossier: string): string {
  const app = options.app ?? APP;
  const runtime = options.runtime ?? RUNTIME;
  versionCourte(options.version);
  if (!existsSync(join(options.electron, "electron"))) refuser(`${options.electron} is not an Electron for Linux (no electron)`);
  mkdirSync(dirname(dossier), { recursive: true });
  cpSync(options.electron, dossier, { recursive: true });
  renameSync(join(dossier, "electron"), join(dossier, EXECUTABLE));
  // Le bac à sable SUID n'a pas de sens dans une AppImage (en tête de ce fichier).
  rmSync(join(dossier, "chrome-sandbox"), { force: true });
  for (const nom of [EXECUTABLE, ...AUXILIAIRES]) if (existsSync(join(dossier, nom))) chmodSync(join(dossier, nom), 0o755);
  const ressources = join(dossier, "resources");
  rmSync(join(ressources, "default_app.asar"), { force: true });

  writeFileSync(join(dossier, "AppRun"), APPRUN, { mode: 0o755 });
  writeFileSync(join(dossier, `${EXECUTABLE}.desktop`), entreeDeBureau(options.version));
  cpSync(join(ICI, "icones", "Brigade-1024.png"), join(dossier, `${EXECUTABLE}.png`));
  symlinkSync(`${EXECUTABLE}.png`, join(dossier, ".DirIcon"));

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
  const pty = join(dansApp, "node_modules", "node-pty");
  if (existsSync(pty)) porterNodePty(pty, options.pty, options.executer);

  // Le runtime : ce que `node` exécute et le package.json qui en fait des modules ES — à la
  // version construite, celle que la station dit d'elle-même en démarrant.
  const dansRuntime = join(ressources, RUNTIME_DU_PAQUET);
  cpSync(join(runtime, "src"), join(dansRuntime, "src"), { recursive: true });
  writeFileSync(join(dansRuntime, "package.json"), `${JSON.stringify({ ...JSON.parse(readFileSync(join(runtime, "package.json"), "utf8")), version: options.version }, null, 2)}\n`);

  porterLesCommandes(ressources, options.commandes);

  const node = join(ressources, NODE_DU_PAQUET);
  mkdirSync(dirname(node), { recursive: true });
  cpSync(options.node, node);
  chmodSync(node, 0o755);
  return dossier;
}

export type OptionsConstruction = OptionsAssemblage & {
  // Le runtime d'AppImage, déjà là.
  runtimeAppImage: string;
  // Où l'AppImage s'écrit.
  sortie: string;
  // Où l'AppDir et son squashfs se posent le temps de la construction.
  atelier: string;
};

// Assemble l'AppDir, en fait un squashfs et le colle au runtime d'AppImage : rend le chemin de l'AppImage.
export function construire(options: OptionsConstruction): string {
  verifierElf(options.node, "--node");
  if (options.pty !== undefined) verifierElf(options.pty, "--pty");
  verifierElf(options.runtimeAppImage, "--appimage-runtime");
  const appdir = assembler(options, join(options.atelier, `${NOM}.AppDir`));
  const squashfs = join(options.atelier, `${NOM}.squashfs`);
  rmSync(squashfs, { force: true });
  const rendu = options.executer("mksquashfs", [appdir, squashfs, "-root-owned", "-noappend", "-comp", "zstd", "-quiet"]);
  if (rendu.status === null) echouer(`mksquashfs could not be run — install squashfs-tools: ${dit(rendu)}`);
  if (rendu.status !== 0) echouer(`mksquashfs failed: ${dit(rendu)}`);
  if (!existsSync(squashfs) || statSync(squashfs).size === 0) echouer(`mksquashfs succeeded but wrote no ${squashfs}`);
  mkdirSync(options.sortie, { recursive: true });
  const appimage = join(options.sortie, nomDeLAppImage(options.version));
  rmSync(appimage, { force: true });
  writeFileSync(appimage, Buffer.concat([readFileSync(options.runtimeAppImage), readFileSync(squashfs)]), { mode: 0o755 });
  chmodSync(appimage, 0o755);
  return appimage;
}

// Un fichier téléchargé.
async function telecharger(adresse: string, quoi: string): Promise<Buffer> {
  const reponse = await fetch(adresse).catch((erreur: unknown) => echouer(`${adresse} could not be fetched: ${erreur instanceof Error ? erreur.message : String(erreur)} — give ${quoi}`));
  if (!reponse.ok) echouer(`${adresse} answered ${reponse.status} — give ${quoi}`);
  return Buffer.from(await reponse.arrayBuffer());
}
const sha256 = (contenu: Buffer) => createHash("sha256").update(contenu).digest("hex");

// Electron pour linux-x64, de la version que l'app déclare : son zip, téléchargé et vérifié
// comme `npm start` pose le sien (node_modules/electron/install.js).
async function zipDElectron(): Promise<string> {
  const electron = join(APP, "node_modules", "electron");
  const { version } = JSON.parse(readFileSync(join(electron, "package.json"), "utf8"));
  const checksums = JSON.parse(readFileSync(join(electron, "checksums.json"), "utf8"));
  const { downloadArtifact } = await import(pathToFileURL(join(APP, "node_modules", "@electron", "get", "dist", "index.js")).href);
  console.log(`brigade: downloading Electron ${version} for linux-${ARCH}…`);
  return downloadArtifact({ version, artifactName: "electron", platform: "linux", arch: ARCH, checksums });
}

// Le `node` officiel pour linux-x64, dans la version de celui qui lance cette commande.
async function nodeOfficiel(atelier: string, executer: Executer): Promise<string> {
  const version = process.versions.node;
  const nom = `node-v${version}-linux-${ARCH}`;
  const adresse = `https://nodejs.org/dist/v${version}`;
  const archive = `${nom}.tar.gz`;
  console.log(`brigade: downloading Node ${version} for linux-${ARCH}…`);
  const sommes = (await telecharger(`${adresse}/SHASUMS256.txt`, "a node with --node")).toString("utf8");
  const attendue = empreinteAnnoncee(sommes, archive) ?? echouer(`SHASUMS256.txt of Node ${version} does not list ${archive}`);
  const contenu = await telecharger(`${adresse}/${archive}`, "a node with --node");
  if (sha256(contenu) !== attendue) echouer(`${archive} of Node ${version} does not match its published checksum`);
  const chemin = join(atelier, archive);
  writeFileSync(chemin, contenu);
  const extrait = executer("tar", ["-xzf", chemin, "-C", atelier, `${nom}/bin/node`]);
  if (extrait.status !== 0) echouer(`${archive} could not be extracted: ${dit(extrait)}`);
  return join(atelier, nom, "bin", "node");
}

// Le runtime d'AppImage épinglé, téléchargé et vérifié.
async function runtimeAppImage(atelier: string): Promise<string> {
  console.log(`brigade: downloading the AppImage runtime ${RUNTIME_APPIMAGE.version}…`);
  const contenu = await telecharger(RUNTIME_APPIMAGE.adresse, "an AppImage runtime with --appimage-runtime");
  if (sha256(contenu) !== RUNTIME_APPIMAGE.sha256) echouer(`${basename(RUNTIME_APPIMAGE.adresse)} does not match its pinned checksum`);
  const chemin = join(atelier, basename(RUNTIME_APPIMAGE.adresse));
  writeFileSync(chemin, contenu);
  return chemin;
}

// Les dépendances de l'app — Electron, son téléchargeur et ce que l'app installée porte —, posées
// si l'une manque : depuis un clone neuf, la commande se suffit.
function poserLesDependances(): void {
  const verrou = JSON.parse(readFileSync(join(APP, "package-lock.json"), "utf8"));
  const requises = [...dependancesDeProduction(verrou), "node_modules/electron", "node_modules/@electron/get"];
  if (requises.every((chemin) => existsSync(join(APP, chemin)))) return;
  console.log("brigade: installing the app's dependencies (app/package-lock.json)…");
  const fait = spawnSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: APP, stdio: "inherit" });
  if (fait.error !== undefined) echouer(`installing the app's dependencies: npm could not be run (${fait.error.message})`);
  if (fait.status !== 0) echouer(`installing the app's dependencies: npm ci exited with ${fait.status ?? fait.signal ?? "?"}`);
}

async function principal(): Promise<void> {
  let options: { version?: string; sortie?: string; electron?: string; node?: string; pty?: string; "appimage-runtime"?: string };
  try {
    options = parseArgs({
      options: { version: { type: "string" }, sortie: { type: "string" }, electron: { type: "string" }, node: { type: "string" }, pty: { type: "string" }, "appimage-runtime": { type: "string" } },
      strict: true,
    }).values;
  } catch (erreur) {
    return refuser(`${erreur instanceof Error ? erreur.message : String(erreur)} — usage: linux.ts [--version <v>] [--sortie <folder>] [--electron <zip or folder>] [--node <binary>] [--pty <pty.node>] [--appimage-runtime <file>]`);
  }
  if (process.platform !== "linux" || process.arch !== ARCH) refuser(`the AppImage is built on a Linux ${ARCH} machine (node-pty is compiled there), not on ${process.platform}-${process.arch}`);
  const executer = executerVraiment;
  const version = options.version ?? versionDuCommit(executer);
  versionCourte(version);
  const reclamee = majeureReclamee();
  if (options.node === undefined && Number(process.versions.node.split(".")[0]) < reclamee) refuser(`this node is ${process.version}, the runtime needs ${reclamee} at least — run with a newer node, or give one with --node`);
  for (const [option, chemin] of [["--electron", options.electron], ["--node", options.node], ["--pty", options.pty], ["--appimage-runtime", options["appimage-runtime"]]] as const)
    if (chemin !== undefined && !existsSync(chemin)) refuser(`${option} is a missing file (${chemin})`);
  if (options.node !== undefined) verifierElf(resolve(options.node), "--node");
  if (options.pty !== undefined) verifierElf(resolve(options.pty), "--pty");
  if (options["appimage-runtime"] !== undefined) verifierElf(resolve(options["appimage-runtime"]), "--appimage-runtime");
  const sortie = resolve(options.sortie ?? join(ICI, "construit"));
  poserLesDependances();

  const atelier = mkdtempSync(join(tmpdir(), "brigade-linux-"));
  try {
    let electron = options.electron === undefined ? await zipDElectron() : resolve(options.electron);
    if (!statSync(electron).isDirectory()) {
      const extrait = join(atelier, "electron");
      extraireZip(readFileSync(electron), extrait);
      electron = extrait;
    }
    const node = options.node === undefined ? await nodeOfficiel(atelier, executer) : resolve(options.node);
    const lu = executer(node, ["--version"]);
    const majeure = Number(/^v(\d+)\./.exec(lu.stdout)?.[1]);
    if (lu.status === 0 && Number.isFinite(majeure) && majeure < reclamee) refuser(`the node to bundle (${node}) is ${lu.stdout.trim()}, the runtime needs ${reclamee} at least`);
    const runtime = options["appimage-runtime"] === undefined ? await runtimeAppImage(atelier) : resolve(options["appimage-runtime"]);
    console.log("brigade: writing the AppImage…");
    const appimage = construire({
      version,
      electron,
      node,
      pty: options.pty === undefined ? undefined : resolve(options.pty),
      runtimeAppImage: runtime,
      sortie,
      atelier: join(atelier, "arbre"),
      executer,
    });
    console.log(`brigade: Linux AppImage built — ${relative(process.cwd(), appimage) || appimage} (version ${version}, ${ARCH}, not signed)`);
  } finally {
    rmSync(atelier, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    await principal();
  } catch (erreur) {
    if (!(erreur instanceof Arret)) throw erreur;
    console.error(`brigade: Linux AppImage not built — ${erreur.message}`);
    process.exit(erreur.code);
  }
}
