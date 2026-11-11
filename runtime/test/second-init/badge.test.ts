// Le badge « Cooked by Brigade » de la mise en place (#3255) : le vrai script de `/brigade:init` de l'app,
// contre une origine nue et un `gh` doublure. Proposé une fois ; sa trace (`.claude/brigade/badge`) empêche
// toute seconde offre, et un badge retiré à la main n'est jamais remis.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { BADGE } from "../../src/second-init/demarrage.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const RACINE = join(import.meta.dirname, "..", "..", "..");
const PLUGIN_DE_L_APP = join(RACINE, "app", "src", "plugin");
const SANS_BASH = process.platform === "win32" && "le script de /brigade:init et son `gh` doublure sont joués par bash";
const README = "# Shop\n\nA small shop.\nno final newline";
const URL_DU_SITE = /<link rel="canonical" href="([^"]+)">/.exec(readFileSync(join(RACINE, "site", "index.html"), "utf8"))?.[1] ?? "";

function unProjet(t: TestContext) {
  const { origine, clone } = depotGit(t);
  const racine = repertoireTemporaire(t);
  mkdirSync(join(racine, "bin"));
  writeFileSync(join(racine, "bin", "gh"), `#!/usr/bin/env bash\ncase "$1 $2" in\n  "pr create") echo "https://github.com/acme/shop/pull/7" ;;\nesac\nexit 0\n`, { mode: 0o755 });
  mkdirSync(join(racine, "scripts"));
  const script = join(racine, "scripts", "init.sh");
  copyFileSync(join(PLUGIN_DE_L_APP, "init.sh"), script);
  copyFileSync(join(PLUGIN_DE_L_APP, "labels.tsv"), join(racine, "scripts", "labels.tsv"));
  chmodSync(script, 0o755);
  const env = { ...ENV_GIT, PATH: `${join(racine, "bin")}:${process.env.PATH}`, TMPDIR: racine };
  writeFileSync(join(clone, "README.md"), README);
  git(clone, "add", "README.md");
  git(clone, "commit", "-q", "-m", "readme");
  git(clone, "push", "-q", "origin", BASE);
  const setup = (...args: string[]) => execFileSync("bash", [script, "--test", "npm test", "--base", BASE, ...args], { cwd: clone, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n").at(-1);
  const surLaBranche = (fichier: string) => git(clone, "--git-dir", origine, "show", `brigade/init:${fichier}`);
  // La PR mergée : la branche de setup devient la branche d'intégration.
  const merger = () => git(clone, "--git-dir", origine, "update-ref", `refs/heads/${BASE}`, "brigade/init");
  const retirerDuReadme = () => {
    git(clone, "fetch", "-q", "origin");
    git(clone, "reset", "-q", "--hard", `origin/${BASE}`);
    const lu = readFileSync(join(clone, "README.md"), "utf8");
    writeFileSync(join(clone, "README.md"), lu.slice(lu.indexOf("\n\n") + 2));
    git(clone, "commit", "-q", "-am", "remove the badge");
    git(clone, "push", "-q", "origin", BASE);
  };
  return { setup, surLaBranche, merger, retirerDuReadme, origine, clone };
}

test("answering no leaves the README byte for byte unchanged and records the offer", { skip: SANS_BASH }, (t) => {
  const { setup, surLaBranche } = unProjet(t);
  assert.match(setup("--badge", "no") ?? "", /^pr /);
  assert.equal(surLaBranche("README.md"), README);
  assert.match(surLaBranche(".claude/brigade/badge"), /offered: no/);
});

test("answering yes puts one badge first in the README, a picture with a light and a dark source, linked to the site", { skip: SANS_BASH }, (t) => {
  const { setup, surLaBranche } = unProjet(t);
  setup("--badge", "yes");
  const readme = surLaBranche("README.md");
  const [premier, ...reste] = readme.split("\n\n");
  assert.equal(reste.join("\n\n"), README);
  assert.equal(readme.match(/<picture>/g)?.length, 1);
  assert.match(premier ?? "", /^<a href="[^"]+"><picture><source media="\(prefers-color-scheme: dark\)" srcset="[^"]+"><source media="\(prefers-color-scheme: light\)" srcset="[^"]+"><img alt="Cooked by Brigade" src="[^"]+" height="28"><\/picture><\/a>$/);
  // The link is the canonical URL of the site; the two images are files of the site, served from it.
  assert.match(URL_DU_SITE, /^https:\/\//);
  assert.ok(readme.includes(`<a href="${URL_DU_SITE}">`));
  const images = [...readme.matchAll(/(?:srcset|src)="([^"]+)"/g)].map((m) => m[1] ?? "");
  assert.equal(images.length, 3);
  for (const image of images) {
    assert.ok(image.startsWith(URL_DU_SITE), image);
    assert.ok(existsSync(join(RACINE, "site", image.slice(URL_DU_SITE.length))), image);
  }
  assert.match(surLaBranche(".claude/brigade/badge"), /offered: yes/);
});

test("rerun after a no: the badge is neither offered nor inserted", { skip: SANS_BASH }, (t) => {
  const { setup, surLaBranche, merger } = unProjet(t);
  setup("--badge", "no");
  merger();
  assert.equal(setup("--badge", "yes"), "unchanged");
  assert.equal(surLaBranche("README.md"), README);
});

test("rerun after the badge was deleted by hand: it is not put back", { skip: SANS_BASH }, (t) => {
  const { setup, merger, retirerDuReadme, origine, clone } = unProjet(t);
  setup("--badge", "yes");
  merger();
  retirerDuReadme();
  assert.equal(setup("--badge", "yes"), "unchanged");
  // Nothing was opened: the integration branch's README, badge-less, is the one that stays.
  assert.equal(git(clone, "--git-dir", origine, "show", `${BASE}:README.md`), README);
});

test("without --badge, setup neither touches the README nor records an offer", { skip: SANS_BASH }, (t) => {
  const { setup, surLaBranche } = unProjet(t);
  setup();
  assert.equal(surLaBranche("README.md"), README);
  assert.throws(() => surLaBranche(".claude/brigade/badge"));
});

test("the second's opening message has the chef asked about the badge, never again once it was offered", () => {
  assert.match(BADGE, /Cooked by Brigade/);
  assert.match(BADGE, /`\.claude\/brigade\/badge` already exists/);
  assert.match(BADGE, /--badge yes/);
});
