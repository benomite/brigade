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
import { preparer } from "../src/lancement.ts";
import { direAuLancement, rattraper, relanceDe, tenirPassage } from "../src/rattrapage.ts";
import { lireRetard, type Reglages } from "../src/retard.ts";

const git = (dossier: string, ...args: string[]) => execFileSync("git", ["-C", dossier, "-c", "user.name=essai", "-c", "user.email=essai@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function livrer(depot: string, combien: number): void {
  for (let rang = 0; rang < combien; rang++) git(depot, "commit", "-q", "--allow-empty", "-m", `livraison ${rang} de ${depot}`);
}

// Une origine sur `v2`, avec un dossier `app/` comme celui de ce dépôt, et de quoi la cloner.
function essai(t: TestContext) {
  // Le vrai chemin : c'est celui que `git` rend, et `/tmp` est un lien sur un Mac.
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-rattrapage-")));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const origine = join(racine, "origine");
  mkdirSync(join(origine, "app"), { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "v2", origine]);
  writeFileSync(join(origine, "app/package.json"), "{}\n");
  writeFileSync(join(origine, "app/package-lock.json"), "{}\n");
  git(origine, "add", ".");
  git(origine, "commit", "-q", "-m", "le premier");
  const reglages: Reglages = { git: "git", delaiMs: 60_000 };
  const cloner = (nom: string) => {
    const clone = join(racine, nom);
    execFileSync("git", ["clone", "-q", origine, clone]);
    return clone;
  };
  return { racine, origine, reglages, cloner };
}

describe("le clone de l'app avance jusqu'à la nouvelle version", () => {
  test("en retard : il avance jusqu'à la branche qu'il suit, depuis le dossier de l'app — et le lancement le dit", async (t) => {
    const { origine, reglages, cloner } = essai(t);
    const clone = cloner("clone");
    const avant = git(clone, "rev-parse", "HEAD");
    livrer(origine, 5);
    const nouvelle = git(origine, "rev-parse", "HEAD");

    const rattrape = await rattraper(reglages, join(clone, "app"));

    assert.deepEqual(rattrape, { racine: clone, suivie: "origin/v2", avant, apres: nouvelle, commits: 5 });
    assert.equal(git(clone, "rev-parse", "HEAD"), nouvelle);
    assert.equal(git(clone, "symbolic-ref", "--short", "HEAD"), "v2");
    const relu = await lireRetard(reglages, clone);
    assert.ok("retard" in relu && relu.retard === 0);
    assert.equal(direAuLancement(rattrape), `brigade: the app is updated — 5 commits from origin/v2 (${avant.slice(0, 7)} → ${nouvelle.slice(0, 7)}), in ${clone}. It opens on the new version.`);
  });

  test("déjà à jour : rien ne bouge, et le lancement n'en dit rien", async (t) => {
    const { reglages, cloner } = essai(t);
    const clone = cloner("clone");
    const avant = git(clone, "rev-parse", "HEAD");

    const rattrape = await rattraper(reglages, clone);

    assert.deepEqual(rattrape, { racine: clone, suivie: "origin/v2", avant, apres: avant, commits: 0 });
    assert.equal(direAuLancement(rattrape), undefined);
  });

  test("des commits à lui, sans retard : rien de nouveau à prendre — il ne bouge pas, et ce n'est pas un échec", async (t) => {
    const { reglages, cloner } = essai(t);
    const clone = cloner("clone");
    livrer(clone, 2);
    const avant = git(clone, "rev-parse", "HEAD");

    const rattrape = await rattraper(reglages, clone);

    assert.deepEqual(rattrape, { racine: clone, suivie: "origin/v2", avant, apres: avant, commits: 0 });
    assert.equal(git(clone, "rev-parse", "HEAD"), avant);
  });

  test("des commits à lui et du retard : il ne fusionne rien — il ne bouge pas, et dit que fusionner est au chef", async (t) => {
    const { origine, reglages, cloner } = essai(t);
    const clone = cloner("clone");
    livrer(clone, 2);
    livrer(origine, 3);
    const avant = git(clone, "rev-parse", "HEAD");

    const rattrape = await rattraper(reglages, clone);

    assert.ok("raison" in rattrape);
    assert.equal(rattrape.raison, `the clone ${clone} has 2 commits that origin/v2 does not have: it cannot simply move forward, and merging is your call`);
    assert.equal(git(clone, "rev-parse", "HEAD"), avant);
    assert.match(direAuLancement(rattrape) ?? "", /^brigade: the app was not updated — .* It opens on the code it has\.$/);
  });

  test("un changement local que la nouvelle version écraserait : rien n'est écrasé, le clone ne bouge pas", async (t) => {
    const { origine, reglages, cloner } = essai(t);
    const clone = cloner("clone");
    writeFileSync(join(origine, "app/package.json"), '{ "version": "2" }\n');
    git(origine, "commit", "-q", "-am", "la nouvelle");
    writeFileSync(join(clone, "app/package.json"), '{ "a moi": true }\n');
    const avant = git(clone, "rev-parse", "HEAD");

    const rattrape = await rattraper(reglages, clone);

    assert.ok("raison" in rattrape);
    assert.match(rattrape.raison, /could not move forward to [0-9a-f]{7} \(`git merge --ff-only`\)/);
    assert.equal(git(clone, "rev-parse", "HEAD"), avant);
    assert.equal(readFileSync(join(clone, "app/package.json"), "utf8"), '{ "a moi": true }\n');
  });

  test("une origine qui ne répond pas, une branche qui ne suit rien, un dossier hors d'un clone : il ne bouge pas, et la raison est dite", async (t) => {
    const { racine, reglages, cloner } = essai(t);
    const muette = cloner("muette");
    git(muette, "remote", "set-url", "origin", join(racine, "partie"));
    const seule = cloner("seule");
    git(seule, "checkout", "-q", "-b", "a-moi");
    const nu = join(racine, "nu");
    mkdirSync(nu);

    const raisons = await Promise.all([muette, seule, nu].map(async (dossier) => {
      const rattrape = await rattraper(reglages, dossier);
      assert.ok("raison" in rattrape, dossier);
      return rattrape.raison;
    }));

    assert.match(raisons[0] ?? "", /^the origin did not answer/);
    assert.match(raisons[1] ?? "", /the branch “a-moi” follows no branch of an origin/);
    assert.match(raisons[2] ?? "", /is not in a git clone/);
  });
});

describe("à l'ouverture, `npm start` passe d'abord à la nouvelle version", () => {
  test("une nouvelle version qui change le verrou des dépendances : elles sont reposées au même lancement", async (t) => {
    const { origine, reglages, cloner } = essai(t);
    const clone = cloner("clone");
    const app = join(clone, "app");
    // Les dépendances posées pour la version d'avant.
    mkdirSync(join(app, "node_modules/electron"), { recursive: true });
    writeFileSync(join(app, "node_modules/.package-lock.json"), "{}");
    writeFileSync(join(app, "node_modules/electron/path.txt"), "electron");
    const posees = new Date(Date.now() - 3_600_000);
    utimesSync(join(app, "node_modules/.package-lock.json"), posees, posees);
    utimesSync(join(app, "package-lock.json"), posees, posees);
    writeFileSync(join(origine, "app/package-lock.json"), '{ "lockfileVersion": 3 }\n');
    git(origine, "commit", "-q", "-am", "une dépendance de plus");

    assert.ok(!("raison" in (await rattraper(reglages, app))));
    const lancees: string[] = [];
    const code = preparer({ app, node: "node", executer: (commande, args) => (lancees.push([commande, ...args].join(" ")), 0), dire: () => {} });

    assert.equal(code, 0);
    assert.deepEqual(lancees, ["npm ci --ignore-scripts", "node node_modules/electron/install.js"]);
  });

  test("le lancement met à jour avant de poser quoi que ce soit, et ne s'arrête pas sur une mise à jour ratée", () => {
    const source = readFileSync(join(import.meta.dirname, "../src/lancement.ts"), "utf8");
    const principal = source.slice(source.indexOf("if (import.meta.main)"));
    assert.ok(principal.indexOf("rattraper(") > 0 && principal.indexOf("rattraper(") < principal.indexOf("preparer("), "le lancement ne met plus à jour avant de poser les dépendances");
    // Ce qui rend le code de sortie, c'est la pose : la mise à jour ne fait que dire.
    assert.match(principal, /process\.exitCode = preparer\(/);
  });

  test("joué par Node seul, avant toute dépendance : de lancement.ts, rien ne s'importe hors de Node", () => {
    const vus = new Set<string>();
    const lire = (fichier: string): void => {
      if (vus.has(fichier)) return;
      vus.add(fichier);
      for (const [, quoi = "", d = ""] of readFileSync(fichier, "utf8").matchAll(/^import (type )?[^;]*? from "([^"]+)";$/gm)) {
        if (quoi !== "") continue;
        if (d.startsWith("./")) lire(resolve(dirname(fichier), d));
        else assert.ok(d.startsWith("node:"), `${fichier} importe ${d}`);
      }
    };
    lire(join(import.meta.dirname, "../src/lancement.ts"));
    assert.ok(vus.has(join(import.meta.dirname, "../src/rattrapage.ts")));
  });
});

describe("au clic, l'app se met à jour et repart sur la nouvelle version", () => {
  test("lancée par `npm start`, elle repart par `npm start` : son lancement pose ce que la nouvelle version demande", () => {
    assert.deepEqual(relanceDe({ npm_execpath: "/opt/npm/bin/npm-cli.js", npm_node_execpath: "/opt/node/bin/node" }, "/chef/brigade/app"), { execPath: "/opt/node/bin/node", args: ["/opt/npm/bin/npm-cli.js", "--prefix", "/chef/brigade/app", "start"] });
    // Lancée autrement : elle repart telle qu'elle a été lancée.
    assert.equal(relanceDe({}, "/chef/brigade/app"), undefined);
    assert.equal(relanceDe({ npm_execpath: "", npm_node_execpath: "/opt/node/bin/node" }, "/chef/brigade/app"), undefined);
  });

  test("en retard : le clone avance, puis elle se relance — une fois, même cliquée deux fois", async (t) => {
    const { origine, reglages, cloner } = essai(t);
    const clone = cloner("clone");
    livrer(origine, 2);
    let relances = 0;
    const passer = tenirPassage({ reglages, app: join(clone, "app"), relancer: () => void relances++ });

    const rendus = await Promise.all([passer(), passer()]);

    assert.deepEqual(rendus, [undefined, undefined]);
    assert.equal(relances, 1);
    assert.equal(git(clone, "rev-parse", "HEAD"), git(origine, "rev-parse", "HEAD"));
  });

  test("ce qui l'empêche d'avancer est dit, et elle ne se relance pas : elle tourne sur son code", async (t) => {
    const { origine, reglages, cloner } = essai(t);
    const clone = cloner("clone");
    livrer(clone, 1);
    livrer(origine, 1);
    let relances = 0;
    const passer = tenirPassage({ reglages, app: clone, relancer: () => void relances++ });

    const rendu = await passer();

    assert.ok(rendu !== undefined);
    assert.match(rendu.refus, /^this app was not updated: the clone .* has 1 commit that origin\/v2 does not have: .*\. It keeps running on the code it has\.$/);
    assert.equal(relances, 0);
  });

  test("son clone a déjà avancé depuis son lancement : elle repart sur lui, même si l'origine ne répond pas", async (t) => {
    const { racine, reglages, cloner } = essai(t);
    const clone = cloner("clone");
    git(clone, "remote", "set-url", "origin", join(racine, "partie"));
    let relances = 0;
    const passer = tenirPassage({ reglages, app: clone, relancer: () => void relances++ });

    assert.match((await passer())?.refus ?? "", /the origin did not answer/);
    assert.equal(relances, 0);
    assert.equal(await passer(true), undefined);
    assert.equal(relances, 1);
  });
});
