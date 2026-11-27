// #3996, critère 4 : les gates jouent les mêmes tests que la CI, les tests de loin compris — ceux qui parcourent un
// dossier au lieu d'importer ce qu'ils gardent (le glossaire des sorties de `report`, « tests writings and code cooks
// ready »). Par le vrai `gates.sh` du dépôt, sur un projet d'essai : un fichier ajouté sous `runtime/src/` que nul test
// n'importe ni ne nomme fait échouer un test qui parcourt ce dossier, et les gates en sont rouges, sans la CI.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ENV_ENFANT, git, repertoireTemporaire } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const GATES = join(import.meta.dirname, "../../../.claude/brigade/gates.sh");
const SELECTION = join(import.meta.dirname, "../../../.claude/brigade/tests-touches.mjs");
const SKIP = posixOnly("plays this repository's real gates.sh on a test project; on Windows its Python check reads the role paths with backslashes");

// Un projet aux tests verts (sans rôle V1, ses contrôles plugin sont rouges, #4630), sur `main`, puis sur une branche de travail. Son test de loin lit la liste de `src/` : il ne
// l'importe pas, et ne cite le nom d'aucun de ses fichiers.
function projet(t: TestContext): string {
  const racine = join(repertoireTemporaire(t), "projet");
  const poser = (fichier: string, contenu: string) => {
    mkdirSync(join(racine, fichier, ".."), { recursive: true });
    writeFileSync(join(racine, fichier), contenu);
  };
  poser("CLAUDE.md", "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  poser(".claude-plugin/plugin.json", JSON.stringify({ commands: ["./commands/start.md"], agents: [] }));
  poser(".claude-plugin/marketplace.json", "{}");
  poser(".claude/settings.json", "{}");
  poser("commands/start.md", "");
  mkdirSync(join(racine, ".claude/brigade"), { recursive: true });
  copyFileSync(SELECTION, join(racine, ".claude/brigade/tests-touches.mjs"));
  for (const zone of ["runtime", "app"]) {
    poser(`${zone}/package.json`, JSON.stringify({ scripts: { test: 'node --test "test/**/*.test.ts"', typecheck: "true" } }));
    poser(`${zone}/src/a.ts`, "export const a = 1;\n");
    poser(`${zone}/test/a.test.ts`, "");
    poser(`${zone}/node_modules/.bin/tsc`, "#!/bin/sh\n");
    chmodSync(join(racine, zone, "node_modules/.bin/tsc"), 0o755);
  }
  poser("runtime/test/dossier-propre.test.ts", 'import { readdirSync } from "node:fs";\nimport { test } from "node:test";\ntest("the source folder holds no module of the forbidden family", () => {\n  const famille = ["inter", "dit"].join("");\n  const trouves = readdirSync(new URL("../src", import.meta.url)).filter((nom) => nom.startsWith(famille));\n  if (trouves.length > 0) throw new Error(`forbidden module: ${trouves.join(", ")}`);\n});\n');
  git(racine, "init", "-q", "-b", "main");
  git(racine, "add", "-A");
  git(racine, "commit", "-q", "-m", "projet d'essai");
  git(racine, "checkout", "-q", "-b", "travail");
  return racine;
}

test("a failing far-away test, one that walks a folder instead of importing the changed file, turns the gates red", { skip: SKIP }, (t) => {
  const racine = projet(t);
  writeFileSync(join(racine, "runtime/src/interdit.ts"), "export const interdit = 1;\n");

  // Ce mode — toutes les suites, comme la CI Windows — ne joue plus que sur demande (#4141).
  const passage = spawnSync("bash", [GATES, racine], { env: { ...ENV_ENFANT, HOME: join(racine, ".."), BRIGADE_GATES_COMME_LA_CI: "1" }, encoding: "utf8" });
  const sortie = passage.stdout + passage.stderr;

  assert.match(sortie, /forbidden module: interdit\.ts/, "the far-away test was played");
  assert.match(sortie, /^FAIL {2}tests du runtime en échec/m);
  assert.equal(passage.status, 1, sortie);
});
