// #4229, critère 2 : un cook peut changer un fichier de test dans sa propre PR sans blocage ; le flux accepte ce changement.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { ENV_ENFANT, repertoireTemporaire } from "../outils.ts";

test("a branch whose first commit adds a test and whose next commit changes it is accepted: no test file is flagged as touched", async (t) => {
  const racine = repertoireTemporaire(t);
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=essai", "-c", "user.email=essai@example.com", ...args], { cwd: racine, env: ENV_ENFANT, encoding: "utf8" }).trim();
  const ecrire = (chemin: string, texte: string) => {
    mkdirSync(dirname(join(racine, chemin)), { recursive: true });
    writeFileSync(join(racine, chemin), texte);
  };
  git("init", "-q", "-b", "main");
  ecrire("runtime/src/a.ts", "export const a = 1;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  git("checkout", "-q", "-b", "cook/1-github");
  ecrire("runtime/test/a.test.ts", "// v1\n");
  git("add", "-A");
  git("commit", "-q", "-m", "test(#1): first tests\n\nAcceptance-Tests: frozen");
  ecrire("runtime/test/a.test.ts", "// v2, fixed by the cook\n");
  git("add", "-A");
  git("commit", "-q", "-m", "fix(#1): the cook corrects its test");

  // The step that compared a changed test with its freeze is gone, or it flags nothing.
  // @ts-expect-error the module is removed with the step (#4229)
  const module = await import("../../src/passe-gel-tests/gel-tests.ts").catch(() => null);
  if (module !== null) assert.deepEqual(module.testsGelesTouches(racine, "main"), { fichiers: [], diff: "" });
});
