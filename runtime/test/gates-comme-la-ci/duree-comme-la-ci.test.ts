// La garde des 2 s des gates, quand elles jouent toute la suite (#3996) : elle juge comme la CI de la PR (mode `pr`,
// #2322) — un test lent que le changement ajoute ou change échoue, les autres sont rapportés —, et les tests proches
// du changement, que les gates jouaient seuls avant, restent jugés comme en strict.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { modeDemande } from "../garde-duree/reporteur.ts";
import { ENV_ENFANT, git, repertoireTemporaire } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const GATES = join(import.meta.dirname, "../../../.claude/brigade/gates.sh");
const SELECTION = join(import.meta.dirname, "../../../.claude/brigade/tests-touches.mjs");
const ROLES = ["po", "manager", "dev", "designer"];

test("in the pr mode, a slow close test the gates name fails as before, a slow far-away test is only reported", (t) => {
  const avant = { mode: process.env.BRIGADE_DUREE_MODE, base: process.env.BRIGADE_DUREE_BASE, stricts: process.env.BRIGADE_DUREE_STRICTS };
  t.after(() => {
    for (const [cle, valeur] of [["BRIGADE_DUREE_MODE", avant.mode], ["BRIGADE_DUREE_BASE", avant.base], ["BRIGADE_DUREE_STRICTS", avant.stricts]] as const) {
      if (valeur === undefined) delete process.env[cle];
      else process.env[cle] = valeur;
    }
  });
  Object.assign(process.env, { BRIGADE_DUREE_MODE: "pr", BRIGADE_DUREE_BASE: "HEAD", BRIGADE_DUREE_STRICTS: "test/proche.test.ts test/autre.test.ts" });
  const sources = new Map([["test/proche.test.ts", 'test("lent", () => {});\n'], ["test/loin.test.ts", 'test("lent", () => {});\n']]);

  const mode = modeDemande(sources);

  assert.equal(mode.genre, "pr");
  if (mode.genre !== "pr") return;
  assert.equal(mode.touche({ test: "lent", ms: 3000, fichiers: ["test/proche.test.ts"] }), true, "a close test is judged as before");
  assert.equal(mode.touche({ test: "lent", ms: 3000, fichiers: ["test/loin.test.ts"] }), false, "a far-away test the change does not touch is reported");
});

// Un projet aux gates vertes, sur `main`, puis sur une branche qui change `runtime/src/a.ts`, qu'importe `test/a.test.ts`.
// Sa suite du runtime note la garde de durée que les gates lui donnent.
function projet(t: TestContext): string {
  const racine = join(repertoireTemporaire(t), "projet");
  const poser = (fichier: string, contenu: string) => {
    mkdirSync(join(racine, fichier, ".."), { recursive: true });
    writeFileSync(join(racine, fichier), contenu);
  };
  poser("CLAUDE.md", "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  poser(".gitignore", ".brigade-state/\nnode_modules/\nduree.txt\n");
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
  const noter = "require('fs').writeFileSync('duree.txt', [process.env.BRIGADE_DUREE_MODE, process.env.BRIGADE_DUREE_BASE, process.env.BRIGADE_DUREE_STRICTS].join('|'))";
  poser("runtime/package.json", JSON.stringify({ scripts: { test: `node -e "${noter}" "test/**/*.test.ts"`, typecheck: "true" } }));
  poser("runtime/src/a.ts", "export const a = 1;\n");
  poser("runtime/test/a.test.ts", 'import { a } from "../src/a.ts";\nvoid a;\n');
  poser("runtime/test/loin.test.ts", "");
  poser("runtime/node_modules/.bin/tsc", "#!/bin/sh\n");
  chmodSync(join(racine, "runtime/node_modules/.bin/tsc"), 0o755);
  git(racine, "init", "-q", "-b", "main");
  git(racine, "add", "-A");
  git(racine, "commit", "-q", "-m", "projet d'essai");
  git(racine, "checkout", "-q", "-b", "travail");
  return racine;
}

test("the gates that play every test give the runtime suite the PR's duration mode, the close tests named as strict", { skip: posixOnly("plays this repository's real gates.sh on a test project; on Windows its Python check reads the role paths with backslashes") }, (t) => {
  const racine = projet(t);
  const base = git(racine, "rev-parse", "main");
  writeFileSync(join(racine, "runtime/src/a.ts"), "export const a = 2;\n");

  const passage = spawnSync("bash", [GATES, racine], { env: { ...ENV_ENFANT, HOME: join(racine, "..") }, encoding: "utf8" });
  const sortie = passage.stdout + passage.stderr;

  assert.match(sortie, /^ok {4}tests : tous, comme la CI Windows/m);
  assert.equal(readFileSync(join(racine, "runtime/duree.txt"), "utf8"), `pr|${base}|test/a.test.ts`, sortie);
  assert.equal(passage.status, 0, sortie);
});
