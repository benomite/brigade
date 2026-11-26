// #4218, critère 2 : plusieurs gates en échec → le message nomme chacune avec ses propres lignes d'erreur.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { verdictDesGates } from "../../src/brigade-github.ts";
import { jouerGates } from "../../src/gates.ts";
import { ENV_ENFANT, repertoireTemporaire } from "../outils.ts";

test("when several gates fail, the message names each failed gate with its own error lines", async (t) => {
  const racine = repertoireTemporaire(t);
  mkdirSync(join(racine, ".claude/brigade"), { recursive: true });
  const script = [
    "#!/usr/bin/env bash",
    'echo "  src/card.ts:12:5 error TS2322: Type string is not assignable to type number" >&2',
    'echo "FAIL  type check of the card is red" >&2',
    'for i in $(seq 1 200); do echo "ok    middle gate number $i, which passed"; done',
    'echo "  ✖ the button is shown on the card" >&2',
    'echo "  ✖ the card keeps its title on reload" >&2',
    'echo "FAIL  tests of the card are red" >&2',
    'for i in $(seq 1 200); do echo "ok    last gate number $i, which passed"; done',
    "exit 1",
  ].join("\n");
  writeFileSync(join(racine, ".claude/brigade/gates.sh"), `${script}\n`);
  chmodSync(join(racine, ".claude/brigade/gates.sh"), 0o755);

  const gates = await jouerGates({ worktree: racine, ticket: 4218, env: ENV_ENFANT, delaiMs: 2_000 });
  assert.equal(gates.outcome, "red");
  const verdict = verdictDesGates(gates, 2_000);
  const message = `${verdict.resume}\n${verdict.detail}`;

  for (const attendu of [
    /type check of the card is red/,
    /src\/card\.ts:12:5 error TS2322/,
    /tests of the card are red/,
    /✖ the button is shown on the card/,
    /✖ the card keeps its title on reload/,
  ]) assert.match(message, attendu);
  // Chaque gate vient avec ses seules lignes : son nom, ses lignes, puis la gate suivante.
  const place = (motif: RegExp) => message.search(motif);
  const premiere = place(/FAIL {2}type check of the card is red/);
  const seconde = place(/FAIL {2}tests of the card are red/);
  assert.ok(premiere < seconde, "the gates come in order");
  assert.ok(place(/src\/card\.ts:12:5/) > premiere && place(/src\/card\.ts:12:5/) < seconde, "the first gate's lines sit between its name and the second gate");
  for (const propre of [/✖ the button is shown/, /✖ the card keeps its title/]) assert.ok(place(propre) > seconde, "the second gate's lines come after its name");
});
