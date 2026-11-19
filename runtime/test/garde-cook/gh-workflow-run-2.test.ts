// #3876 : hors de sa branche, `gh workflow run` reste refusé, et le refus nomme la forme permise.
import assert from "node:assert/strict";
import { test } from "node:test";
import { jugerAppel, type Garde } from "../../src/garde-cook/garde.ts";

const garde: Garde = { worktree: "/w", temporaires: [], ticket: 3506, depot: "benomite/brigade", branche: "cook/3506-github" };
const gh = (args: string) => jugerAppel(garde, { tool_name: "Bash", tool_input: { command: `gh ${args}` }, cwd: "/w" }, { HOME: "/home/chef" });

test("gh workflow run without --ref, on another branch (main included) or in another repository is refused, naming the allowed form", () => {
  for (const args of [
    "workflow run ci.yml",
    "workflow run ci.yml -f action=essai",
    "workflow run ci.yml --ref main",
    "workflow run ci.yml --ref cook/3499-github",
    "workflow run ci.yml --ref=main -f a=b",
    "workflow run ci.yml --ref cook/3506-github -R autre/depot",
    "workflow run ci.yml --ref cook/3506-github --repo=autre/depot",
  ]) {
    const dit = gh(args);
    assert.match(dit ?? "", /^garde du cook — /, args);
    assert.ok(dit?.includes("gh workflow run") && dit.includes("--ref cook/3506-github"), `${args} : ${dit}`);
  }
});
