// L'étape des gates qui joue la zone app : le vrai `.claude/brigade/gates.sh` de
// ce dépôt, sur un projet d'essai. Le projet n'a ni manifest ni dépôt git, les
// autres étapes y sont donc rouges — seules les lignes de l'app sont regardées.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");

function projet(t: TestContext, app?: { manifeste: object; installe: boolean }, runtime?: object): string {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-gates-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  writeFileSync(join(racine, "CLAUDE.md"), "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  if (runtime !== undefined) {
    mkdirSync(join(racine, "runtime"));
    writeFileSync(join(racine, "runtime/package.json"), JSON.stringify(runtime));
  }
  if (app !== undefined) {
    mkdirSync(join(racine, "app/node_modules"), { recursive: true });
    if (!app.installe) rmSync(join(racine, "app/node_modules"), { recursive: true });
    writeFileSync(join(racine, "app/package.json"), JSON.stringify(app.manifeste));
  }
  return racine;
}

// Les lignes des gates — leur sortie standard, puis leur sortie d'erreur — qui répondent au motif.
function lignes(racine: string, motif: RegExp): Promise<string[]> {
  return new Promise((resoudre) => {
    // Sans prendre la place des gates de la machine : celles qui jouent cette suite la tiennent.
    execFile("bash", [GATES, racine], { env: { ...process.env, BRIGADE_GATES_PLACE: "" } }, (_, sortie, erreurs) => resoudre(`${sortie}\n${erreurs}`.split("\n").filter((ligne) => motif.test(ligne))));
  });
}
const lignesDeLApp = (racine: string) => lignes(racine, /^(ok {4}|FAIL {2}).*\bapp\b/);

// Une suite verte, telle que le lanceur de Node la conclut.
const SUITE_DE = (tests: number) => ({ scripts: { test: `echo 'ℹ tests ${tests}'; echo 'ℹ duration_ms 1500'` } });

// Chaque test a son projet : ils se jouent de front.
describe("les gates et la zone app", { concurrency: 8 }, () => {
  test("sans zone app, rien à jouer — et ce n'est pas un échec", async (t) => {
    assert.deepEqual(await lignesDeLApp(projet(t)), ["ok    app absente : aucun test à jouer"]);
  });

  test("une suite verte est dite verte", async (t) => {
    const racine = projet(t, { manifeste: { scripts: { test: "true" } }, installe: true });

    assert.deepEqual(await lignesDeLApp(racine), ["ok    tests de l'app", "ok    app sans script typecheck : aucun contrôle de types à jouer"]);
  });

  test("une suite rouge rougit les gates, en disant comment la rejouer", async (t) => {
    const racine = projet(t, { manifeste: { scripts: { test: "false" } }, installe: true });

    // Sortie standard d'abord, d'erreur ensuite : la ligne FAIL vient après les ok.
    assert.deepEqual(await lignesDeLApp(racine), ["ok    app sans script typecheck : aucun contrôle de types à jouer", "FAIL  tests de l'app en échec — rejoue : npm --prefix app test"]);
  });

  test("les mesures additionnent les deux zones — et une suite rouge les retire toutes : jamais la somme des seules vertes", async (t) => {
    const vertes = projet(t, { manifeste: SUITE_DE(30), installe: true }, SUITE_DE(1400));
    const appRouge = projet(t, { manifeste: { scripts: { test: "false" } }, installe: true }, SUITE_DE(1400));

    assert.deepEqual(await lignes(vertes, /^MESURE {2}tests/), ["MESURE  tests=1430", "MESURE  tests_s=3.0"]);
    assert.deepEqual(await lignes(appRouge, /^MESURE {2}tests/), []);
  });

  test("des dépendances déclarées et jamais installées sont dites, plutôt qu'une suite qui ne trouve aucun module", async (t) => {
    const racine = projet(t, { manifeste: { scripts: { test: "true" }, dependencies: { "node-pty": "1.1.0" } }, installe: false });

    assert.deepEqual(await lignesDeLApp(racine), ["FAIL  dépendances de l'app absentes : tests injouables — rejoue worktree-setup.sh"]);
  });
});
