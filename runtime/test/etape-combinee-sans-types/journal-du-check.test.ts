// #3806 : l'étape `Lint + Format + Typecheck + Test (en parallèle)` n'écrit
// d'annotation que « Process completed with exit code 1. », sans fichier. Le
// cook renvoyé sur ce check rouge ne savait pas quel gate l'était et repoussait
// à l'aveugle : il reçoit aussi la fin du journal de son job.
import assert from "node:assert/strict";
import { test } from "node:test";
import { briefDuRenvoi, lireLeRenvoi } from "../../src/brief-renvoi.ts";
import type { Check } from "../../src/events/pass.ts";

const pr = { number: 7, sha: "d".repeat(40) };
const rouge = (name: string): Check => ({ name, outcome: "red", conclusion: "failure", url: `https://github.com/o/r/actions/runs/1/job/${name.length}` });
const SANS_FICHIER = { chemin: null, ligne: null, titre: "", message: "Process completed with exit code 1." };
const JOURNAL = "2026-11-17T10:00:00.0000000Z > tsc --noEmit\nsrc/a.ts(3,1): error TS2322: Type 'string' is not assignable to type 'number'.\n##[error]Process completed with exit code 1.\n";

test("a red check whose annotations name no file is given with the end of its job's log; a check that names a file, or whose log cannot be read, is given by its annotations alone", async () => {
  const lus: string[] = [];
  const github = {
    commentaires: async () => [],
    annotationsDuCheck: async (check: Check) =>
      check.name === "tests (ubuntu)" ? [{ chemin: "test/a.test.ts", ligne: 4, titre: "tests (ubuntu)", message: "AssertionError: 1 !== 2" }] : [SANS_FICHIER],
    journalDuCheck: async (check: Check) => {
      lus.push(check.name);
      if (check.name === "illisible") throw new Error("HTTP 410");
      if (check.name === "sans journal") return null;
      return JOURNAL;
    },
  };
  const renvoi = await lireLeRenvoi(github, pr, [rouge("Lint + Format + Typecheck + Tests"), rouge("tests (ubuntu)"), rouge("illisible"), rouge("sans journal")], "");
  const [combine, nomme, illisible, sansJournal] = renvoi.rouges;

  assert.ok(combine!.sortie.startsWith("Process completed with exit code 1.\n\nThe end of the job's log:\n"), combine!.sortie);
  assert.match(combine!.sortie, /src\/a\.ts\(3,1\): error TS2322/);
  assert.equal(nomme!.sortie, "test/a.test.ts:4 — tests (ubuntu)\nAssertionError: 1 !== 2");
  assert.equal(illisible!.sortie, "Process completed with exit code 1.");
  assert.equal(sansJournal!.sortie, "Process completed with exit code 1.");
  // Le journal d'un check dont une annotation nomme un fichier n'est pas lu.
  assert.deepEqual(lus, ["Lint + Format + Typecheck + Tests", "illisible", "sans journal"]);
  assert.match(briefDuRenvoi(renvoi, "main"), /the end of its job's log, where the red tool wrote its errors/);
});
