// Construit le paquet Debian de la station : un seul fichier .deb, qui porte
// le runtime, le `node` qui le fait tourner, les unités systemd et ce que dpkg
// joue à l'installation et à chaque mise à jour. Rien de ce que la station
// demande au système ne vit hors de ce paquet.
//
//   node runtime/paquet/construire.ts --repo <compte>/<dépôt> --maintainer "Nom <courriel>"
//                                                     le paquet de cette machine
//   node runtime/paquet/construire.ts --version 1.2.0
//   node runtime/paquet/construire.ts --node <binaire node> --arch arm64
//   node runtime/paquet/construire.ts --sortie <dossier>
//
// À côté du .deb, une archive par plateforme, `brigade-station-<version>-<os>-<arch>.tar.gz`
// (linux-x64 et darwin-arm64) : `runtime/` (ce que le .deb porte), `node/`, `bin/brigade`,
// `install.sh` et `services/`. Le node de chacune est téléchargé de nodejs.org (la version de
// celui qui lance cette commande, somme de contrôle vérifiée), ou donné par `--node-linux-x64` /
// `--node-darwin-arm64`; son en-tête doit être celui de la plateforme. `--sans-archives` ne
// construit que le .deb.
//
// `--repo` (ou BRIGADE_PAQUET_DEPOT) nomme le dépôt GitHub qui publie ce paquet :
// il devient la page du paquet et la source de sa mise à jour. `--maintainer`
// (ou BRIGADE_PAQUET_MAINTENEUR) est le mainteneur dit dans le paquet. Aucun
// n'est supposé : sans l'un, la construction est refusée en le disant.
//
// Le paquet s'écrit dans runtime/paquet/construit/ (ou `--sortie`), sous le
// nom brigade-station_<version>_<arch>.deb, et la commande dit son chemin.
//
// Le `node` du paquet est, sans `--node`, celui qui lance cette commande — il
// doit être celui que le runtime réclame (`engines` de son package.json) — et
// l'architecture celle de cette machine. Pour une autre architecture, `--node`
// désigne le binaire `node` de cette architecture-là, et `--arch` la nomme.
//
// La version vient, sans `--version`, du commit construit : sa date (UTC) et
// son empreinte, 0.<AAAAMMJJ>.<HHMMSS>+g<commit>. Deux constructions de
// commits successifs se suivent donc pour dpkg.
//
// Il faut `dpkg-deb` (Debian, ou le paquet dpkg d'Homebrew), et rien d'autre :
// ni root, ni fakeroot — les fichiers du paquet sont à root par
// `--root-owner-group`.
//
// Codes de sortie : 0 construit, 1 la construction a échoué, 2 refus (option
// invalide) — rien n'est écrit.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { cibleDuBinaire } from "./binaire.ts";

const REFUS = 2;
const ECHEC = 1;

export const PAQUET = "brigade-station";
// Là où le paquet pose ce qui est à lui.
export const INSTALLATION = `/usr/lib/${PAQUET}`;

const ICI = import.meta.dirname;
const RUNTIME = resolve(ICI, "..");
const RACINE = resolve(RUNTIME, "..");

// Ce que la machine doit avoir pour la station : `node` (libatomic, glibc
// 2.28), le compte (adduser), `git` et `gh` pour les projets, `bwrap` pour la
// cloison des cooks, systemd pour le service.
const DEPENDANCES = ["adduser", "ca-certificates", "git", "gh", "bubblewrap", "libatomic1", "libc6 (>= 2.28)", "libstdc++6", "systemd"];

// L'architecture Debian de chaque architecture de `node`.
const ARCHITECTURES: Record<string, string> = { x64: "amd64", arm64: "arm64" };

// Les archives de la station : leur plateforme, et le nom que nodejs.org donne à son node.
const PLATEFORMES = [
  { os: "linux", arch: "x64", option: "node-linux-x64" },
  { os: "darwin", arch: "arm64", option: "node-darwin-arm64" },
] as const;
// Là où une archive installée pose la station : les unités systemd y pointent.
const INSTALLATION_ARCHIVE = "/opt/brigade-station/current";

