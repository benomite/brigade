// La sélection des gates (`.claude/brigade/tests-touches.mjs`), jouée sur un
// dépôt d'essai : un package.json dont seuls les scripts changent ne rejoue pas
// les deux suites entières (#1611), il touche les tests qui lisent ses scripts.
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

// Un dépôt aux deux zones, commité : un test qui lit les scripts du runtime, un
// qui importe du code, un de l'app qui ne fait que nommer un package.json.
function depot(t: TestContext): { racine: string; souche: string } {
  const racine = repertoireTemporaire(t);
  ecrire(racine, "runtime/package.json", JSON.stringify(PAQUET, null, 2));
  ecrire(racine, "runtime/src/a.ts", "export const a = 1;\n");
  ecrire(racine, "runtime/test/lit.test.ts", 'const { scripts } = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8"));\n');
  ecrire(racine, "runtime/test/importe.test.ts", 'import { a } from "../src/a.ts";\n');
  ecrire(racine, "app/package.json", "{}\n");
  ecrire(racine, "app/test/nomme.test.ts", "// cmd.exe joue les scripts de package.json\n");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: racine, env: ENV_ENFANT, encoding: "utf8" }).trim();
  git("init", "-q");
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

  test("sans souche pour lire ce qu'il était, ou une souche qui ne l'a pas, le doute joue tout", (t) => {
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
