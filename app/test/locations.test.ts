// Où l'app trouve le runtime de sa station, le `node` qui le joue et son clone : dans le dépôt,
// lancée par `npm start` ; dans son paquet, installée depuis le .dmg — et le PATH que l'app
// installée donne à ce qu'elle lance, ouverte depuis le Finder.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test, type TestContext } from "node:test";
import { pathConfiguration } from "../src/config.ts";
import { PATHS_KNOWN, pathOf, locationsOf, isInstalled, readPathOfShell } from "../src/locations.ts";
import { PRINCIPAL, roleOf } from "../src/workstation/role.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

const SRC = join(import.meta.dirname, "..", "src");
const APP = join(SRC, "..");
const RUNTIME = join(APP, "..", "runtime");
// Le `Contents/Resources` d'une app installée, et celui de l'Electron du dépôt, qui joue `npm start`.
const RESOURCES = "/Applications/Brigade.app/Contents/Resources";
const ELECTRON_OF_REPOSITORY = join(APP, "node_modules", "electron", "dist", "Electron.app", "Contents", "Resources");

test("depuis le dépôt : le runtime à côté de l'app dans son clone, le `node` de `npm start`, et le clone de l'app", () => {
  const locations = locationsOf({ ressources: ELECTRON_OF_REPOSITORY, src: SRC, env: { npm_node_execpath: "/usr/local/bin/node" } });
  assert.deepEqual(locations, { facon: "depot", runtime: RUNTIME, node: "/usr/local/bin/node", clone: APP, commandes: join(APP, "..", "commands") });
  // La station s'y trouve, et c'est celle du dépôt.
  assert.deepEqual(roleOf({ plateforme: "darwin", runtime: locations.runtime, env: {} }), { role: "station", principal: join(RUNTIME, PRINCIPAL) });
  // Lancée autrement que par npm, le `node` du PATH ; BRIGADE_NODE_BIN passe devant tout.
  assert.equal(locationsOf({ ressources: ELECTRON_OF_REPOSITORY, src: SRC, env: {} }).node, "node");
  assert.equal(locationsOf({ ressources: ELECTRON_OF_REPOSITORY, src: SRC, env: { npm_node_execpath: "/usr/local/bin/node", BRIGADE_NODE_BIN: "/essai/node" } }).node, "/essai/node");
});

test("installée : le runtime et le `node` de son paquet, jamais ceux de la machine — et pas de clone", () => {
  // Un `npm` qui l'aurait lancée n'y change rien : le `node` de la machine n'est pas celui du paquet.
  const locations = locationsOf({ ressources: RESOURCES, src: join(RESOURCES, "app", "src"), env: { npm_node_execpath: "/usr/local/bin/node", PATH: "/usr/bin:/bin" } });
  assert.deepEqual(locations, { facon: "installee", runtime: join(RESOURCES, "runtime"), node: join(RESOURCES, "node", "bin", "brigade-node"), clone: undefined, commandes: join(RESOURCES, "plugin", "commands") });
  assert.deepEqual(roleOf({ plateforme: "darwin", runtime: locations.runtime, env: {}, existe: (path) => path === join(RESOURCES, "runtime", PRINCIPAL) }), { role: "station", principal: join(RESOURCES, "runtime", PRINCIPAL) });
  assert.equal(locationsOf({ ressources: RESOURCES, src: join(RESOURCES, "app", "src"), env: { BRIGADE_NODE_BIN: "/essai/node" } }).node, "/essai/node");
});