const UNITES = ["brigade-station.service", "brigade-station-porte.service", "brigade-station-mise-a-jour.service", "brigade-station-mise-a-jour.timer"];

function refuser(motif: string): never {
  console.error(`brigade : paquet non construit — ${motif}`);
  process.exit(REFUS);
}

function echouer(motif: string): never {
  console.error(`brigade : paquet non construit — ${motif}`);
  process.exit(ECHEC);
}

const lancer = (commande: string, args: string[]) => spawnSync(commande, args, { encoding: "utf8" });

let options: { version?: string; sortie?: string; node?: string; arch?: string; repo?: string; maintainer?: string; "node-linux-x64"?: string; "node-darwin-arm64"?: string; "sans-archives"?: boolean };
try {
  options = parseArgs({
    options: { version: { type: "string" }, sortie: { type: "string" }, node: { type: "string" }, arch: { type: "string" }, repo: { type: "string" }, maintainer: { type: "string" }, "node-linux-x64": { type: "string" }, "node-darwin-arm64": { type: "string" }, "sans-archives": { type: "boolean" } },
    strict: true,
  }).values;
} catch (erreur) {
  refuser(`${erreur instanceof Error ? erreur.message : String(erreur)} — usage : construire.ts [--version <v>] [--sortie <dossier>] [--node <binaire> --arch <amd64|arm64>] [--node-linux-x64 <binaire>] [--node-darwin-arm64 <binaire>] [--sans-archives] --repo <compte>/<dépôt> --maintainer "Nom <courriel>"`);
}

const depotPublie = options.repo ?? process.env.BRIGADE_PAQUET_DEPOT ?? "";
if (!/^[\w.-]+\/[\w.-]+$/.test(depotPublie)) refuser(`the GitHub repository that publishes this package is missing or invalid (« ${depotPublie} ») — give it as --repo <account>/<repository>, or set BRIGADE_PAQUET_DEPOT`);
const mainteneur = options.maintainer ?? process.env.BRIGADE_PAQUET_MAINTENEUR ?? "";
if (!/^[^<>\n]+ <[^<>\s]+@[^<>\s]+>$/.test(mainteneur)) refuser(`the package maintainer is missing or invalid (« ${mainteneur} ») — give it as --maintainer "Name <email>", or set BRIGADE_PAQUET_MAINTENEUR`);

const archHote = ARCHITECTURES[process.arch];
const arch = options.arch ?? archHote ?? refuser(`aucune architecture Debian pour « ${process.arch} » — la nommer par --arch, avec le --node qui lui va`);
if (!Object.values(ARCHITECTURES).includes(arch)) refuser(`architecture « ${arch} » inconnue — attendu ${Object.values(ARCHITECTURES).join(" ou ")}`);
if (options.arch !== undefined && options.arch !== archHote && options.node === undefined) refuser(`--arch ${options.arch} sans --node : le node de cette machine n'est pas de cette architecture`);

const node = resolve(options.node ?? process.execPath);
try {
  if (!statSync(node).isFile()) refuser(`--node ne désigne pas un fichier (${node})`);
} catch {
  refuser(`--node désigne un fichier absent (${node})`);
}

// Le `node` du paquet doit faire tourner le runtime : sa majeure est vérifiée
// quand il se lance ici — pas celui d'une autre architecture.
const reclamee = Number(/\d+/.exec(JSON.parse(readFileSync(join(RUNTIME, "package.json"), "utf8")).engines?.node ?? "")?.[0]);
if (arch === archHote) {
  const lu = lancer(node, ["--version"]);
  const majeure = Number(/^v(\d+)\./.exec(lu.stdout ?? "")?.[1]);
  if (lu.status !== 0 || !Number.isFinite(majeure)) refuser(`le node à porter (${node}) ne dit pas sa version`);
  if (Number.isFinite(reclamee) && majeure < reclamee) refuser(`le node à porter (${node}) est en ${lu.stdout.trim()}, le runtime réclame la version ${reclamee} au moins`);
}

