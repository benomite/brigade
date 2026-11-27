// #4016, critère 3 : chaque règle vérifiable a une gate ; qui la viole la fait échouer, et le message nomme la règle.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ENV_ENFANT, git, repertoireTemporaire } from "../outils.ts";

const GATES = join(import.meta.dirname, "../../../.claude/brigade/gates.sh");

// Un projet aux gates vertes, commité ; le test y pose ensuite sa violation.
function projet(t: TestContext): string {
  const racine = join(repertoireTemporaire(t), "projet");
  const poser = (fichier: string, contenu: string) => {
    mkdirSync(join(racine, fichier, ".."), { recursive: true });
    writeFileSync(join(racine, fichier), contenu);
  };
  poser("CLAUDE.md", "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  poser(".gitignore", ".brigade-state/\n");
  poser(".claude-plugin/plugin.json", JSON.stringify({ commands: ["./commands/ask.md"] }));
  poser(".claude-plugin/marketplace.json", "{}");
  poser(".claude/settings.json", "{}");
  poser("commands/ask.md", "# ask\n");
  git(racine, "init", "-q", "-b", "main");
  git(racine, "add", "-A");
  git(racine, "commit", "-q", "-m", "projet d'essai");
  return racine;
}

function jouer(racine: string): { code: number | null; sortie: string } {
  const passage = spawnSync("bash", [GATES, racine], { env: { ...ENV_ENFANT, HOME: join(racine, "..") }, encoding: "utf8" });
  return { code: passage.status, sortie: passage.stdout + passage.stderr };
}

function poser(racine: string, fichier: string, contenu: string): void {
  mkdirSync(join(racine, fichier, ".."), { recursive: true });
  writeFileSync(join(racine, fichier), contenu);
}

describe("the gates refuse a broken CLAUDE.md rule and name it", { concurrency: 4 }, () => {
  test("a test's git call outside ENV_GIT fails the gates, and the message names ENV_GIT", (t) => {
    const racine = projet(t);
    poser(
      racine,
      "runtime/test/viole-env-git.test.ts",
      `import { execFileSync } from "node:child_process";\nimport { test } from "node:test";\ntest("x", () => {\n  execFileSync("git", ["status"], { env: process.env });\n});\n`,
    );
    const { code, sortie } = jouer(racine);
    assert.notEqual(code, 0, sortie);
    assert.match(sortie, /^FAIL.*ENV_GIT/m, sortie);
  });

  test("a kill by process name fails the gates, and the message names the rule", (t) => {
    const racine = projet(t);
    poser(racine, "runtime/test/viole-kill.test.ts", `import { execSync } from "node:child_process";\nimport { test } from "node:test";\ntest("x", () => {\n  execSync("pkill -f src/main.ts");\n});\n`);
    const { code, sortie } = jouer(racine);
    assert.notEqual(code, 0, sortie);
    assert.match(sortie, /^FAIL.*(pkill|killall|process name|by (its |their )?name|par son nom|nom du processus)/im, sortie);
  });
});
