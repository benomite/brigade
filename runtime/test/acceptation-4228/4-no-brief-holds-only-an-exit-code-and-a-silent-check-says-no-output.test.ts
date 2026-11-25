// #4228, critère 4 : aucun brief ne tient dans un code de sortie. Un check qui ne donne aucune sortie est nommé, avec « no output ».
import assert from "node:assert/strict";
import { test } from "node:test";
import { briefDuRenvoi, lireLeRenvoi } from "../../src/brief-renvoi.ts";
import type { Check } from "../../src/events/pass.ts";

const rouge = (name: string): Check => ({ name, outcome: "red", conclusion: "failure", url: `https://github.com/o/r/actions/runs/1/job/${name.length}` });

test("a red check that gives no output is named with « no output », and none of the checks is told by its exit code alone (#4228)", async () => {
  const github = {
    commentaires: async () => [],
    annotationsDuCheck: async (check: Check) => (check.name === "silent-check" ? [] : [{ chemin: null, ligne: null, titre: check.name, message: "Process completed with exit code 1." }]),
    journalDuCheck: async (check: Check) => (check.name === "silent-check" ? null : "##[group]Run npm test\n✖ the exit-only check has a failing test (3ms)\n##[error]Process completed with exit code 1."),
  };
  const brief = briefDuRenvoi(await lireLeRenvoi(github, { number: 99, sha: "c".repeat(40) }, [rouge("silent-check"), rouge("exit-only-check")], ""), "main");

  assert.match(brief, /silent-check[\s\S]*?no output/i);
  assert.match(brief, /exit-only-check/);
  assert.match(brief, /✖ the exit-only check has a failing test/);
});