function versionDuCommit(): string {
  const lu = spawnSync("git", ["-C", RACINE, "log", "-1", "--date=format-local:%Y%m%d.%H%M%S", "--format=%cd+g%h"], { encoding: "utf8", env: { ...process.env, TZ: "UTC" } });
  const brut = lu.stdout?.trim() ?? "";
  if (lu.status !== 0 || !/^\d{8}\.\d{6}\+g[0-9a-f]+$/.test(brut)) refuser(`la version ne se déduit pas du dépôt (${(lu.stderr ?? "").trim() || "git n'a rien rendu"}) — la donner par --version`);
  return `0.${brut}`;
}
const version = options.version ?? versionDuCommit();
// Ce que dpkg accepte d'une version sans révision Debian.
if (!/^[0-9][A-Za-z0-9.+~]*$/.test(version)) refuser(`version invalide « ${version} » — un chiffre d'abord, puis lettres, chiffres, « . », « + » ou « ~ »`);

// Le node de nodejs.org pour une plateforme, à la version de celui qui lance cette commande ;
// sa somme de contrôle est lue dans SHASUMS256.txt, et le fichier refusé si elle diffère.
async function telechargerNode(os: string, arch: string, dossier: string): Promise<string> {
  const v = process.version;
  const base = `https://nodejs.org/dist/${v}`;
  const nom = `node-${v}-${os}-${arch}.tar.gz`;
  const lire = async (adresse: string) => {
    const reponse = await fetch(adresse);
    if (!reponse.ok) echouer(`${adresse} rend ${reponse.status}`);
    return Buffer.from(await reponse.arrayBuffer());
  };
  const sommes = (await lire(`${base}/SHASUMS256.txt`)).toString("utf8");
  const attendue = new RegExp(`^([0-9a-f]{64})  ${nom.replaceAll(".", "\\.")}$`, "m").exec(sommes)?.[1];
  if (!attendue) echouer(`SHASUMS256.txt de node ${v} ne porte pas ${nom}`);
  const tarball = await lire(`${base}/${nom}`);
  if (createHash("sha256").update(tarball).digest("hex") !== attendue) echouer(`${nom} : la somme de contrôle ne correspond pas à SHASUMS256.txt`);
  const travail = mkdtempSync(join(dossier, "brigade-node-"));
  writeFileSync(join(travail, nom), tarball);
  const extrait = lancer("tar", ["-xzf", join(travail, nom), "-C", travail, "--strip-components=1", `node-${v}-${os}-${arch}/bin/node`]);
  if (extrait.status !== 0) echouer(`tar ne lit pas ${nom} : ${extrait.stderr.trim()}`);
  return join(travail, "bin", "node");
}

// L'archive d'une plateforme : le .deb sans son système (runtime/ et ce qu'il importe), le node de
// la plateforme, `bin/brigade` et `install.sh` (des amorces, la suite les complète) et `services/`.
function composerArchive({ archive, runtime, unites, node }: { archive: string; runtime: string; unites: string; node: string }) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-archive-"));
  try {
    for (const entree of readdirSync(runtime)) if (entree !== "node") cpSync(join(runtime, entree), join(racine, entree), { recursive: true });
    mkdirSync(join(racine, "node", "bin"), { recursive: true });
    copyFileSync(node, join(racine, "node", "bin", "node"));
    chmodSync(join(racine, "node", "bin", "node"), 0o755);
    mkdirSync(join(racine, "bin"));
    writeFileSync(join(racine, "bin", "brigade"), "#!/bin/sh\necho 'brigade : la commande n'\\''est pas encore écrite' >&2\nexit 1\n", { mode: 0o755 });
    writeFileSync(join(racine, "install.sh"), "#!/bin/sh\necho 'install.sh : pas encore écrit' >&2\nexit 1\n", { mode: 0o755 });
    mkdirSync(join(racine, "services", "launchd"), { recursive: true });
    writeFileSync(join(racine, "services", "launchd", "LISEZMOI"), "Les plists launchd de la station viendront ici.\n");
    for (const unite of UNITES) {
      const texte = readFileSync(join(unites, unite), "utf8").replaceAll(INSTALLATION, INSTALLATION_ARCHIVE);
      writeFileSync(join(racine, "services", unite), texte, { mode: 0o644 });
    }
    const normaliser = (repertoire: string) => {
      chmodSync(repertoire, 0o755);
      for (const entree of readdirSync(repertoire, { withFileTypes: true })) if (entree.isDirectory()) normaliser(join(repertoire, entree.name));
    };
    normaliser(racine);
    const gnu = /GNU tar/.test(lancer("tar", ["--version"]).stdout ?? "");
    const proprietaire = gnu ? ["--owner=0", "--group=0", "--numeric-owner"] : ["--uid", "0", "--gid", "0"];
    const fait = lancer("tar", [...proprietaire, "-czf", archive, "-C", racine, ...readdirSync(racine).sort()]);
    if (fait.status !== 0) echouer(`tar n'a pas écrit ${archive} : ${fait.stderr.trim()}`);
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
}

