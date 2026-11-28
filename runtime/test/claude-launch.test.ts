// What a cook's `claude` is launched with: its arguments and its environment (claude-launch.ts).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { argumentsClaude, cookEnvironment, SETTING_SOURCES } from "../src/claude-launch.ts";
import { ENV_ENFANT, FAUX_CLAUDE, lancementsDuFauxClaude, repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const CALIBRAGE = { model: "sonnet", effort: "medium" };

test("le binaire est lancé en flux JSON, avec le calibrage du ticket, et la consigne lue sur son entrée", () => {
  const args = argumentsClaude(CALIBRAGE);

  assert.deepEqual(args.slice(0, 8), ["-p", "--output-format", "stream-json", "--verbose", "--model", "sonnet", "--effort", "medium"]);
});

test("un cook n'attend aucune permission, mais ni le merge ni le push ne lui sont ouverts", () => {
  const args = argumentsClaude(CALIBRAGE);

  assert.equal(args[args.indexOf("--permission-mode") + 1], "bypassPermissions");
  const interdits = args.slice(args.indexOf("--disallowedTools") + 1);
  assert.deepEqual(interdits, ["Bash(gh pr merge:*)", "Bash(git push:*)"]);
});

test("un cook ne charge aucune source de réglages, aucune skill, aucun serveur MCP", () => {
  const args = argumentsClaude(CALIBRAGE);

  assert.deepEqual(SETTING_SOURCES, []);
  assert.equal(args[args.indexOf("--setting-sources") + 1], "");
  assert.ok(args.includes("--disable-slash-commands"));
  assert.ok(args.includes("--strict-mcp-config"));
  assert.ok(!args.includes("--mcp-config") && !args.includes("--plugin-dir") && !args.includes("--settings"));
  // Les interdits restent les derniers : `--disallowedTools` avale ce qui le suit.
  assert.deepEqual(args.slice(args.indexOf("--disallowedTools") + 1), ["Bash(gh pr merge:*)", "Bash(git push:*)"]);
});

test("le binaire reçoit ces arguments tels quels, la liste vide des sources comprise", { skip: posixOnly("runs test/aides/faux-claude.sh with the cook's arguments through execFileSync and checks it receives them verbatim, the empty --setting-sources included; Node on Windows cannot execute a shebang script directly (EFTYPE)") }, (t) => {
  const temoin = repertoireTemporaire(t);
  const args = argumentsClaude(CALIBRAGE);

  execFileSync(FAUX_CLAUDE, args, { env: { ...ENV_ENFANT, FAUX_CLAUDE: "fini", FAUX_CLAUDE_TEMOIN: temoin } });

  const recu = lancementsDuFauxClaude(temoin)[0]?.args ?? [];
  assert.deepEqual(recu, args);
  assert.deepEqual(recu.slice(recu.indexOf("--setting-sources"), recu.indexOf("--setting-sources") + 2), ["--setting-sources", ""]);
});

test("le cook ne reçoit ni l'état du runtime ni une clé d'API, et pas la mémoire du compte", () => {
  const env = cookEnvironment({
    PATH: "/usr/bin",
    HOME: "/home/brigade",
    BRIGADE_STATE_DIR: "/var/lib/brigade/x",
    BRIGADE_PROJECT: "x",
    ANTHROPIC_API_KEY: "sk-…",
    ANTHROPIC_AUTH_TOKEN: "t",
    CLAUDE_CODE_OAUTH_TOKEN: "t",
  });

  assert.deepEqual(env, { PATH: "/usr/bin", HOME: "/home/brigade", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" });
});

test("a cook may merge the base into its branch: git merge is not forbidden (#3789)", () => {
  const args = argumentsClaude(CALIBRAGE);
  assert.ok(!args.slice(args.indexOf("--disallowedTools") + 1).includes("Bash(git merge:*)"));
});

test("a resumed cook forks the session it resumes", () => {
  const args = argumentsClaude(CALIBRAGE, "abc");
  assert.deepEqual(args.slice(args.indexOf("--resume"), args.indexOf("--resume") + 3), ["--resume", "abc", "--fork-session"]);
});
