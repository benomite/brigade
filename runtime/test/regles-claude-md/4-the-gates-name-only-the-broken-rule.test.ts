// #4016 : les règles du CLAUDE.md que les gates vérifient (`.claude/brigade/gates.sh`,
// étapes 3 et 6 quinquies). Chaque cas pose, à côté d'une violation, ce que la
// règle permet : les gates nomment la violation, par son fichier et sa ligne, et
// rien d'autre.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ENV_ENFANT, git, repertoireTemporaire } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const GATES = join(import.meta.dirname, "../../../.claude/brigade/gates.sh");
function poser(racine: string, fichier: string, contenu: string): void {
  mkdirSync(join(racine, fichier, ".."), { recursive: true });
  writeFileSync(join(racine, fichier), contenu);
}

// Un projet aux gates vertes, commité.
function projet(t: TestContext): string {
  const racine = join(repertoireTemporaire(t), "projet");
  poser(racine, "CLAUDE.md", "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  poser(racine, ".gitignore", ".brigade-state/\n");
  poser(racine, ".claude-plugin/plugin.json", JSON.stringify({ commands: ["./commands/ask.md"] }));
  poser(racine, ".claude-plugin/marketplace.json", "{}");
  poser(racine, ".claude/settings.json", "{}");
  poser(racine, "commands/ask.md", "# ask\n");
  git(racine, "init", "-q", "-b", "main");
  git(racine, "add", "-A");
  git(racine, "commit", "-q", "-m", "projet d'essai");
  return racine;
}

// Le code de sortie, et les lignes FAIL des gates.
function jouer(racine: string): { code: number | null; echecs: string[]; sortie: string } {
  const passage = spawnSync("bash", [GATES, racine], { env: { ...ENV_ENFANT, HOME: join(racine, "..") }, encoding: "utf8" });
  const sortie = passage.stdout + passage.stderr;
  return { code: passage.status, echecs: sortie.split("\n").filter((ligne) => ligne.startsWith("FAIL")), sortie };
}

// Chaque cas compare les lignes FAIL des gates mot pour mot. Sous Windows, le python des gates les
// écrit en `\r\n` et en cp1252, et la validité des manifests JSON (étape 1) y rougit d'elle-même :
// windows tests (7/8) sur a6a01e5. Le test gelé 3-each-checkable-rule-has-a-gate, qui ne cherche que
// le nom de la règle, garde ces règles sous Windows.
const SKIP = posixOnly("compares the real gates.sh FAIL lines word for word; on Windows the gates' Python writes them with CRLF in cp1252, and step 1 reports every JSON manifest invalid");

const appelGit = (env: string) => `import { execFileSync } from "node:child_process";\nimport { ENV_GIT } from "./outils.ts";\n\nexecFileSync("git", ["commit"], { env: ${env} });\n`;

describe("the gates name the broken CLAUDE.md rule, and only it", () => {
  test("a test's git under ENV_GIT passes, one under process.env fails on its line", { skip: SKIP }, (t) => {
    const racine = projet(t);
    poser(racine, "runtime/test/sous-env-git.test.ts", appelGit("{ ...ENV_GIT, GIT_DIR: \"x\" }"));
    poser(racine, "runtime/test/env-git-par-dessus.test.ts", appelGit("{ ...process.env, ...ENV_GIT }"));
    poser(racine, "runtime/test/chemin-seul.test.ts", appelGit("{ PATH: process.env.PATH }"));
    poser(racine, "runtime/test/sous-process-env.test.ts", appelGit("{ ...process.env, GIT_DIR: \"x\" }"));
    poser(racine, "runtime/src/hors-des-tests.ts", appelGit("process.env"));

    const { code, echecs, sortie } = jouer(racine);

    assert.deepEqual(echecs, [
      "FAIL  le git d'un test tourne sous ENV_GIT (runtime/test/outils.ts), jamais sous process.env : runtime/test/sous-process-env.test.ts:4",
    ], sortie);
    assert.notEqual(code, 0, sortie);
  });

  test("a kill by pid passes, a kill by name fails on its line, in a script as in a test", { skip: SKIP }, (t) => {
    const racine = projet(t);
    poser(racine, "scripts/arreter.sh", "#!/usr/bin/env bash\n# jamais pkill : par le pid\nkill \"$PID\"\nkillall node\n");
    poser(racine, "runtime/test/arret.test.ts", "// pas de pkill ici\nprocess.kill(pid);\nspawnSync(\"taskkill\", [\"/pid\", String(pid), \"/T\", \"/F\"]);\nspawnSync(\"taskkill\", [\"/F\", \"/IM\", \"node.exe\"]);\n");

    const { code, echecs, sortie } = jouer(racine);

    assert.deepEqual(echecs.toSorted(), [
      "FAIL  ne tue jamais un process par son nom — un autre worktree en lance du même nom ; tue-le par son pid : runtime/test/arret.test.ts:4",
      "FAIL  ne tue jamais un process par son nom — un autre worktree en lance du même nom ; tue-le par son pid : scripts/arreter.sh:4",
    ], sortie);
    assert.notEqual(code, 0, sortie);
  });

  test("a changed file the check cannot read turns the gates red with a FAIL line, never a silent pass", { skip: process.getuid?.() === 0 ? "needs a file its owner cannot read: root reads any file" : SKIP }, (t) => {
    const racine = projet(t);
    poser(racine, "runtime/test/illisible.test.ts", appelGit("process.env"));
    chmodSync(join(racine, "runtime/test/illisible.test.ts"), 0o000);

    const { code, echecs, sortie } = jouer(racine);

    assert.deepEqual(echecs, ["FAIL  contrôle des règles du CLAUDE.md (ENV_GIT, process tué par son nom) planté — sa trace est au-dessus"], sortie);
    assert.match(sortie, /PermissionError/);
    assert.notEqual(code, 0, sortie);
  });

  test("a plugin.json that names a missing file fails, and the message names the file", { skip: SKIP }, (t) => {
    const racine = projet(t);
    poser(racine, ".claude-plugin/plugin.json", JSON.stringify({ commands: ["./commands/ask.md", "./commands/absent.md"], agents: ["./agents/fantome.md"] }));

    const { code, echecs, sortie } = jouer(racine);

    assert.deepEqual(echecs, [
      "FAIL  declare dans plugin.json[commands] mais absent du disque : commands/absent.md",
      "FAIL  declare dans plugin.json[agents] mais absent du disque : agents/fantome.md",
    ], sortie);
    assert.notEqual(code, 0, sortie);
  });

  test("a file of commands/ or agents/ that plugin.json does not name is no failure", { skip: SKIP }, (t) => {
    const racine = projet(t);
    poser(racine, "commands/todo.md", "# todo\n");
    poser(racine, "agents/kitchen/second-judge.md", "# judge\n");

    const { code, echecs, sortie } = jouer(racine);

    assert.deepEqual(echecs, [], sortie);
    assert.equal(code, 0, sortie);
  });
});
