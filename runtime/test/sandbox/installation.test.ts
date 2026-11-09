// L'installation des dépendances dans le bac à sable d'un cook du Mac : les
// règles lui ouvrent `node_modules` et les caches des paquets, et rien d'autre ;
// un setup qui lance `pnpm install` va au bout, et le cook le rejoue.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { after, test } from "node:test";
import { configurer } from "../../src/bac-a-sable/configuration.ts";
import { jouerSetup } from "../../src/gates.ts";
import { CACHES_DES_PAQUETS, droitsDInstallation } from "../../src/sandbox/installation.ts";

const HOME = "/Users/chef";
const WORKTREE = "/Users/chef/brigade-wt/3054-installation";
const config = () => configurer({ worktree: WORKTREE, caches: [], hotes: [], home: HOME }).reglages;

test("le cook du Mac écrit et retire node_modules de son worktree et les caches des paquets — et nulle part ailleurs", () => {
  const { sandbox, permissions } = config();
  const { allowWrite, denyWrite } = sandbox.filesystem;
  const ouvert = (lieu: string) => allowWrite.some((racine) => lieu === racine || lieu.startsWith(`${racine}/`));
  for (const lieu of [`${WORKTREE}/node_modules`, `${WORKTREE}/node_modules/.pnpm/lock.yaml`, `${HOME}/Library/pnpm/store/v10`, `${HOME}/Library/Caches/pnpm/metadata`, `${HOME}/.npm/_cacache`, `${HOME}/.local/share/pnpm`]) {
    assert.equal(ouvert(lieu), true, lieu);
  }
  for (const relatif of CACHES_DES_PAQUETS) assert.ok(allowWrite.includes(`${HOME}/${relatif}`), relatif);
    assert.ok(permissions.allow.includes(`Edit(/${WORKTREE}/**)`));
  // Hors du worktree et de ces caches, rien ne s'écrit.
  for (const lieu of [`${HOME}/Documents`, `${HOME}/.zshrc`, `${HOME}/.ssh/id_ed25519`, `${HOME}/Library/Keychains`, `${HOME}/.cache/autre`, `${HOME}/brigade-wt/3055-autre/node_modules`, "/etc/hosts", HOME]) {
    assert.equal(ouvert(lieu), false, lieu);
  }
  assert.ok(denyWrite.includes(`${HOME}/.ssh`));
  assert.deepEqual(droitsDInstallation(HOME).filter((lieu) => !lieu.startsWith(`${HOME}/`)), []);
});

// Un projet dont le setup lance `pnpm install` : ses dépendances sont des
// dossiers locaux, le lockfile s'écrit sans réseau. Le magasin et les caches
// sont ceux d'un compte d'essai.
function projetPnpm() {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-installation-")));
  const worktree = join(racine, "wt");
  mkdirSync(join(worktree, ".claude", "brigade"), { recursive: true });
  mkdirSync(join(worktree, "vendor", "a"), { recursive: true });
  mkdirSync(join(worktree, "vendor", "b"), { recursive: true });
  writeFileSync(join(worktree, "vendor", "a", "package.json"), JSON.stringify({ name: "dep-a", version: "1.0.0", dependencies: { "dep-b": "file:../b" } }));
  writeFileSync(join(worktree, "vendor", "b", "package.json"), JSON.stringify({ name: "dep-b", version: "1.0.0" }));
  writeFileSync(join(worktree, "package.json"), JSON.stringify({ name: "projet", version: "1.0.0", private: true, dependencies: { "dep-a": "file:vendor/a" } }));
  writeFileSync(join(worktree, ".claude", "brigade", "worktree-setup.sh"), '#!/usr/bin/env bash\nset -e\ncd "$2"\npnpm install --frozen-lockfile >&2\n', { mode: 0o755 });
  const home = join(racine, "home");
  mkdirSync(home);
  const env = { PATH: process.env.PATH, HOME: home, npm_config_manage_package_manager_versions: "false", CI: "true" };
  execFileSync("pnpm", ["install", "--lockfile-only", "--offline"], { cwd: worktree, env, stdio: "pipe" });
  return { racine, worktree, env };
}

// Tout ce que pnpm a écrit sous le compte d'essai ou le worktree, hors le
// worktree lui-même : chaque fichier doit tomber sous une racine ouverte en
// écriture par les règles que `configurer` construit pour ce cook. Le bac à
// sable (seatbelt) n'existe pas ici : on vérifie donc la couverture, qui échoue
// dès que `droitsDInstallation` ne couvre plus ce que pnpm écrit.
function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}
function nonCouverts(racine: string, worktree: string, home: string): string[] {
  const { allowWrite } = configurer({ worktree, caches: [], hotes: [], home }).reglages.sandbox.filesystem;
  const ouvert = (lieu: string) => allowWrite.some((ouverte) => lieu === ouverte || lieu.startsWith(`${ouverte}${sep}`));
  return [...fichiers(home), ...fichiers(worktree)].filter((lieu) => !ouvert(lieu));
}

const projets = [projetPnpm(), projetPnpm()];
// Le second est déjà installé : le cook n'a plus qu'à rejouer.
execFileSync("pnpm", ["install", "--frozen-lockfile"], { cwd: projets[1]!.worktree, env: projets[1]!.env, stdio: "pipe" });
after(() => projets.forEach(({ racine }) => rmSync(racine, { recursive: true, force: true })));

test("un setup qui lance `pnpm install` va au bout : node_modules porte chaque dépendance du lockfile", async () => {
  const { worktree, env } = projets[0]!;
  const setup = await jouerSetup({ worktree, ticket: 3054, env, delaiMs: 60_000 });
  assert.equal(setup.pret, true, "sortie" in setup ? setup.sortie : "");
  const lock = readFileSync(join(worktree, "pnpm-lock.yaml"), "utf8");
  for (const nom of ["dep-a", "dep-b"]) assert.match(lock, new RegExp(`\\b${nom}\\b`));
  assert.ok(existsSync(join(worktree, "node_modules", "dep-a", "package.json")));
  // dep-b est une dépendance de dep-a : pnpm la range sous .pnpm.
  assert.ok(readdirSync(join(worktree, "node_modules", ".pnpm")).some((nom) => nom.startsWith("dep-b@")));
  assert.deepEqual(nonCouverts(projets[0]!.racine, worktree, join(projets[0]!.racine, "home")), []);
});

test("le cook rejoue `pnpm install --frozen-lockfile` sur un node_modules déjà installé, sans « Operation not permitted »", () => {
  const { worktree, env } = projets[1]!;
  const rejeu = execFileSync("pnpm", ["install", "--frozen-lockfile"], { cwd: worktree, env, encoding: "utf8", stdio: "pipe" });
  assert.doesNotMatch(rejeu, /Operation not permitted|ERR_PNPM/);
  assert.deepEqual(nonCouverts(projets[1]!.racine, worktree, join(projets[1]!.racine, "home")), []);
  assert.ok(existsSync(join(worktree, "node_modules", "dep-a", "package.json")));
});
