// Un test bloqué ne retient pas la suite : la commande `test` du
// `package.json`, jouée avec ses propres options sur un fichier d'essai.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { aArreter, ENV_ENFANT, jusqua } from "./outils.ts";

const { scripts } = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")) as { scripts: { test: string } };

test("un test qui expire en tenant une poignée est rouge, nommé, et son fichier s'arrête", async (t) => {
  // Les options du lanceur telles que la suite les passe, au plafond près : le
  // vrai vaut des minutes.
  const options = (scripts.test.match(/--test\S*/g) ?? []).map((option) => option.replace(/^--test-timeout=\d+$/, "--test-timeout=500"));
  assert.ok(options.includes("--test-timeout=500"), scripts.test);

  const suite = spawn(process.execPath, [...options, join(import.meta.dirname, "aides/test-bloque.ts")], {
    env: ENV_ENFANT,
    stdio: ["ignore", "pipe", "pipe"],
    // Son propre groupe : le lanceur a un process par fichier, et tuer le
    // premier ne tue pas le second.
    detached: true,
  });
  let sortie = "";
  suite.stdout.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
  suite.stderr.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
  let code: number | null | undefined;
  suite.on("close", (recu) => (code = recu));
  aArreter(t, () => {
    try {
      if (suite.pid !== undefined) process.kill(-suite.pid, "SIGKILL");
    } catch {
      // Le groupe a déjà disparu : c'est ce qu'on attend.
    }
  });

  await jusqua(() => code !== undefined);

  assert.equal(code, 1);
  assert.match(sortie, /✖ un test qui ne rend pas la main[^\n]*\n\s+'test timed out after 500ms'/);
});
