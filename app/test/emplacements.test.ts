// Où l'app trouve le runtime de sa station, le `node` qui le joue et son clone : dans le dépôt,
// lancée par `npm start` ; dans son paquet, installée depuis le .dmg — et le PATH que l'app
// installée donne à ce qu'elle lance, ouverte depuis le Finder.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test, type TestContext } from "node:test";
import { cheminConfiguration } from "../src/config.ts";
import { CHEMINS_CONNUS, cheminDe, emplacementsDe, estInstallee, lireCheminDuShell } from "../src/emplacements.ts";
import { PRINCIPAL, roleDe } from "../src/poste/role.ts";

const SRC = join(import.meta.dirname, "..", "src");
const APP = join(SRC, "..");
const RUNTIME = join(APP, "..", "runtime");
// Le `Contents/Resources` d'une app installée, et celui de l'Electron du dépôt, qui joue `npm start`.
const RESSOURCES = "/Applications/Brigade.app/Contents/Resources";
const ELECTRON_DU_DEPOT = join(APP, "node_modules", "electron", "dist", "Electron.app", "Contents", "Resources");

test("depuis le dépôt : le runtime à côté de l'app dans son clone, le `node` de `npm start`, et le clone de l'app", () => {
  const emplacements = emplacementsDe({ ressources: ELECTRON_DU_DEPOT, src: SRC, env: { npm_node_execpath: "/usr/local/bin/node" } });
  assert.deepEqual(emplacements, { facon: "depot", runtime: RUNTIME, node: "/usr/local/bin/node", clone: APP });
  // La station s'y trouve, et c'est celle du dépôt.
  assert.deepEqual(roleDe({ plateforme: "darwin", runtime: emplacements.runtime, env: {} }), { role: "station", principal: join(RUNTIME, PRINCIPAL) });
  // Lancée autrement que par npm, le `node` du PATH ; BRIGADE_NODE_BIN passe devant tout.
  assert.equal(emplacementsDe({ ressources: ELECTRON_DU_DEPOT, src: SRC, env: {} }).node, "node");
  assert.equal(emplacementsDe({ ressources: ELECTRON_DU_DEPOT, src: SRC, env: { npm_node_execpath: "/usr/local/bin/node", BRIGADE_NODE_BIN: "/essai/node" } }).node, "/essai/node");
});

test("installée : le runtime et le `node` de son paquet, jamais ceux de la machine — et pas de clone", () => {
  // Un `npm` qui l'aurait lancée n'y change rien : le `node` de la machine n'est pas celui du paquet.
  const emplacements = emplacementsDe({ ressources: RESSOURCES, src: join(RESSOURCES, "app", "src"), env: { npm_node_execpath: "/usr/local/bin/node", PATH: "/usr/bin:/bin" } });
  assert.deepEqual(emplacements, { facon: "installee", runtime: join(RESSOURCES, "runtime"), node: join(RESSOURCES, "node", "bin", "node"), clone: undefined });
  assert.deepEqual(roleDe({ plateforme: "darwin", runtime: emplacements.runtime, env: {}, existe: (chemin) => chemin === join(RESSOURCES, "runtime", PRINCIPAL) }), { role: "station", principal: join(RESSOURCES, "runtime", PRINCIPAL) });
  assert.equal(emplacementsDe({ ressources: RESSOURCES, src: join(RESSOURCES, "app", "src"), env: { BRIGADE_NODE_BIN: "/essai/node" } }).node, "/essai/node");
});

test("installée, c'est que ses sources sont celles du paquet qui la joue — liens résolus, comme dans un dossier où macOS la déplace", (t) => {
  assert.equal(estInstallee({ ressources: RESSOURCES, src: join(RESSOURCES, "app", "src") }), true);
  assert.equal(estInstallee({ ressources: ELECTRON_DU_DEPOT, src: SRC }), false);
  // Un Electron installé qui jouerait les sources d'un clone : c'est le clone qui compte.
  assert.equal(estInstallee({ ressources: RESSOURCES, src: SRC }), false);
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-installee-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const ressources = join(racine, "Brigade.app", "Contents", "Resources");
  mkdirSync(join(ressources, "app", "src"), { recursive: true });
  symlinkSync(join(racine, "Brigade.app"), join(racine, "lien.app"));
  assert.equal(estInstallee({ ressources: join(racine, "lien.app", "Contents", "Resources"), src: join(ressources, "app", "src") }), true);
});

test("installée, le paquet sans son runtime : l'app est un poste, et dit lequel elle cherchait", () => {
  const emplacements = emplacementsDe({ ressources: "/nulle/part/Resources", src: "/nulle/part/Resources/app/src", env: {} });
  assert.deepEqual(roleDe({ plateforme: "darwin", runtime: emplacements.runtime, env: {} }), { role: "poste", pourquoi: `no station runtime beside the app (${join("/nulle/part/Resources/runtime", PRINCIPAL)})` });
});

