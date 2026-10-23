// La sélection des gates (`.claude/brigade/tests-touches.mjs`), jouée sur un
// dépôt d'essai (#1611) : un package.json dont seuls les scripts changent ne
// rejoue pas les deux suites entières, il touche les tests qui lisent ses
// scripts ; le nom d'un import n'est pas un nom cité ; `.claude/brigade`, que les
// tests créent dans leurs faux worktrees, n'est pas un dossier qu'ils lisent.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ENV_ENFANT, repertoireTemporaire } from "./outils.ts";

const SELECTION = join(import.meta.dirname, "../../.claude/brigade/tests-touches.mjs");
const PAQUET = { name: "essai", type: "module", scripts: { test: "node --test", status: "node src/status.ts" }, devDependencies: { typescript: "6.0.0" } };

function ecrire(racine: string, chemin: string, texte: string): void {
  mkdirSync(dirname(join(racine, chemin)), { recursive: true });
  writeFileSync(join(racine, chemin), texte);
}

// Un dépôt aux deux zones, commité sur la branche `essai` : un test qui lit les
// scripts du runtime, un qui importe du code, un de l'app qui ne fait que nommer
// un package.json. Le CLAUDE.md, s'il est écrit, nomme `essai` pour base.
function depot(t: TestContext, { claude = false } = {}): { racine: string; souche: string } {
  const racine = repertoireTemporaire(t);
  if (claude) ecrire(racine, "CLAUDE.md", "- **Branche d'intégration** : `essai`\n");
  ecrire(racine, "runtime/package.json", JSON.stringify(PAQUET, null, 2));
  ecrire(racine, "runtime/src/a.ts", "export const a = 1;\n");
  ecrire(racine, "runtime/test/lit.test.ts", 'const { scripts } = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8"));\n');
  ecrire(racine, "runtime/test/importe.test.ts", 'import { a } from "../src/a.ts";\n');
  ecrire(racine, "app/package.json", "{}\n");
  ecrire(racine, "app/test/nomme.test.ts", "// cmd.exe joue les scripts de package.json\n");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: racine, env: ENV_ENFANT, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "essai");
  git("add", "-A");
  git("-c", "user.name=essai", "-c", "user.email=essai@example.com", "commit", "-q", "-m", "souche");
  return { racine, souche: git("rev-parse", "HEAD") };
}

function changer(racine: string, change: (paquet: typeof PAQUET & Record<string, unknown>) => void): void {
  const paquet = JSON.parse(readFileSync(join(racine, "runtime/package.json"), "utf8"));
  change(paquet);
  writeFileSync(join(racine, "runtime/package.json"), JSON.stringify(paquet, null, 2));
}

const choisir = (racine: string, modifies: string[], ...args: string[]) =>
  execFileSync("node", [SELECTION, ...args], { cwd: racine, env: ENV_ENFANT, input: modifies.join("\n") + "\n", encoding: "utf8" }).trim().split("\n");

