// #3911, criterion 3: no code path or UI flow requires the chef to reset a breaker. The manual reset is removed:
// the `/resume` comment the station reads on the breaker's issue, the « Resume » button of the app that posts it,
// and the status line that tells the chef to run `resume` to close the breaker. (`guardrails resume` still
// restarts a kitchen the chef stopped — that is the chef's own `stop`, not a breaker.)
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const RACINE = join(import.meta.dirname, "../../..");
const dans = (chemin: string) => join(RACINE, chemin);

test("the station no longer reads a `/resume` comment to close a breaker", () => {
  assert.equal(existsSync(dans("runtime/src/breaker-resume-github.ts")), false);
});

test("the app no longer posts `/resume` for the chef: no « Resume » flow on the breaker line", () => {
  assert.equal(existsSync(dans("app/src/github/breaker-resume.ts")), false);
  const ligne = dans("app/src/vue/todo-breaker-line.js");
  if (existsSync(ligne)) assert.doesNotMatch(readFileSync(ligne, "utf8"), /Resume|\/resume|poserReprise/);
});

test("`guardrails` status no longer tells the chef to `resume` to close an open breaker", () => {
  const cli = readFileSync(dans("runtime/src/garde-fous-cli.ts"), "utf8");
  assert.doesNotMatch(cli, /resume\W+to close it/);
});