const sortie = resolve(options.sortie ?? join(ICI, "construit"));
const fichier = join(sortie, `${PAQUET}_${version}_${arch}.deb`);

if (lancer("dpkg-deb", ["--version"]).status !== 0) echouer("`dpkg-deb` manque sur cette machine (apt install dpkg, ou brew install dpkg)");

// L'arbre du paquet, posé à côté puis remis à dpkg-deb.
const arbre = mkdtempSync(join(tmpdir(), "brigade-paquet-"));
try {
  const dans = (...chemin: string[]) => join(arbre, ...chemin);
  const poser = (source: string, cible: string, mode: number) => {
    mkdirSync(join(cible, ".."), { recursive: true });
    copyFileSync(source, cible);
    chmodSync(cible, mode);
  };

  // Le runtime : ce que `node` exécute et le package.json qui en fait des
  // modules ES. Ni tests, ni dépendances de dev — le runtime n'en a pas
  // d'autres. Le package.json porte la version du paquet : c'est celle que la
  // station dit quand elle démarre, et que sa mise à jour attend.
  const runtime = dans(INSTALLATION.slice(1), "runtime");
  cpSync(join(RUNTIME, "src"), join(runtime, "src"), { recursive: true });
  writeFileSync(join(runtime, "package.json"), `${JSON.stringify({ ...JSON.parse(readFileSync(join(RUNTIME, "package.json"), "utf8")), version }, null, 2)}\n`);
  chmodSync(join(runtime, "package.json"), 0o644);
  // Les fichiers du dépôt hors de runtime/src que le runtime importe
  // (app/src/vue/autonomy/compute.ts), et ceux qu'ils importent, posés au même
  // chemin sous l'installation : sans eux la station ne démarre pas (#4552).
  const horsDuRuntime = new Set<string>();
  const suivre = (fichier: string) => {
    for (const [, cible = ""] of readFileSync(fichier, "utf8").matchAll(/(?:from|import\()\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      const chemin = resolve(dirname(fichier), cible);
      if (chemin.startsWith(join(RUNTIME, "src") + sep) || horsDuRuntime.has(chemin)) continue;
      horsDuRuntime.add(chemin);
      suivre(chemin);
    }
  };
  const parcourir = (repertoire: string) => {
    for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
      const chemin = join(repertoire, entree.name);
      if (entree.isDirectory()) parcourir(chemin);
      else if (/\.[cm]?[jt]s$/.test(entree.name)) suivre(chemin);
    }
  };
  parcourir(join(RUNTIME, "src"));
  for (const chemin of horsDuRuntime) poser(chemin, dans(INSTALLATION.slice(1), relative(RACINE, chemin)), 0o644);
  // The prompts of the new kitchen (`runtime/src/kitchen/`), next to it the same way. The
  // second judge's brief is one of them (`agents/kitchen/second-judge.md`): read from the
  // running runtime's version, never from the judged delivery; the macOS and Windows
  // archives carry it too.
  for (const prompt of readdirSync(join(RACINE, "agents", "kitchen"))) poser(join(RACINE, "agents", "kitchen", prompt), join(runtime, "agents", "kitchen", prompt), 0o644);
  poser(node, dans(INSTALLATION.slice(1), "node", "bin", "node"), 0o755);
  for (const unite of UNITES) poser(join(ICI, "systemd", unite), dans("usr", "lib", "systemd", "system", unite), 0o644);
  // La source de la mise à jour : le dépôt qui publie ce paquet.
  const miseAJour = dans("usr", "lib", "systemd", "system", "brigade-station-mise-a-jour.service");
  const ancre = "Environment=BRIGADE_STATION_DIR=/var/lib/brigade\n";
  const unite = readFileSync(miseAJour, "utf8");
  if (!unite.includes(ancre)) echouer("l'unité de mise à jour ne porte plus la ligne BRIGADE_STATION_DIR : la source des versions n'a nulle part où se poser");
  writeFileSync(miseAJour, unite.replace(ancre, `${ancre}Environment=BRIGADE_MISE_A_JOUR_SOURCE=github:${depotPublie}\n`));
  poser(join(RACINE, "LICENSE"), dans("usr", "share", "doc", PAQUET, "copyright"), 0o644);

  // Des droits qui ne dépendent ni du masque de la machine ni du clone.
  const normaliser = (repertoire: string) => {
    chmodSync(repertoire, 0o755);
    for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
      const chemin = join(repertoire, entree.name);
      if (entree.isDirectory()) normaliser(chemin);
      else if (chemin.startsWith(join(runtime, "src")) || chemin.startsWith(join(runtime, "agents"))) chmodSync(chemin, 0o644);
    }
  };
  normaliser(arbre);

  const taille = (chemin: string): number =>
    statSync(chemin).isDirectory() ? readdirSync(chemin).reduce((somme, nom) => somme + taille(join(chemin, nom)), 0) : Math.ceil(statSync(chemin).size / 1024);

  mkdirSync(dans("DEBIAN"));
  for (const script of ["postinst", "prerm", "postrm"]) poser(join(ICI, "debian", script), dans("DEBIAN", script), 0o755);
  writeFileSync(
    dans("DEBIAN", "control"),
    [
      `Package: ${PAQUET}`,
      `Version: ${version}`,
      `Architecture: ${arch}`,
      `Maintainer: ${mainteneur}`,
      `Installed-Size: ${taille(arbre)}`,
      `Depends: ${DEPENDANCES.join(", ")}`,
      "Section: devel",
      "Priority: optional",
      `Homepage: https://github.com/${depotPublie}`,
      "Description: brigade — la station d'une machine",
      " Un seul service par machine, brigade-station : la cuisine, qui sert tous les",
      " projets de /var/lib/brigade/kitchen/projects : elle prend leurs tickets sur",
      " GitHub et y fait travailler des agents, sous la connexion Max du compte",
      " brigade. Le paquet porte le runtime, son node, et ses unités systemd ;",
      " il n'écrit aucune règle sudoers.",
      "",
    ].join("\n"),
  );
  chmodSync(dans("DEBIAN", "control"), 0o644);

  mkdirSync(sortie, { recursive: true });
  const construit = lancer("dpkg-deb", ["--root-owner-group", "--build", arbre, fichier]);
  if (construit.status !== 0) echouer(`dpkg-deb a rendu ${construit.status} : ${(construit.stderr || construit.stdout).trim()}`);

  if (!options["sans-archives"]) {
    const unitesPosees = join(arbre, "usr", "lib", "systemd", "system");
    for (const plateforme of PLATEFORMES) {
      const nodeDonne = options[plateforme.option];
      const nodeDeLArchive = nodeDonne === undefined ? await telechargerNode(plateforme.os, plateforme.arch, tmpdir()) : resolve(nodeDonne);
      const cible = cibleDuBinaire(nodeDeLArchive);
      if (cible?.os !== plateforme.os || cible.arch !== plateforme.arch) echouer(`le node de l'archive ${plateforme.os}-${plateforme.arch} (${nodeDeLArchive}) est ${cible ? `${cible.os}-${cible.arch}` : "d'un format inconnu"}`);
      const archive = join(sortie, `${PAQUET}-${version}-${plateforme.os}-${plateforme.arch}.tar.gz`);
      composerArchive({ archive, runtime: join(arbre, INSTALLATION.slice(1)), unites: unitesPosees, node: nodeDeLArchive });
      console.log(`brigade : archive construite — ${archive}`);
    }
  }
} finally {
  rmSync(arbre, { recursive: true, force: true });
}

console.log(`brigade : paquet construit — ${fichier} (version ${version}, ${arch})`);
