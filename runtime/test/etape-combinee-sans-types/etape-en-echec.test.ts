// #4005 : le cook renvoyé sur une CI rouge reçoit l'étape en échec du check ; une étape illisible ne le retient pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lireLeRenvoi } from "../../src/brief-renvoi.ts";
import type { Check } from "../../src/events/pass.ts";

const rouge = (name: string): Check => ({ name, outcome: "red", conclusion: "failure", url: null });

test("a red check is given with its failed step; a step that cannot be read leaves the check to its annotations", async () => {
  const github = {
    commentaires: async () => [],
    annotationsDuCheck: async () => [{ chemin: null, ligne: null, titre: "", message: "exit code 1" }],
    journalDuCheck: async () => null,
    etapesEnEchec: async (check: { name: string }) => {
      if (check.name === "illisible") throw new Error("HTTP 410");
      return ["Run the runtime tests", "Upload"];
    },
  };
  const [dit, illisible] = (await lireLeRenvoi(github, { number: 7, sha: "d".repeat(40) }, [rouge("runtime"), rouge("illisible")], "")).rouges;
  assert.equal(dit!.sortie, "Failed steps: Run the runtime tests, Upload\n\nexit code 1");
  assert.equal(illisible!.sortie, "exit code 1");
});
