// Les suites des gates jouent sans `gh` connecté ni jeton de GitHub, comme sur la CI (#3996) : les tests gelés
// qui lisent GitHub par `gh` s'y sautent (#3847), et un test gelé d'un ticket servi depuis longtemps ne retient
// pas la livraison d'un autre. Par le vrai `gates.sh` du dépôt, sur un projet d'essai dont le poste a un `gh`
// connecté — un faux, qui lit sa configuration où le vrai la lit.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ENV_ENFANT, git, repertoireTemporaire } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const GATES = join(import.meta.dirname, "../../../.claude/brigade/gates.sh");
const SELECTION = join(import.meta.dirname, "../../../.claude/brigade/tests-touches.mjs");
const ROLES = ["po", "manager", "dev", "designer"];
const SKIP = posixOnly("plays this repository's real gates.sh on a test project; on Windows its Python check reads the role paths with backslashes");

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
  copyFileSync(SELECTION, join(racine, ".claude/brigade/tests-touches.mjs"));
  poser("runtime/package.json", JSON.stringify({ scripts: { test: 'node --test "test/**/*.test.ts"' } }));
  poser("runtime/src/a.ts", "export const a = 1;\n");
  // Le test d'un ticket qui lit GitHub : connecté, `gh auth token` réussit ; le jeton, il le voit.
  poser("runtime/test/lit-github.test.ts", 'import { spawnSync } from "node:child_process";\nimport { test } from "node:test";\ntest("reads GitHub", () => {\n  if (spawnSync("gh", ["auth", "token"]).status === 0) throw new Error("gh is logged in for the suite");\n  if (process.env.GH_TOKEN !== undefined) throw new Error("GH_TOKEN reaches the suite");\n});\n');
  git(racine, "init", "-q", "-b", "main");
  git(racine, "add", "-A");
  git(racine, "commit", "-q", "-m", "projet d'essai");
  git(racine, "checkout", "-q", "-b", "travail");
  return racine;
}

test("the gates' suites run with no logged-in gh and no GitHub token, as on the CI", { skip: SKIP }, (t) => {
  const racine = projet(t);
  writeFileSync(join(racine, "runtime/src/a.ts"), "export const a = 2;\n");
  // Le `gh` du poste, connecté : il rend un jeton si sa configuration en porte un.
  const poste = join(repertoireTemporaire(t), "poste");
  mkdirSync(join(poste, "bin"), { recursive: true });
  mkdirSync(join(poste, ".config/gh"), { recursive: true });
  writeFileSync(join(poste, ".config/gh/hosts.yml"), "github.com:\n  oauth_token: x\n");
  writeFileSync(join(poste, "bin/gh"), '#!/bin/sh\n[ -f "${GH_CONFIG_DIR:-$HOME/.config/gh}/hosts.yml" ] && { echo x; exit 0; }\nexit 1\n');
  chmodSync(join(poste, "bin/gh"), 0o755);

  const passage = spawnSync("bash", [GATES, racine], { env: { ...ENV_ENFANT, PATH: `${join(poste, "bin")}:${ENV_ENFANT.PATH}`, HOME: poste, GH_TOKEN: "x" }, encoding: "utf8" });
  const sortie = passage.stdout + passage.stderr;

  assert.match(sortie, /^ok {4}tests du runtime$/m);
  assert.equal(passage.status, 0, sortie);
});
