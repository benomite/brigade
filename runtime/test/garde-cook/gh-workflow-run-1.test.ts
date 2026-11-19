// #3876 : un cook lance un workflow de son dépôt sur sa branche, et le suit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { jugerAppel, type Garde } from "../../src/garde-cook/garde.ts";

const garde: Garde = { worktree: "/w", temporaires: [], ticket: 3506, depot: "benomite/brigade", branche: "cook/3506-github" };
const gh = (args: string) => jugerAppel(garde, { tool_name: "Bash", tool_input: { command: `gh ${args}` }, cwd: "/w" }, { HOME: "/home/chef" });

test("a cook dispatches a workflow of its repository on its own branch, with -f inputs, then follows the run", () => {
  for (const args of [
    "workflow run livekit-cluster-prototype.yml --ref cook/3506-github",
    "workflow run livekit-cluster-prototype.yml --ref cook/3506-github -f action=essai -f noeuds=4",
    "workflow run livekit-cluster-prototype.yml -f action=essai --ref=cook/3506-github",
    "workflow run livekit-cluster-prototype.yml -r cook/3506-github -f noeuds=4",
    "-R benomite/brigade workflow run ci.yml --ref cook/3506-github",
    "workflow run ci.yml --ref cook/3506-github -R benomite/brigade",
    "run list --workflow ci.yml",
    "run view 42",
    "run watch 42",
  ]) {
    assert.equal(gh(args), null, args);
  }
});
