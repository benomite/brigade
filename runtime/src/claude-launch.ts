// What a cook's `claude` process is launched with: its arguments and its environment. Imports nothing of the old station.

// What a cook must not do itself: only the pass merges, and the station pushes. A good-faith guard, not a fence — the
// fence is that it gets no GitHub token and the repository's branch protection lets only the pass's identity merge.
// `git merge` is not listed: its instruction asks it to merge the base into its branch before its final gates, and a
// local merge touches no base — only a push would (#3789).
const FORBIDDEN = ["Bash(gh pr merge:*)", "Bash(git push:*)"];

// The variables through which `claude` would bill the kitchen by token, outside the Max plan.
const KEY_VARIABLES = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];

// The ones no launch inherits: the keys, and the Max connection's token, which only `jeton-claude.ts` hands back, and
// only to `claude`.
const TOKEN_VARIABLES = [...KEY_VARIABLES, "CLAUDE_CODE_OAUTH_TOKEN"];

// The settings sources a cook loads, among `user`, `project` and `local`: none. Without the list `claude` loads them
// all, and the cook inherits the service account's plugins, skills and hooks; `project` stays out too, since the served
// repository's settings can enable an installed plugin and carry hooks written for a session someone holds.
export const SETTING_SOURCES: string[] = [];

// There is no default calibration: whoever launches supplies the model and the effort. `--disallowedTools` comes last,
// it swallows everything after it. The instruction is not here: it goes in the cook's input, never on its command line
// (Linux caps one argument at 128 KiB, and `spawn` fails with `E2BIG`, #3655).
export function argumentsClaude(calibration: { model: string; effort: string }, session?: string): string[] {
  return [
    "-p",
    "--output-format", "stream-json", "--verbose", "--model", calibration.model, "--effort", calibration.effort,
    // Nobody is there to answer a permission request.
    "--permission-mode",
    "bypassPermissions",
    // An empty list is still passed: it is what cuts the sources.
    "--setting-sources",
    SETTING_SOURCES.join(","),
    // What the sources do not hold: the skills shipped with the binary or put in the account's directory, and the MCP
    // servers — the claude.ai account's too, which follow the Max connection.
    "--disable-slash-commands",
    "--strict-mcp-config",
    ...(session === undefined ? [] : ["--resume", session, "--fork-session"]),
    "--disallowedTools",
    ...FORBIDDEN,
  ];
}

// A cook's environment: the runtime's, without its state (a cook working on brigade would otherwise start a runtime on
// the journal that runs it) and without anything that diverts `claude` from the Max connection. Automatic memory is
// off: it lives under the account, per repository, and a cook would read what another left there.
export function environnementCook(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept = Object.entries(env).filter(([name]) => !name.startsWith("BRIGADE_") && !TOKEN_VARIABLES.includes(name));
  return { ...Object.fromEntries(kept), CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" };
}
