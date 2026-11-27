// L'app passe à la nouvelle version d'elle-même : à son ouverture, et au clic sur la ligne qui
// dit son retard. Son clone avance jusqu'à la branche de l'origine qu'il suit — en avance rapide
// seulement —, ou il ne bouge pas et elle dit pourquoi. Contre le vrai `git`, sur des dépôts
// d'essai dont l'origine est un dossier voisin : ni réseau, ni GitHub, ni Electron.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { prepare } from "../src/launch.ts";
import { tellAtLaunch, catchUp, relaunchOf, holdPassage } from "../src/catch-up.ts";
import { readDelay, type Settings } from "../src/delay.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

const git = (folder: string, ...args: string[]) => execFileSync("git", ["-C", folder, "-c", "user.name=essai", "-c", "user.email=essai@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function deliver(repository: string, howMany: number): void {
  for (let rank = 0; rank < howMany; rank++) git(repository, "commit", "-q", "--allow-empty", "-m", `livraison ${rank} de ${repository}`);
}

// Une origine sur `v2`, avec un dossier `app/` comme celui de ce dépôt, et de quoi la cloner.
function trial(t: TestContext) {
  // Le vrai chemin : c'est celui que `git` rend, et `/tmp` est un lien sur un Mac.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-rattrapage-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, "origine");
  mkdirSync(join(origin, "app"), { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "v2", origin]);
  writeFileSync(join(origin, "app/package.json"), "{}\n");
  writeFileSync(join(origin, "app/package-lock.json"), "{}\n");
  git(origin, "add", ".");
  git(origin, "commit", "-q", "-m", "le premier");
  const settings: Settings = { git: "git", delaiMs: 60_000 };
  const cloneRepo = (name: string) => {
    const clone = join(root, name);
    execFileSync("git", ["clone", "-q", origin, clone]);
    return clone;
  };
  return { racine: root, origine: origin, reglages: settings, cloner: cloneRepo };
}

describe("le clone de l'app avance jusqu'à la nouvelle version", () => {
  test("en retard : il avance jusqu'à la branche qu'il suit, depuis le dossier de l'app — et le lancement le dit", { skip: WITHOUT_POSIX }, async (t) => {
    const { origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    const before = git(clone, "rev-parse", "HEAD");
    deliver(origin, 5);
    const newEntry = git(origin, "rev-parse", "HEAD");

    const catchesUp = await catchUp(settings, join(clone, "app"));

    assert.deepEqual(catchesUp, { racine: clone, suivie: "origin/v2", avant: before, apres: newEntry, commits: 5 });
    assert.equal(git(clone, "rev-parse", "HEAD"), newEntry);
    assert.equal(git(clone, "symbolic-ref", "--short", "HEAD"), "v2");
    const reread = await readDelay(settings, clone);
    assert.ok("retard" in reread && reread.retard === 0);
    assert.equal(tellAtLaunch(catchesUp), `brigade: the app is updated — 5 commits from origin/v2 (${before.slice(0, 7)} → ${newEntry.slice(0, 7)}), in ${clone}. It opens on the new version.`);
  });

  test("déjà à jour : rien ne bouge, et le lancement n'en dit rien", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    const before = git(clone, "rev-parse", "HEAD");

    const catchesUp = await catchUp(settings, clone);

    assert.deepEqual(catchesUp, { racine: clone, suivie: "origin/v2", avant: before, apres: before, commits: 0 });
    assert.equal(tellAtLaunch(catchesUp), undefined);
  });

  test("des commits à lui, sans retard : rien de nouveau à prendre — il ne bouge pas, et ce n'est pas un échec", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    deliver(clone, 2);
    const before = git(clone, "rev-parse", "HEAD");

    const catchesUp = await catchUp(settings, clone);

    assert.deepEqual(catchesUp, { racine: clone, suivie: "origin/v2", avant: before, apres: before, commits: 0 });
    assert.equal(git(clone, "rev-parse", "HEAD"), before);
  });

  test("des commits à lui et du retard : il ne fusionne rien — il ne bouge pas, et dit que fusionner est au chef", { skip: WITHOUT_POSIX }, async (t) => {
    const { origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    deliver(clone, 2);
    deliver(origin, 3);
    const before = git(clone, "rev-parse", "HEAD");

    const catchesUp = await catchUp(settings, clone);

    assert.ok("raison" in catchesUp);
    assert.equal(catchesUp.raison, `the clone ${clone} has 2 commits that origin/v2 does not have: it cannot simply move forward, and merging is your call`);
    assert.equal(git(clone, "rev-parse", "HEAD"), before);
    assert.match(tellAtLaunch(catchesUp) ?? "", /^brigade: the app was not updated — .* It opens on the code it has\.$/);
  });

  test("un changement local que la nouvelle version écraserait : rien n'est écrasé, le clone ne bouge pas", async (t) => {
    const { origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    writeFileSync(join(origin, "app/package.json"), '{ "version": "2" }\n');
    git(origin, "commit", "-q", "-am", "la nouvelle");
    writeFileSync(join(clone, "app/package.json"), '{ "a moi": true }\n');
    const before = git(clone, "rev-parse", "HEAD");

    const catchesUp = await catchUp(settings, clone);

    assert.ok("raison" in catchesUp);
    assert.match(catchesUp.raison, /could not move forward to [0-9a-f]{7} \(`git merge --ff-only`\)/);
    assert.equal(git(clone, "rev-parse", "HEAD"), before);
    assert.equal(readFileSync(join(clone, "app/package.json"), "utf8"), '{ "a moi": true }\n');
  });

  test("une origine qui ne répond pas, une branche qui ne suit rien, un dossier hors d'un clone : il ne bouge pas, et la raison est dite", async (t) => {
    const { racine: root, reglages: settings, cloner: cloneRepo } = trial(t);
    const silentOne = cloneRepo("muette");
    git(silentOne, "remote", "set-url", "origin", join(root, "partie"));
    const only = cloneRepo("seule");
    git(only, "checkout", "-q", "-b", "a-moi");
    const bare = join(root, "nu");
    mkdirSync(bare);

    const reasons = await Promise.all([silentOne, only, bare].map(async (folder) => {
      const catchesUp = await catchUp(settings, folder);
      assert.ok("raison" in catchesUp, folder);
      return catchesUp.raison;
    }));

    assert.match(reasons[0] ?? "", /^the origin did not answer/);
    assert.match(reasons[1] ?? "", /the branch “a-moi” follows no branch of an origin/);
    assert.match(reasons[2] ?? "", /is not in a git clone/);
  });
});

describe("à l'ouverture, `npm start` passe d'abord à la nouvelle version", () => {
  test("une nouvelle version qui change le verrou des dépendances : elles sont reposées au même lancement", async (t) => {
    const { origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    const app = join(clone, "app");
    // Les dépendances posées pour la version d'avant.
    mkdirSync(join(app, "node_modules/electron"), { recursive: true });
    writeFileSync(join(app, "node_modules/.package-lock.json"), "{}");
    writeFileSync(join(app, "node_modules/electron/path.txt"), "electron");
    const setEntries = new Date(Date.now() - 3_600_000);
    utimesSync(join(app, "node_modules/.package-lock.json"), setEntries, setEntries);
    utimesSync(join(app, "package-lock.json"), setEntries, setEntries);
    writeFileSync(join(origin, "app/package-lock.json"), '{ "lockfileVersion": 3 }\n');
    git(origin, "commit", "-q", "-am", "une dépendance de plus");

    assert.ok(!("raison" in (await catchUp(settings, app))));
    const launched: string[] = [];
    const code = prepare({ app, node: "node", executer: (command, args) => (launched.push([command, ...args].join(" ")), 0), dire: () => {} });

    assert.equal(code, 0);
    assert.deepEqual(launched, ["npm ci --ignore-scripts", "node node_modules/electron/install.js"]);
  });

  test("le lancement met à jour avant de poser quoi que ce soit, et ne s'arrête pas sur une mise à jour ratée", () => {
    const source = readFileSync(join(import.meta.dirname, "../src/launch.ts"), "utf8");
    const principal = source.slice(source.indexOf("if (import.meta.main)"));
    assert.ok(principal.indexOf("catchUp(") > 0 && principal.indexOf("catchUp(") < principal.indexOf("prepare("), "le lancement ne met plus à jour avant de poser les dépendances");
    // Ce qui rend le code de sortie, c'est la pose : la mise à jour ne fait que dire.
    assert.match(principal, /process\.exitCode = prepare\(/);
  });

  test("joué par Node seul, avant toute dépendance : de launch.ts, rien ne s'importe hors de Node", () => {
    const seenOnes = new Set<string>();
    const read = (file: string): void => {
      if (seenOnes.has(file)) return;
      seenOnes.add(file);
      for (const [, what = "", d = ""] of readFileSync(file, "utf8").matchAll(/^import (type )?[^;]*? from "([^"]+)";$/gm)) {
        if (what !== "") continue;
        if (d.startsWith("./")) read(resolve(dirname(file), d));
        else assert.ok(d.startsWith("node:"), `${file} importe ${d}`);
      }
    };
    read(join(import.meta.dirname, "../src/launch.ts"));
    assert.ok(seenOnes.has(join(import.meta.dirname, "../src/catch-up.ts")));
  });
});

describe("au clic, l'app se met à jour et repart sur la nouvelle version", () => {
  test("lancée par `npm start`, elle repart par `npm start` : son lancement pose ce que la nouvelle version demande", () => {
    assert.deepEqual(relaunchOf({ npm_execpath: "/opt/npm/bin/npm-cli.js", npm_node_execpath: "/opt/node/bin/node" }, "/chef/brigade/app"), { execPath: "/opt/node/bin/node", args: ["/opt/npm/bin/npm-cli.js", "--prefix", "/chef/brigade/app", "start"] });
    // Lancée autrement : elle repart telle qu'elle a été lancée.
    assert.equal(relaunchOf({}, "/chef/brigade/app"), undefined);
    assert.equal(relaunchOf({ npm_execpath: "", npm_node_execpath: "/opt/node/bin/node" }, "/chef/brigade/app"), undefined);
  });

  test("en retard : le clone avance, puis elle se relance — une fois, même cliquée deux fois", async (t) => {
    const { origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    deliver(origin, 2);
    let relaunches = 0;
    const pass = holdPassage({ reglages: settings, app: join(clone, "app"), relancer: () => void relaunches++ });

    const renderedOnes = await Promise.all([pass(), pass()]);

    assert.deepEqual(renderedOnes, [undefined, undefined]);
    assert.equal(relaunches, 1);
    assert.equal(git(clone, "rev-parse", "HEAD"), git(origin, "rev-parse", "HEAD"));
  });

  test("ce qui l'empêche d'avancer est dit, et elle ne se relance pas : elle tourne sur son code", async (t) => {
    const { origine: origin, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    deliver(clone, 1);
    deliver(origin, 1);
    let relaunches = 0;
    const pass = holdPassage({ reglages: settings, app: clone, relancer: () => void relaunches++ });

    const rendered = await pass();

    assert.ok(rendered !== undefined);
    assert.match(rendered.refus, /^this app was not updated: the clone .* has 1 commit that origin\/v2 does not have: .*\. It keeps running on the code it has\.$/);
    assert.equal(relaunches, 0);
  });

  test("son clone a déjà avancé depuis son lancement : elle repart sur lui, même si l'origine ne répond pas", async (t) => {
    const { racine: root, reglages: settings, cloner: cloneRepo } = trial(t);
    const clone = cloneRepo("clone");
    git(clone, "remote", "set-url", "origin", join(root, "partie"));
    let relaunches = 0;
    const pass = holdPassage({ reglages: settings, app: clone, relancer: () => void relaunches++ });

    assert.match((await pass())?.refus ?? "", /the origin did not answer/);
    assert.equal(relaunches, 0);
    assert.equal(await pass(true), undefined);
    assert.equal(relaunches, 1);
  });
});
