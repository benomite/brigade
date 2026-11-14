// Le premier motif de renvoi de la relecture (#2770), vu par un script : un
// export du code que seuls ses tests importent.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { exportsDe, exportsQueSesTestsAppellent } from "../../../src/passe/gates/export-que-ses-tests-appellent.ts";
import { ENV_ENFANT, git, repertoireTemporaire } from "../../outils.ts";
import { posixOnly } from "../../support/plateforme.ts";

const RACINE = join(import.meta.dirname, "../../../..");
const SRC = "runtime/src";

const fichiers = (contenus: Record<string, string>) => new Map(Object.entries(contenus));

describe("les exports que seuls des tests importent", () => {
  const B = "export function fabrique() {}\nexport const autre = 1;\n";

  test("un export importé seulement par un test est nommé, avec son testeur", () => {
    const trouves = exportsQueSesTestsAppellent(
      fichiers({ "runtime/src/b.ts": B, "runtime/test/b.test.ts": 'import { fabrique } from "../src/b.ts";\n' }),
      ["runtime/src/b.ts"],
    );
    assert.deepEqual(trouves, [{ fichier: "runtime/src/b.ts", nom: "fabrique", testeurs: ["runtime/test/b.test.ts"] }]);
  });

  test("un export que du code importe aussi passe", () => {
    const trouves = exportsQueSesTestsAppellent(
      fichiers({
        "runtime/src/b.ts": B,
        "runtime/src/c.ts": 'import { fabrique } from "./b.ts";\nfabrique();\n',
        "runtime/test/b.test.ts": 'import { fabrique } from "../src/b.ts";\n',
      }),
      ["runtime/src/b.ts"],
    );
    assert.deepEqual(trouves, []);
  });

  test("un import de type, un import d'espace de noms et un import() par du code comptent", () => {
    const test = { "runtime/test/b.test.ts": 'import { fabrique, autre } from "../src/b.ts";\n' };
    for (const importeur of ['import type { fabrique, autre } from "./b.ts";', 'import * as b from "./b.ts";', 'const b = await import("./b.ts");', 'export * from "./b.ts";']) {
      assert.deepEqual(exportsQueSesTestsAppellent(fichiers({ "runtime/src/b.ts": B, "runtime/src/c.ts": importeur, ...test }), ["runtime/src/b.ts"]), [], importeur);
    }
  });

  test("un export que personne n'importe, ou qu'un test seul importe d'un fichier non vérifié, n'est pas nommé", () => {
    const sources = { "runtime/src/b.ts": B, "runtime/test/b.test.ts": 'import { fabrique } from "../src/b.ts";\n' };
    assert.deepEqual(exportsQueSesTestsAppellent(fichiers({ "runtime/src/b.ts": B }), ["runtime/src/b.ts"]), []);
    assert.deepEqual(exportsQueSesTestsAppellent(fichiers(sources), ["runtime/src/autre.ts"]), []);
  });

  test("les formes d'export : liste, alias, type, classe, async", () => {
    assert.deepEqual(
      exportsDe("export async function a() {}\nexport class B {}\nexport type C = 1;\nexport interface D {}\nexport { e, f as g };\nexport type { H };\nexport { i } from \"./x.ts\";\nexport default 1;\n").sort(),
      ["B", "C", "D", "H", "a", "e", "g"],
    );
  });
});

// Le vrai `gates.sh` de ce dépôt, sur un projet d'essai qui porte le contrôle.
const SKIP = posixOnly("plays this repository's real gates.sh on a test project; the gates' Python check fails on Windows paths");
const ROLES = ["po", "manager", "dev", "designer"];