test("installée, c'est que ses sources sont celles du paquet qui la joue — liens résolus, comme dans un dossier où macOS la déplace", (t) => {
  assert.equal(isInstalled({ ressources: RESOURCES, src: join(RESOURCES, "app", "src") }), true);
  assert.equal(isInstalled({ ressources: ELECTRON_OF_REPOSITORY, src: SRC }), false);
  // Un Electron installé qui jouerait les sources d'un clone : c'est le clone qui compte.
  assert.equal(isInstalled({ ressources: RESOURCES, src: SRC }), false);
  const root = mkdtempSync(join(tmpdir(), "brigade-app-installee-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const resources = join(root, "Brigade.app", "Contents", "Resources");
  mkdirSync(join(resources, "app", "src"), { recursive: true });
  symlinkSync(join(root, "Brigade.app"), join(root, "lien.app"));
  assert.equal(isInstalled({ ressources: join(root, "lien.app", "Contents", "Resources"), src: join(resources, "app", "src") }), true);
});

test("installée, le paquet sans son runtime : l'app est un poste, et dit lequel elle cherchait", () => {
  const locations = locationsOf({ ressources: "/nulle/part/Resources", src: "/nulle/part/Resources/app/src", env: {} });
  assert.deepEqual(roleOf({ plateforme: "darwin", runtime: locations.runtime, env: {} }), { role: "poste", pourquoi: `no station runtime beside the app (${join("/nulle/part/Resources/runtime", PRINCIPAL)})` });
});

test("depuis le dépôt, le PATH reste celui du terminal qui a lancé l'app : le shell du chef n'est pas lu", () => {
  const locations = locationsOf({ ressources: ELECTRON_OF_REPOSITORY, src: SRC, env: {} });
  let readOne = false;
  assert.equal(pathOf({ emplacements: locations, env: { PATH: "/usr/bin" }, maison: "/Users/chef", plateforme: "darwin", duShell: () => ((readOne = true), "/opt/homebrew/bin") }), undefined);
  assert.equal(readOne, false);
});

test("installée, le PATH est celui du shell du chef, puis le sien, puis les dossiers connus, puis le `node` du paquet — chacun une fois", () => {
  const locations = locationsOf({ ressources: RESOURCES, src: join(RESOURCES, "app", "src"), env: {} });
  const path = pathOf({ emplacements: locations, env: { PATH: ["/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(delimiter) }, maison: "/Users/chef", plateforme: "darwin", duShell: () => [join("/Users/chef", ".local", "bin"), "/opt/homebrew/bin", "/usr/bin", "/bin"].join(delimiter) });
  assert.deepEqual(path?.split(delimiter), [
    join("/Users/chef", ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    join("/Users/chef", ".claude", "local"),
    join(RESOURCES, "node", "bin"),
  ]);
  // Un shell qui ne s'est pas lu : le PATH du système, les dossiers connus — où sont `claude` et `gh` —, et le `node` du paquet.
  const withoutShell = pathOf({ emplacements: locations, env: { PATH: ["/usr/bin", "/bin"].join(delimiter) }, maison: "/Users/chef", plateforme: "darwin", duShell: () => undefined });
  assert.deepEqual(withoutShell?.split(delimiter), ["/usr/bin", "/bin", ...PATHS_KNOWN("/Users/chef", "darwin"), join(RESOURCES, "node", "bin")]);
});

test("sous Windows, les dossiers connus ne sont pas ceux d'Homebrew : seul celui où l'installeur pose `claude`", () => {
  assert.deepEqual(PATHS_KNOWN("C:\\Users\\chef", "win32"), [join("C:\\Users\\chef", ".local", "bin")]);
  assert.ok(PATHS_KNOWN("/Users/chef", "darwin").includes("/opt/homebrew/bin"));
});

// Un faux shell de connexion : un script qui joue ce qu'on lui donne, avec les arguments que l'app passe.
function fakeShell(t: TestContext, body: string): string {
  const folder = mkdtempSync(join(tmpdir(), "brigade-app-shell-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const shell = join(folder, "shell");
  writeFileSync(shell, `#!/bin/sh\n${body}\n`);
  chmodSync(shell, 0o755);
  return shell;
}

test("le PATH du shell de connexion se lit au milieu de ce que ses fichiers de démarrage écrivent", { skip: WITHOUT_POSIX }, (t) => {
  // Ce que l'app lui demande, `-ilc <commande>`, joué par `sh` avec un PATH à lui ; et du bruit avant et après.
  const shell = fakeShell(t, 'echo "bienvenue"; [ "$1" = "-ilc" ] || exit 9; PATH="/opt/homebrew/bin:/usr/bin:/bin"; eval "$2"; echo; echo "au revoir"');
  assert.equal(readPathOfShell(shell, 60_000, { PATH: "/usr/bin:/bin" }), "/opt/homebrew/bin:/usr/bin:/bin");
});

test("un shell qui échoue, qui n'existe pas ou qui ne rend rien dans le délai : aucun PATH n'est lu", (t) => {
  assert.equal(readPathOfShell(fakeShell(t, "exit 1"), 60_000, { PATH: "/usr/bin:/bin" }), undefined);
  assert.equal(readPathOfShell("/nulle/part/zsh", 60_000, { PATH: "/usr/bin:/bin" }), undefined);
  assert.equal(readPathOfShell(fakeShell(t, "echo rien d'utile"), 60_000, { PATH: "/usr/bin:/bin" }), undefined);
  // Le shell qui ne rend pas la main est arrêté : `exec`, pour que ce soit lui qui reçoive le signal.
  assert.equal(readPathOfShell(fakeShell(t, "exec sleep 600"), 500, { PATH: "/usr/bin:/bin" }), undefined);
});

test("le fichier des projets et le répertoire de la station ne dépendent pas de la façon dont l'app est lancée", () => {
  // Installée ou non, l'app lit `~/.config/brigade/` tel quel (config.ts) : rien ici n'en décide.
  assert.equal(pathConfiguration({}, "/Users/chef"), join("/Users/chef", ".config", "brigade", "app.json"));
  const source = readFileSync(join(SRC, "locations.ts"), "utf8").split("\n").filter((line) => !line.trimStart().startsWith("//")).join("\n");
  assert.doesNotMatch(source, /\.config|cheminConfiguration|BRIGADE_STATION_DIR|homedir/);
});