test("depuis le dépôt, le PATH reste celui du terminal qui a lancé l'app : le shell du chef n'est pas lu", () => {
  const emplacements = emplacementsDe({ ressources: ELECTRON_DU_DEPOT, src: SRC, env: {} });
  let lu = false;
  assert.equal(cheminDe({ emplacements, env: { PATH: "/usr/bin" }, maison: "/Users/chef", plateforme: "darwin", duShell: () => ((lu = true), "/opt/homebrew/bin") }), undefined);
  assert.equal(lu, false);
});

test("installée, le PATH est celui du shell du chef, puis le sien, puis les dossiers connus, puis le `node` du paquet — chacun une fois", () => {
  const emplacements = emplacementsDe({ ressources: RESSOURCES, src: join(RESSOURCES, "app", "src"), env: {} });
  const chemin = cheminDe({ emplacements, env: { PATH: ["/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(delimiter) }, maison: "/Users/chef", plateforme: "darwin", duShell: () => [join("/Users/chef", ".local", "bin"), "/opt/homebrew/bin", "/usr/bin", "/bin"].join(delimiter) });
  assert.deepEqual(chemin?.split(delimiter), [
    join("/Users/chef", ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    join("/Users/chef", ".claude", "local"),
    join(RESSOURCES, "node", "bin"),
  ]);
  // Un shell qui ne s'est pas lu : le PATH du système, les dossiers connus — où sont `claude` et `gh` —, et le `node` du paquet.
  const sansShell = cheminDe({ emplacements, env: { PATH: ["/usr/bin", "/bin"].join(delimiter) }, maison: "/Users/chef", plateforme: "darwin", duShell: () => undefined });
  assert.deepEqual(sansShell?.split(delimiter), ["/usr/bin", "/bin", ...CHEMINS_CONNUS("/Users/chef", "darwin"), join(RESSOURCES, "node", "bin")]);
});

test("sous Windows, les dossiers connus ne sont pas ceux d'Homebrew : seul celui où l'installeur pose `claude`", () => {
  assert.deepEqual(CHEMINS_CONNUS("C:\\Users\\chef", "win32"), [join("C:\\Users\\chef", ".local", "bin")]);
  assert.ok(CHEMINS_CONNUS("/Users/chef", "darwin").includes("/opt/homebrew/bin"));
});

// Un faux shell de connexion : un script qui joue ce qu'on lui donne, avec les arguments que l'app passe.
function fauxShell(t: TestContext, corps: string): string {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-app-shell-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  const shell = join(dossier, "shell");
  writeFileSync(shell, `#!/bin/sh\n${corps}\n`);
  chmodSync(shell, 0o755);
  return shell;
}

test("le PATH du shell de connexion se lit au milieu de ce que ses fichiers de démarrage écrivent", (t) => {
  // Ce que l'app lui demande, `-ilc <commande>`, joué par `sh` avec un PATH à lui ; et du bruit avant et après.
  const shell = fauxShell(t, 'echo "bienvenue"; [ "$1" = "-ilc" ] || exit 9; PATH="/opt/homebrew/bin:/usr/bin:/bin"; eval "$2"; echo; echo "au revoir"');
  assert.equal(lireCheminDuShell(shell, 60_000, { PATH: "/usr/bin:/bin" }), "/opt/homebrew/bin:/usr/bin:/bin");
});

test("un shell qui échoue, qui n'existe pas ou qui ne rend rien dans le délai : aucun PATH n'est lu", (t) => {
  assert.equal(lireCheminDuShell(fauxShell(t, "exit 1"), 60_000, { PATH: "/usr/bin:/bin" }), undefined);
  assert.equal(lireCheminDuShell("/nulle/part/zsh", 60_000, { PATH: "/usr/bin:/bin" }), undefined);
  assert.equal(lireCheminDuShell(fauxShell(t, "echo rien d'utile"), 60_000, { PATH: "/usr/bin:/bin" }), undefined);
  // Le shell qui ne rend pas la main est arrêté : `exec`, pour que ce soit lui qui reçoive le signal.
  assert.equal(lireCheminDuShell(fauxShell(t, "exec sleep 600"), 500, { PATH: "/usr/bin:/bin" }), undefined);
});

test("le fichier des projets et le répertoire de la station ne dépendent pas de la façon dont l'app est lancée", () => {
  // Installée ou non, l'app lit `~/.config/brigade/` tel quel (config.ts) : rien ici n'en décide.
  assert.equal(cheminConfiguration({}, "/Users/chef"), "/Users/chef/.config/brigade/app.json");
  const source = readFileSync(join(SRC, "emplacements.ts"), "utf8").split("\n").filter((ligne) => !ligne.trimStart().startsWith("//")).join("\n");
  assert.doesNotMatch(source, /\.config|cheminConfiguration|BRIGADE_STATION_DIR|homedir/);
});
