// #4218, critère 1 : gate rouge → le message au cook nomme la gate en échec et donne ses lignes d'erreur, jamais un simple code de sortie.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { verdictDesGates } from "../../src/brigade-github.ts";
import { jouerGates } from "../../src/gates.ts";
import { ENV_ENFANT, repertoireTemporaire } from "../outils.ts";

test("when a gate is red, the message to the cook names the failed gate and gives its error lines, not only an exit code", async (t) => {
  const racine = repertoireTemporaire(t);
  mkdirSync(join(racine, ".claude/brigade"), { recursive: true });
  // Une gate rouge, suivie de beaucoup de sortie d'autres gates : la fin de la sortie ne la montre plus.
  const script = [
    "#!/usr/bin/env bash",
    'echo "  src/card.ts:12:5 error TS2322: Type string is not assignable to type number" >&2',
    'echo "  src/card.ts:40:9 error TS2304: Cannot find name cardTitle" >&2',
    'echo "FAIL  type check of the card is red" >&2',
    'for i in $(seq 1 400); do echo "ok    later gate number $i, which passed"; done',
    "exit 1",
  ].join("\n");
  writeFileSync(join(racine, ".claude/brigade/gates.sh"), `${script}\n`);
  chmodSync(join(racine, ".claude/brigade/gates.sh"), 0o755);

  const gates = await jouerGates({ worktree: racine, ticket: 4218, env: ENV_ENFANT, delaiMs: 2_000 });
  assert.equal(gates.outcome, "red");
  const verdict = verdictDesGates(gates, 2_000);
  const message = `${verdict.resume}\n${verdict.detail}`;

  assert.match(message, /type check of the card is red/, "the message names the failed gate");
  assert.match(message, /src\/card\.ts:12:5 error TS2322: Type string is not assignable to type number/, "it gives the error lines of that gate");
  assert.match(message, /src\/card\.ts:40:9 error TS2304: Cannot find name cardTitle/);
  assert.doesNotMatch(verdict.resume, /^exit code \d+$/, "the summary is never only an exit code");
});