function projet(t: TestContext): string {
  const racine = join(repertoireTemporaire(t), "projet");
  const poser = (fichier: string, contenu: string) => {
    mkdirSync(join(racine, fichier, ".."), { recursive: true });
    writeFileSync(join(racine, fichier), contenu);
  };
  poser("CLAUDE.md", "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  poser(".gitignore", ".brigade-state/\nnode_modules/\n");
  poser(".claude-plugin/plugin.json", JSON.stringify({ commands: ROLES.map((role) => `./commands/${role}.md`) }));
  poser(".claude-plugin/marketplace.json", "{}");
  poser(".claude/settings.json", "{}");
  for (const role of ROLES) {
    poser(`commands/${role}.md`, "");
    poser(`codex/skills/${role}/SKILL.md`, "");
    poser(`codex/skills/${role}/agents/openai.yaml`, "");
  }
  mkdirSync(join(racine, ".claude/brigade"), { recursive: true });
  copyFileSync(join(RACINE, ".claude/brigade/tests-touches.mjs"), join(racine, ".claude/brigade/tests-touches.mjs"));
  // Le contrôle lui-même, et ce qu'il importe.
  for (const module of ["passe/gates/controle.ts", "passe/gates/export-que-ses-tests-appellent.ts", "sans-invite.ts"]) {
    mkdirSync(join(racine, SRC, module, ".."), { recursive: true });
    copyFileSync(join(RACINE, SRC, module), join(racine, SRC, module));
  }
  poser("runtime/package.json", JSON.stringify({ type: "module", scripts: { test: 'node --test "test/**/*.test.ts"', typecheck: "true" } }));
  poser("runtime/test/a.test.ts", "");
  poser("runtime/node_modules/.bin/tsc", "#!/bin/sh\n");
  chmodSync(join(racine, "runtime/node_modules/.bin/tsc"), 0o755);
  git(racine, "init", "-q", "-b", "main");
  git(racine, "add", "-A");
  git(racine, "commit", "-q", "-m", "projet d'essai");
  git(racine, "checkout", "-q", "-b", "travail");
  return racine;
}

function jouer(racine: string): { code: number | null; sortie: string } {
  const passage = spawnSync("bash", [join(RACINE, ".claude/brigade/gates.sh"), racine], { env: { ...ENV_ENFANT, HOME: join(racine, "..") }, encoding: "utf8" });
  return { code: passage.status, sortie: passage.stdout + passage.stderr };
}

const poser = (racine: string, fichier: string, contenu: string) => {
  mkdirSync(join(racine, fichier, ".."), { recursive: true });
  writeFileSync(join(racine, fichier), contenu);
};

describe("le contrôle dans les gates, avant les tests et avant la relecture", () => {
  test("un export que seul un test importe rougit les gates, nomme l'export, et arrête avant les tests", { skip: SKIP }, (t) => {
    const racine = projet(t);
    poser(racine, "runtime/src/b.ts", "export function fabrique() {}\n");
    poser(racine, "runtime/test/b.test.ts", 'import { fabrique } from "../src/b.ts";\nfabrique();\n');

    const { code, sortie } = jouer(racine);

    assert.match(sortie, /^FAIL {2}export « fabrique » de runtime\/src\/b\.ts : seuls des tests l'importent \(runtime\/test\/b\.test\.ts\)/m);
    assert.equal(code, 1, sortie);
    assert.match(sortie, /gates : ROUGE/);
    // Il se juge avant les suites, et un rouge les arrête : aucun test n'est joué.
    assert.doesNotMatch(sortie, /tests du runtime|contrôle de types/);
  });

  test("le même export, que du code importe aussi, passe", { skip: SKIP }, (t) => {
    const racine = projet(t);
    poser(racine, "runtime/src/b.ts", "export function fabrique() {}\n");
    poser(racine, "runtime/src/c.ts", 'import { fabrique } from "./b.ts";\nfabrique();\n');
    poser(racine, "runtime/test/b.test.ts", 'import { fabrique } from "../src/b.ts";\nfabrique();\n');

    const { code, sortie } = jouer(racine);

    assert.match(sortie, /^ok {4}motifs de renvoi : aucun export que seuls ses tests importent$/m);
    assert.equal(code, 0, sortie);
  });

  test("un export plus ancien que le changement, que seuls des tests importent, n'est pas le sien", { skip: SKIP }, (t) => {
    const racine = projet(t);
    poser(racine, "runtime/src/b.ts", "export function ancien() {}\n");
    poser(racine, "runtime/test/b.test.ts", 'import { ancien } from "../src/b.ts";\nancien();\n');
    git(racine, "add", "-A");
    git(racine, "commit", "-q", "-m", "un export déjà là");
    git(racine, "branch", "-f", "main", "HEAD");
    poser(racine, "runtime/src/b.ts", "export function ancien() {}\nexport const neuf = 1;\n");

    const { code, sortie } = jouer(racine);

    assert.doesNotMatch(sortie, /^FAIL.*ancien/m);
    assert.equal(code, 0, sortie);
  });
});
