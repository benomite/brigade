// #4016 : les règles du CLAUDE.md que les gates vérifient (`.claude/brigade/gates.sh`,
// étapes 3-5 et 6 quinquies). Chaque cas pose, à côté d'une violation, ce que la
// règle permet : les gates nomment la violation, par son fichier et sa ligne, et
// rien d'autre.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ENV_ENFANT, git, repertoireTemporaire } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const GATES = join(import.meta.dirname, "../../../.claude/brigade/gates.sh");
const ROLES = ["po", "manager", "dev", "designer"];
// Un paragraphe que chaque rôle partage avec son miroir, entre deux qui sont à lui seul.
const PARTAGE = "**Nommer une PR au chef.** Par son ticket d'abord.";
const role = (nom: string) => `# ${nom}\n\nLe workflow du rôle.\n\n${PARTAGE}\n\nLa fin du rôle.\n`;
const miroir = (nom: string) => `# ${nom} (Codex)\n\nLire le workflow.\n\n${PARTAGE}\n\nLa fin du miroir.\n`;

function poser(racine: string, fichier: string, contenu: string): void {
  mkdirSync(join(racine, fichier, ".."), { recursive: true });
  writeFileSync(join(racine, fichier), contenu);
}

// Un projet aux gates vertes, commité ; chaque rôle partage un paragraphe avec son miroir.
function projet(t: TestContext): string {
  const racine = join(repertoireTemporaire(t), "projet");
  poser(racine, "CLAUDE.md", "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  poser(racine, ".gitignore", ".brigade-state/\n");
  poser(racine, ".claude-plugin/plugin.json", JSON.stringify({ commands: ROLES.map((nom) => `./commands/${nom}.md`) }));
  poser(racine, ".claude-plugin/marketplace.json", "{}");
  poser(racine, ".claude/settings.json", "{}");
  for (const nom of ROLES) {
    poser(racine, `commands/${nom}.md`, role(nom));
    poser(racine, `codex/skills/${nom}/SKILL.md`, miroir(nom));
    poser(racine, `codex/skills/${nom}/agents/openai.yaml`, "");
  }
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

  test("a shared paragraph changed alike, or removed from both, passes; changed in the role alone fails", { skip: SKIP }, (t) => {
    const racine = projet(t);
    const autrement = "**Nommer une PR au chef.** Par son ticket d'abord, jamais par son numéro seul.";
    // dev : le paragraphe partagé change de la même façon dans le rôle et dans son miroir.
    poser(racine, "commands/dev.md", role("dev").replace(PARTAGE, autrement));
    poser(racine, "codex/skills/dev/SKILL.md", miroir("dev").replace(PARTAGE, autrement));
    // manager : il quitte l'un et l'autre.
    poser(racine, "commands/manager.md", role("manager").replace(`${PARTAGE}\n\n`, ""));
    poser(racine, "codex/skills/manager/SKILL.md", miroir("manager").replace(`${PARTAGE}\n\n`, ""));
    // po : il change dans le rôle ; le miroir bouge ailleurs, et le garde tel quel.
    poser(racine, "commands/po.md", role("po").replace(PARTAGE, autrement));
    poser(racine, "codex/skills/po/SKILL.md", `${miroir("po")}\nUn ajout du miroir.\n`);
    // designer : son miroir disparaît, sous un rôle inchangé.
    rmSync(join(racine, "codex/skills/designer/SKILL.md"));

    const { code, echecs, sortie } = jouer(racine);

    assert.deepEqual(echecs, [
      "FAIL  miroir Codex incomplet : codex/skills/designer/SKILL.md",
      "FAIL  miroir Codex divergent : commands/designer.md et codex/skills/designer/SKILL.md partageaient « **Nommer une PR au chef.** Par son ticket d'abord. », ils ne disent plus la même chose — porte le même texte dans les deux",
      "FAIL  miroir Codex divergent : commands/po.md et codex/skills/po/SKILL.md partageaient « **Nommer une PR au chef.** Par son ticket d'abord. », ils ne disent plus la même chose — porte le même texte dans les deux",
    ], sortie);
    assert.notEqual(code, 0, sortie);
  });

  test("a changed file the check cannot read turns the gates red with a FAIL line, never a silent pass", { skip: process.getuid?.() === 0 ? "needs a file its owner cannot read: root reads any file" : SKIP }, (t) => {
    const racine = projet(t);
    poser(racine, "runtime/test/illisible.test.ts", appelGit("process.env"));
    chmodSync(join(racine, "runtime/test/illisible.test.ts"), 0o000);

    const { code, echecs, sortie } = jouer(racine);

    assert.deepEqual(echecs, ["FAIL  contrôle des règles du CLAUDE.md (ENV_GIT, process tué par son nom, miroir Codex) planté — sa trace est au-dessus"], sortie);
    assert.match(sortie, /PermissionError/);
    assert.notEqual(code, 0, sortie);
  });

  test("a role on the disk but missing from plugin.json fails, and the message says an added role must be declared", { skip: SKIP }, (t) => {
    const racine = projet(t);
    poser(racine, "commands/ask.md", "# ask\n");

    const { code, echecs, sortie } = jouer(racine);

    assert.deepEqual(echecs, [
      "FAIL  present sur le disque mais absent de plugin.json[commands] : commands/ask.md — un rôle ajouté doit être déclaré dans plugin.json, sinon il ne se charge jamais",
    ], sortie);
    assert.notEqual(code, 0, sortie);
  });

  test("the V1 roles and the runtime's agents kept on disk may stay out of plugin.json; a new command may not (#4525)", { skip: SKIP }, (t) => {
    const racine = projet(t);
    poser(racine, ".claude-plugin/plugin.json", JSON.stringify({ commands: ["./commands/start.md", "./commands/ask.md"], agents: [] }));
    poser(racine, "commands/start.md", "# start\n");
    poser(racine, "commands/ask.md", "# ask\n");
    for (const kept of ["commands/sync.md", "commands/init.md", "agents/cook.md", "agents/dev-teammate.md"]) poser(racine, kept, "---\nname: kept\n---\nbody\n");
    poser(racine, "commands/todo.md", "# todo\n");

    const { code, echecs, sortie } = jouer(racine);

    assert.deepEqual(echecs, [
      "FAIL  present sur le disque mais absent de plugin.json[commands] : commands/todo.md — un rôle ajouté doit être déclaré dans plugin.json, sinon il ne se charge jamais",
    ], sortie);
    assert.notEqual(code, 0, sortie);
  });
});
