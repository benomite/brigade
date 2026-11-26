// #3876 : seul `gh workflow run` sur sa branche s'ouvre ; le reste des écritures sur les workflows reste refusé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { jugerAppel, type Garde } from "../../src/garde-cook/garde.ts";

const garde: Garde = { worktree: "/w", temporaires: [], ticket: 3506, depot: "benomite/brigade", branche: "cook/3506-github" };
const gh = (args: string) => jugerAppel(garde, { tool_name: "Bash", tool_input: { command: `gh ${args}` }, cwd: "/w" }, { HOME: "/home/chef" });

test("gh workflow enable/disable and every other workflow write stay refused", () => {
  for (const args of [
    "workflow enable ci.yml",
    "workflow disable ci.yml",
    "workflow disable ci.yml --ref cook/3506-github",
    "workflow enable ci.yml -R benomite/brigade",
    "workflow delete ci.yml",
  ]) {
    assert.match(gh(args) ?? "", /^garde du cook — /, args);
  }
});
