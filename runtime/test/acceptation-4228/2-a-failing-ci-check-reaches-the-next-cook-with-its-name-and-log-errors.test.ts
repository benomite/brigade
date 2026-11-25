// #4228, critère 2 : un check de CI rouge arrive au cook suivant avec son nom et les lignes d'erreur de son journal, même quand
// son annotation ne dit que le code de sortie et nomme un fichier (`.github`, comme GitHub l'écrit pour une étape de workflow).
import assert from "node:assert/strict";
import { test } from "node:test";
import { briefDuRenvoi, lireLeRenvoi } from "../../src/brief-renvoi.ts";
import type { Check } from "../../src/events/pass.ts";

test("the brief names the red CI check and carries the error lines of its log, whatever its annotation names (#4228)", async () => {
  const check: Check = { name: "runtime-windows", outcome: "red", conclusion: "failure", url: "https://github.com/o/r/actions/runs/7/job/31" };
  const journal = [
    "2026-11-20T10:00:00.0000000Z ##[group]Run npm --prefix runtime test",
    "2026-11-20T10:00:05.0000000Z ✖ the relaunch brief names the failing check (12.3ms)",
    "2026-11-20T10:00:05.0000000Z   AssertionError: expected the check to be named",
    "2026-11-20T10:00:06.0000000Z ##[error]Process completed with exit code 1.",
  ].join("\n");
  const github = {
    commentaires: async () => [],
    annotationsDuCheck: async () => [{ chemin: ".github", ligne: 1, titre: "runtime-windows", message: "Process completed with exit code 1." }],
    journalDuCheck: async () => journal,
  };
  const brief = briefDuRenvoi(await lireLeRenvoi(github, { number: 99, sha: "c".repeat(40) }, [check], ""), "main");

  assert.match(brief, /runtime-windows/);
  assert.match(brief, /✖ the relaunch brief names the failing check/);
  assert.match(brief, /AssertionError: expected the check to be named/);
});