describe("les tests que touche un changement du package.json", () => {
  test("une commande ajoutée touche les tests qui lisent les scripts, et eux seuls", (t) => {
    const { racine, souche } = depot(t);
    changer(racine, (paquet) => (paquet.scripts = { ...paquet.scripts, report: "node src/rapport-cli.ts" } as typeof paquet.scripts));
    assert.deepEqual(choisir(racine, ["runtime/package.json"], "--souche", souche), ["runtime fichiers test/lit.test.ts", "app rien"]);
  });

  test("une commande retirée aussi", (t) => {
    const { racine, souche } = depot(t);
    changer(racine, (paquet) => delete (paquet.scripts as Record<string, string>).status);
    assert.deepEqual(choisir(racine, ["runtime/package.json"], "--souche", souche), ["runtime fichiers test/lit.test.ts", "app rien"]);
  });

  test("le script qui joue la suite changé, tout se joue", (t) => {
    const { racine, souche } = depot(t);
    changer(racine, (paquet) => (paquet.scripts.test = "node --test --test-concurrency=1"));
    assert.deepEqual(choisir(racine, ["runtime/package.json"], "--souche", souche), ["runtime tout", "app tout"]);
  });

  test("une dépendance changée, tout se joue", (t) => {
    const { racine, souche } = depot(t);
    changer(racine, (paquet) => (paquet.devDependencies.typescript = "6.0.1"));
    assert.deepEqual(choisir(racine, ["runtime/package.json"], "--souche", souche), ["runtime tout", "app tout"]);
  });

  test("sans --souche, la souche est celle des gates : l'ancêtre commun avec la branche d'intégration du CLAUDE.md", (t) => {
    const { racine } = depot(t, { claude: true });
    changer(racine, (paquet) => (paquet.scripts = { ...paquet.scripts, report: "node src/rapport-cli.ts" } as typeof paquet.scripts));
    assert.deepEqual(choisir(racine, ["runtime/package.json"]), ["runtime fichiers test/lit.test.ts", "app rien"]);
  });

  test("sans souche pour lire ce qu'il était — ni --souche, ni branche d'intégration —, ou une souche qui ne l'a pas, le doute joue tout", (t) => {
    const { racine } = depot(t);
    changer(racine, (paquet) => (paquet.scripts = { ...paquet.scripts, report: "node src/rapport-cli.ts" } as typeof paquet.scripts));
    assert.deepEqual(choisir(racine, ["runtime/package.json"]), ["runtime tout", "app tout"]);
    assert.deepEqual(choisir(racine, ["runtime/package.json"], "--souche", "0000000000000000000000000000000000000000"), ["runtime tout", "app tout"]);
  });

  test("avec le lockfile à côté, tout se joue", (t) => {
    const { racine, souche } = depot(t);
    changer(racine, (paquet) => (paquet.scripts = { ...paquet.scripts, report: "node src/rapport-cli.ts" } as typeof paquet.scripts));
    assert.deepEqual(choisir(racine, ["runtime/package.json", "runtime/package-lock.json"], "--souche", souche), ["runtime tout", "app tout"]);
  });
});

describe("ce qu'un test cite", () => {
  // Deux zones qui ont chacune leur `cuisine.ts` : le produit de l'app, un helper du runtime.
  function deuxCuisines(t: TestContext): string {
    const racine = repertoireTemporaire(t);
    ecrire(racine, "runtime/package.json", "{}\n");
    ecrire(racine, "app/package.json", "{}\n");
    ecrire(racine, "app/src/cuisine.ts", "export const c = 1;\n");
    ecrire(racine, "app/test/importe.test.ts", 'import { c } from "../src/cuisine.ts";\n');
    ecrire(racine, "app/test/lance.test.ts", 'spawn("node", ["src/cuisine.ts"]);\n');
    ecrire(racine, "runtime/test/aides/cuisine.ts", 'mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });\nexport const gates = 1;\n');
    ecrire(racine, "runtime/test/aides/box.ts", 'readdirSync(join(RACINE, "docs/runtime"));\n');
    ecrire(racine, "runtime/test/cuisine.test.ts", 'import { gates } from "./aides/cuisine.ts";\n');
    ecrire(racine, "runtime/test/box.test.ts", 'import "./aides/box.ts";\n');
    return racine;
  }

  test("le nom d'un import n'est pas cité : il ne tire pas le fichier du même nom de l'autre zone", (t) => {
    const racine = deuxCuisines(t);
    assert.deepEqual(choisir(racine, ["runtime/test/aides/cuisine.ts"]), ["runtime fichiers test/cuisine.test.ts", "app fichiers test/lance.test.ts"]);
  });

  test("un dossier que les tests créent dans leurs faux worktrees, `.claude/brigade`, n'est pas lu : seul un dossier lu, `docs/runtime`, touche qui le cite", (t) => {
    const racine = deuxCuisines(t);
    assert.deepEqual(choisir(racine, [".claude/brigade/tests-touches.mjs"]), ["runtime rien", "app rien"]);
    assert.deepEqual(choisir(racine, ["docs/runtime/pass.md"]), ["runtime fichiers test/box.test.ts", "app rien"]);
  });
});
