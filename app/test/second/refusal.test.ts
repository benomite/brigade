// Les gestes que le second ne fait jamais — merger une PR, lire les secrets du chef — refusés par un crochet
// PreToolUse : déclaré dans les seuls réglages de l'onglet Second, joué à la main il refuse en nommant le geste
// que le chef tape à la place, et laisse passer le reste.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { spawnSync } from "node:child_process";
import { hooksOfRefusal, decide, MATCHER, SECRETS, outputOfHook } from "../../src/second/refusal.ts";
import { settingsOfSecond } from "../../src/second/launch.ts";
import { openTerminals, type Launch } from "../../src/terminals.ts";

const SCRIPT = join(import.meta.dirname, "..", "..", "src", "second", "refusal.ts");
const bash = (command: string) => ({ tool_name: "Bash", tool_input: { command } });
const lit = (file_path: string) => ({ tool_name: "Read", tool_input: { file_path } });
const TOKEN = "/home/chef/.config/brigade/max-token";

describe("merger une PR", () => {
  for (const command of ["gh pr merge 12", "gh pr merge --squash 12", "cd x && gh pr merge 12", "cd x; gh pr merge 12 --merge", "(gh pr merge 12)", "echo ok | gh pr merge 12", "gh -R a/b pr merge 12", "bash -c \"gh pr merge 12\"", "true\ngh pr merge 12"]) {
    test(`refusé : ${command.replace("\n", "\\n")}`, () => {
      const refusal = decide(bash(command));
      assert.ok(refusal, command);
      assert.match(refusal.raison, /`!gh pr merge \S+ --squash`/);
    });
  }

  test("le refus nomme le geste du chef, avec le numéro de la PR", () => {
    assert.match(decide(bash("gh pr merge --squash 12"))?.raison ?? "", /`!gh pr merge 12 --squash`/);
  });

  test("gh pr view, gh pr list et des mots voisins passent", () => {
    for (const command of ["gh pr view 12", "gh pr list --state merged", "echo ghost pr merge", "git merge main"]) {
      assert.equal(decide(bash(command)), undefined, command);
    }
  });
});

describe("les secrets du chef", () => {
  test("Read de .env.local, où qu'il soit : refusé, le geste du chef nommé", () => {
    for (const path of [".env.local", "/projets/brigade/.env.local", "C:\\projets\\.env.local", "/p/.env.local.bak"]) {
      const refusal = decide(lit(path));
      assert.ok(refusal, path);
      assert.match(refusal.raison, /with `!` in front/);
    }
  });

  test("Bash qui lit .env.local : cat, grep, source, head", () => {
    for (const command of ["cat .env.local", "grep TOKEN .env.local", "source .env.local", "set -a; . ./.env.local", "head -1 /p/.env.local"]) {
      const refusal = decide(bash(command));
      assert.ok(refusal, command);
      assert.match(refusal.raison, /`!cat \.env\.local`/);
    }
  });

  test("le jeton Max : son fichier (Read, Bash) et sa variable", () => {
    const env = { BRIGADE_CLAUDE_TOKEN_FILE: TOKEN };
    assert.ok(decide(lit(TOKEN), env));
    assert.ok(decide({ tool_name: "Grep", tool_input: { path: TOKEN, pattern: "." } }, env));
    assert.ok(decide(bash(`cat ${TOKEN}`), env));
    assert.ok(decide(bash("cat $BRIGADE_CLAUDE_TOKEN_FILE")));
    assert.ok(decide(bash('echo "$CLAUDE_CODE_OAUTH_TOKEN"')));
    assert.ok(decide(bash("printenv")));
  });

  test("README.md, des fichiers voisins et une commande sans secret passent", () => {
    assert.equal(decide(lit("README.md")), undefined);
    assert.equal(decide(lit("/projets/brigade/.env.example")), undefined);
    assert.equal(decide(lit(TOKEN.replace("max-token", "autre")), { BRIGADE_CLAUDE_TOKEN_FILE: TOKEN }), undefined);
    assert.equal(decide(bash("cat README.md")), undefined);
    assert.equal(decide({ tool_name: "Edit", tool_input: { file_path: "a.ts" } }), undefined);
  });

  test("la liste des protégés est en un seul endroit", () => {
    assert.deepEqual(SECRETS.noms, [".env.local"]);
    assert.deepEqual(SECRETS.variablesDeFichier, ["BRIGADE_CLAUDE_TOKEN_FILE"]);
  });
});

describe("le crochet, dans les réglages du second", () => {
  test("PreToolUse sur Bash, Read et Grep ; le lancement du second le porte", () => {
    const hooks = settingsOfSecond(hooksOfRefusal({ node: "/usr/bin/node" })).hooks?.PreToolUse ?? assert.fail("pas de PreToolUse");
    assert.equal(hooks[0]?.matcher, MATCHER);
    assert.deepEqual(MATCHER.split("|"), ["Bash", "Read", "Grep"]);
    assert.match(hooks[0]?.hooks[0]?.command ?? "", /^'\/usr\/bin\/node' '.*second\/refus\.ts'$/);

    const launched: Launch[] = [];
    const terminals = openTerminals({
      claude: "claude",
      shell: "/bin/zsh",
      node: "/usr/bin/node",
      ouvrirPty(l) {
        launched.push(l);
        return { ecrire: () => {}, redimensionner: () => {}, tuer: () => {} };
      },
      surSortie: () => {},
      surEtat: () => {},
    });
    terminals.espace({ nom: "brigade", dossier: "/projets/brigade" });
    const args = launched.at(0)?.args ?? assert.fail("aucun lancement");
    const settings = JSON.parse(args[args.indexOf("--settings") + 1] ?? "") as { hooks: { PreToolUse: { matcher?: string }[] } };
    assert.ok(settings.hooks.PreToolUse.some((c) => c.matcher === MATCHER));
  });

  test("le module n'écrit rien : aucun fichier du projet ne porte le crochet", () => {
    assert.doesNotMatch(readFileSync(SCRIPT, "utf8"), /writeFile|appendFile|\.claude\//);
  });
});

describe("le crochet joué à la main", () => {
  const play = (call: unknown, env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(call), encoding: "utf8", env: { ...process.env, ...env } });

  test("un refus : JSON permissionDecision deny, la raison nomme le geste du chef", () => {
    const r = play(bash("gh pr merge 12"));
    assert.equal(r.status, 0);
    const output = JSON.parse(r.stdout) as { hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string } };
    assert.equal(output.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /!gh pr merge 12 --squash/);
    assert.equal(r.stdout.trim(), outputOfHook(decide(bash("gh pr merge 12")) ?? assert.fail("pas de refus")));
  });

  test("le fichier du jeton, désigné par l'environnement de `claude`, est refusé", () => {
    assert.match(play(lit(TOKEN), { BRIGADE_CLAUDE_TOKEN_FILE: TOKEN }).stdout, /"deny"/);
  });

  test("un appel permis ne rend rien ; une entrée illisible non plus — sans bloquer", () => {
    for (const call of [bash("gh pr view 12"), lit("README.md")]) {
      const r = play(call);
      assert.deepEqual([r.status, r.stdout], [0, ""]);
    }
    const r = spawnSync(process.execPath, [SCRIPT], { input: "pas du json", encoding: "utf8" });
    assert.deepEqual([r.status, r.stdout], [0, ""]);
  });
});
