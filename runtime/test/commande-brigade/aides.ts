// Ce que les tests de la commande `brigade` se partagent : un runtime publié d'essai, un Mac où
// installer-station.sh la pose, et le PowerShell qui joue la part Windows. Ni vraie machine, ni
// identifiants : launchd, `gh`, `claude` et le téléchargement sont des doublures, le `node` posé est
// celui de ces tests, et le geste (src/station/geste.ts) est le vrai.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { TestContext } from "node:test";
import { pathToFileURL } from "node:url";
import { repertoireDuFichier, repertoireTemporaire } from "../outils.ts";

export const SRC = join(import.meta.dirname, "../../src");
export const INSTALLER_SH = join(import.meta.dirname, "../../deploy/installer-station.sh");
export const INSTALLER_PS1 = join(import.meta.dirname, "../../deploy/windows/installer-station.ps1");
export const GESTE_LINUX = join(import.meta.dirname, "../../deploy/brigade");
export const VERSION_NODE = "v26.1.0";
export const LIGNE_DU_PROFIL = 'export PATH="$HOME/.local/bin:$PATH" # la commande brigade (installer-station.sh)';

// Le cache de compilation de Node que garde le `node` posé : la commande lance le geste sous
// `env -i`, rien de l'environnement de la suite n'y passe, et chaque lancement repaierait la lecture
// du TypeScript de la station. Celui de la suite quand elle en a un, sinon un du fichier.
const CACHE_DE_COMPILATION = process.env.NODE_COMPILE_CACHE || repertoireDuFichier("brigade-test-commande-cache-");

// Un répertoire du test, ou du fichier quand ses tests se partagent la machine (`t` nul).
const repertoire = (t: TestContext | null) => (t === null ? repertoireDuFichier("brigade-test-commande-") : repertoireTemporaire(t));

export type Rendu = { code: number; sortie: string; erreur: string };

export function rendu(r: { status: number | null; stdout: string; stderr: string }): Rendu {
  return { code: r.status ?? -1, sortie: r.stdout, erreur: r.stderr };
}

// Le runtime d'une version publiée, dans `dossier/runtime` : le vrai geste, la vraie aide, et une
// commande `status` qui dit sur sa sortie ce qu'elle a reçu.
export function runtimeDEssai(dossier: string, version: string): string {
  const runtime = join(dossier, "runtime");
  mkdirSync(join(runtime, "src"), { recursive: true });
  writeFileSync(join(runtime, "package.json"), `${JSON.stringify({ name: "brigade-runtime", version, type: "module", scripts: { start: "node src/station/main.ts", status: "node src/temoin.ts", help: "node src/aide.ts" } }, null, 2)}\n`);
  symlinkSync(join(SRC, "station"), join(runtime, "src/station"), "junction");
  const url = (fichier: string) => JSON.stringify(pathToFileURL(join(SRC, fichier)).href);
  writeFileSync(join(runtime, "src/aide.ts"), `import { enProcess } from ${url("appel.ts")};\nimport { principal } from ${url("aide.ts")};\nawait enProcess(principal);\n`);
  writeFileSync(
    join(runtime, "src/temoin.ts"),
    `import { readFileSync } from "node:fs";\nconsole.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), station: process.env.BRIGADE_STATION_DIR, version: JSON.parse(readFileSync("package.json", "utf8")).version }));\n`,
  );
  return runtime;
}

// Le `node` qu'une installation pose : il dit sa version, et pour le reste c'est celui de ces tests.
export function nodePose(fichier: string): void {
  writeFileSync(fichier, `#!/bin/sh\n[ "$1" = -v ] && { echo ${VERSION_NODE}; exit 0; }\nNODE_COMPILE_CACHE='${CACHE_DE_COMPILATION}' exec "${process.execPath}" "$@"\n`);
  chmodSync(fichier, 0o755);
}

