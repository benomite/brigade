// Construit le paquet Debian de la station : un seul fichier .deb, qui porte
// le runtime, le `node` qui le fait tourner, les unités systemd et ce que dpkg
// joue à l'installation et à chaque mise à jour. Rien de ce que la station
// demande au système ne vit hors de ce paquet.
//
//   node runtime/paquet/construire.ts                 le paquet de cette machine
//   node runtime/paquet/construire.ts --version 1.2.0
//   node runtime/paquet/construire.ts --node <binaire node> --arch arm64
//   node runtime/paquet/construire.ts --sortie <dossier>
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
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

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

const UNITES = ["brigade-station.service", "brigade-station-renouvellement.service", "brigade-station-renouvellement.timer", "brigade-station-mise-a-jour.service", "brigade-station-mise-a-jour.timer"];

function refuser(motif: string): never {
  console.error(`brigade : paquet non construit — ${motif}`);
  process.exit(REFUS);
}

function echouer(motif: string): never {
  console.error(`brigade : paquet non construit — ${motif}`);
  process.exit(ECHEC);
}

const lancer = (commande: string, args: string[]) => spawnSync(commande, args, { encoding: "utf8" });

let options: { version?: string; sortie?: string; node?: string; arch?: string };
try {
  options = parseArgs({
    options: { version: { type: "string" }, sortie: { type: "string" }, node: { type: "string" }, arch: { type: "string" } },
    strict: true,
  }).values;
} catch (erreur) {
  refuser(`${erreur instanceof Error ? erreur.message : String(erreur)} — usage : construire.ts [--version <v>] [--sortie <dossier>] [--node <binaire> --arch <amd64|arm64>]`);
}

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
  poser(node, dans(INSTALLATION.slice(1), "node", "bin", "node"), 0o755);
  // Le renouvellement de la session Max, tel que l'ancien chemin le joue.
  poser(join(RUNTIME, "deploy", "brigade-renouvellement"), dans(INSTALLATION.slice(1), "renouvellement"), 0o755);
  for (const unite of UNITES) poser(join(ICI, "systemd", unite), dans("usr", "lib", "systemd", "system", unite), 0o644);
  poser(join(RACINE, "LICENSE"), dans("usr", "share", "doc", PAQUET, "copyright"), 0o644);

  // Des droits qui ne dépendent ni du masque de la machine ni du clone.
  const normaliser = (repertoire: string) => {
    chmodSync(repertoire, 0o755);
    for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
      const chemin = join(repertoire, entree.name);
      if (entree.isDirectory()) normaliser(chemin);
      else if (chemin.startsWith(join(runtime, "src"))) chmodSync(chemin, 0o644);
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
      "Maintainer: benomite <1735182+benomite@users.noreply.github.com>",
      `Installed-Size: ${taille(arbre)}`,
      `Depends: ${DEPENDANCES.join(", ")}`,
      "Section: devel",
      "Priority: optional",
      "Homepage: https://github.com/benomite/brigade",
      "Description: brigade — la station d'une machine",
      " Un seul service par machine, brigade-station, qui sert tous les projets de",
      " sa configuration (/var/lib/brigade/projets) : il prend leurs tickets sur",
      " GitHub et y fait travailler des cooks, sous la connexion Max du compte",
      " brigade. Le paquet porte le runtime, son node, ses unités systemd et le",
      " renouvellement de la session Max ; il n'écrit aucune règle sudoers.",
      "",
    ].join("\n"),
  );
  chmodSync(dans("DEBIAN", "control"), 0o644);

  mkdirSync(sortie, { recursive: true });
  const construit = lancer("dpkg-deb", ["--root-owner-group", "--build", arbre, fichier]);
  if (construit.status !== 0) echouer(`dpkg-deb a rendu ${construit.status} : ${(construit.stderr || construit.stdout).trim()}`);
} finally {
  rmSync(arbre, { recursive: true, force: true });
}

console.log(`brigade : paquet construit — ${fichier} (version ${version}, ${arch})`);
