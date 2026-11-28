// L'étape des gates qui joue la zone app : le vrai `.claude/brigade/gates.sh` de
// ce dépôt, sur un projet d'essai. Le projet n'a ni manifest ni dépôt git, les
// autres étapes y sont donc rouges — seules les lignes de l'app sont regardées.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");

function project(t: TestContext, app?: { manifeste: object; installe: boolean }, runtime?: object): string {
  const root = mkdtempSync(join(tmpdir(), "brigade-app-gates-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "CLAUDE.md"), "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  if (runtime !== undefined) {
    mkdirSync(join(root, "runtime"));
    writeFileSync(join(root, "runtime/package.json"), JSON.stringify(runtime));
  }
  if (app !== undefined) {
    mkdirSync(join(root, "app/node_modules"), { recursive: true });
    if (!app.installe) rmSync(join(root, "app/node_modules"), { recursive: true });
    writeFileSync(join(root, "app/package.json"), JSON.stringify(app.manifeste));
  }
  return root;
}

// Les lignes des gates — leur sortie standard, puis leur sortie d'erreur — qui répondent au motif.
function lines(root: string, motive: RegExp): Promise<string[]> {
  return new Promise((resolve) => {
    // Sans tour : ces gates d'essai ne font pas la queue derrière celles de la box.
    execFile("bash", [GATES, root], { env: { ...process.env, BRIGADE_GATES_VERROU: "aucun" } }, (_, output, errors) => resolve(`${output}\n${errors}`.split("\n").filter((line) => motive.test(line))));
  });
}
const linesOfTheApp = (root: string) => lines(root, /^(ok {4}|FAIL {2}).*\bapp\b/);

// Une suite verte, telle que le lanceur de Node la conclut.
const SUITE_OF = (tests: number) => ({ scripts: { test: `echo 'ℹ tests ${tests}'; echo 'ℹ duration_ms 1500'` } });

// Chaque test a son projet : ils se jouent de front.
describe("les gates et la zone app", { concurrency: 8 }, () => {
  test("sans zone app, rien à jouer — et ce n'est pas un échec", async (t) => {
    assert.deepEqual(await linesOfTheApp(project(t)), ["ok    app absente : aucun test à jouer"]);
  });

  test("une suite verte est dite verte", async (t) => {
    const root = project(t, { manifeste: { scripts: { test: "true" } }, installe: true });

    assert.deepEqual(await linesOfTheApp(root), ["ok    tests de l'app", "ok    app sans script typecheck : aucun contrôle de types à jouer"]);
  });

  test("une suite rouge rougit les gates, en disant comment la rejouer", async (t) => {
    const root = project(t, { manifeste: { scripts: { test: "false" } }, installe: true });

    // Sortie standard d'abord, d'erreur ensuite : la ligne FAIL vient après les ok.
    assert.deepEqual(await linesOfTheApp(root), ["ok    app sans script typecheck : aucun contrôle de types à jouer", "FAIL  tests de l'app en échec — rejoue : npm --prefix app test"]);
  });


  test("des dépendances déclarées et jamais installées sont dites, plutôt qu'une suite qui ne trouve aucun module", async (t) => {
    const root = project(t, { manifeste: { scripts: { test: "true" }, dependencies: { "node-pty": "1.1.0" } }, installe: false });

    assert.deepEqual(await linesOfTheApp(root), ["FAIL  dépendances de l'app absentes : tests injouables — rejoue worktree-setup.sh"]);
  });
});