// Ce que les releases et nodejs.org servent à un Mac : l'archive du runtime d'une version, et un
// node darwin-arm64 — celui de ces tests — avec ses empreintes.
export function serveurMac(t: TestContext | null, version: string): string {
  const servi = repertoire(t);
  const construire = repertoire(t);
  runtimeDEssai(construire, version);
  const nomNode = `node-${VERSION_NODE}-darwin-arm64`;
  mkdirSync(join(construire, nomNode, "bin"), { recursive: true });
  nodePose(join(construire, nomNode, "bin/node"));
  const tar = (archive: string, quoi: string) => assert.equal(spawnSync("tar", ["-czf", join(servi, archive), "-C", construire, quoi]).status, 0);
  tar("brigade-station-mac.tar.gz", "runtime");
  tar(`${nomNode}.tar.gz`, nomNode);
  const empreinte = createHash("sha256").update(readFileSync(join(servi, `${nomNode}.tar.gz`))).digest("hex");
  writeFileSync(join(servi, "SHASUMS256.txt"), `${empreinte}  ${nomNode}.tar.gz\n`);
  return servi;
}

// Un Mac Apple Silicon, sous un compte ordinaire déjà connecté à GitHub et à Claude, où launchd
// tient un agent. Le projet `calculus` est dans la configuration de sa station.
export function unMac(t: TestContext | null, servi: string, { shell = "/bin/zsh" } = {}) {
  const bin = repertoire(t);
  const etat = repertoire(t);
  const home = repertoire(t);
  const doublure = (nom: string, script: string) => {
    writeFileSync(join(bin, nom), `#!/bin/sh\n${script}\n`);
    chmodSync(join(bin, nom), 0o755);
  };
  doublure("uname", 'case "$1" in -s) echo Darwin ;; -m) echo arm64 ;; esac');
  doublure("id", "echo 501");
  doublure("curl", `while [ $# -gt 0 ]; do case "$1" in -o) sortie="$2"; shift ;; http*) adresse="$1" ;; esac; shift; done; cp "${servi}/\${adresse##*/}" "$sortie"`);
  doublure("launchctl", `case "$1" in print) [ -f "${etat}/charge" ] && echo "state = running" ;; bootstrap) touch "${etat}/charge" ;; bootout) rm -f "${etat}/charge" ;; esac`);
  doublure("gh", "exit 0");
  doublure("claude", "exit 0");
  const racine = join(home, ".config/brigade/station");
  mkdirSync(racine, { recursive: true });
  writeFileSync(join(racine, "projets"), "calculus acme/calculus main\n");
  return {
    home,
    racine,
    base: join(home, ".local/share/brigade-station"),
    commande: join(home, ".local/bin/brigade"),
    // Le PATH de ses terminaux : sans ~/.local/bin.
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home, SHELL: shell, BRIGADE_DEPOT: "acme/brigade", BRIGADE_TERMINAL: join(bin, "aucun-terminal") } as NodeJS.ProcessEnv,
  };
}
export type Mac = ReturnType<typeof unMac>;

// La commande d'installation, sur la dernière version publiée ou sur l'archive donnée.
export function installerMac(mac: Mac, args: string[] = [], env: NodeJS.ProcessEnv = {}): Rendu {
  return rendu(spawnSync("sh", [INSTALLER_SH, ...args], { encoding: "utf8", env: { ...mac.env, ...env } }));
}

// Un terminal neuf du compte : son shell lit le profil qu'il lit à l'ouverture, puis `brigade …`
// — trouvée par le seul PATH de ce terminal.
export function auTerminalNeuf(mac: Mac, profil: string, args: string[]): Rendu {
  const commande = `[ -f "${profil}" ] && . "${profil}"; exec brigade "$@"`;
  return rendu(spawnSync("sh", ["-c", commande, "sh", ...args], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", HOME: mac.home } }));
}

// Le PowerShell qui joue la part Windows, là où il y en a un.
export const PWSH = (process.env.PATH ?? "")
  .split(delimiter)
  .flatMap((dossier) => [join(dossier, "pwsh"), join(dossier, "pwsh.exe")])
  .find((chemin) => existsSync(chemin));

// Le texte de brigade.cmd, tel qu'installer-station.ps1 l'écrit.
export function commandeWindows(): string {
  const lu = /\$commande = @'\r?\n([\s\S]*?)\r?\n'@/.exec(readFileSync(INSTALLER_PS1, "utf8"));
  assert.ok(lu, "installer-station.ps1 n'écrit pas de brigade.cmd");
  return (lu[1] as string).replace(/\r?\n/g, "\r\n");
}
