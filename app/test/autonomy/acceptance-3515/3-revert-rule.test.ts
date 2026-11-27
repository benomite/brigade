// #3515, critère 4 : un revert ne compte que si un commit de la branche par défaut porte le trailer de git
// « This reverts commit <sha> » et que le commit reverté appartient à un ticket servi ; le revert d'un commit hors des
// tickets servis n'est pas compté. Test d'acceptation : le calcul de l'app sur l'échantillon commité, sans GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chiffresDAutonomie } from "../../../src/vue/autonomy/compute.ts";
import { avec, MAINTENANT, sha } from "./sample.ts";

// In the sample, 1111… is a commit of #101 (served), 2222… of no ticket, 4444… of #105 (merged without `fire`).
const revert = (de: string, message: string) => ({ sha: sha(de), commit: { message, committer: { date: "2026-11-10T00:00:00Z" } } });
const comptes = (reverts: object[]) => chiffresDAutonomie([avec({ reverts })], 7, MAINTENANT).reverts?.map((un) => ({ sha: un.sha, tickets: un.tickets }));

test("a commit with git's trailer reverting a served ticket's commit counts", () => {
  assert.deepEqual(comptes([revert("7", `Revert "x"\n\nThis reverts commit ${sha("1")}.`)]), [{ sha: sha("7"), tickets: [101] }]);
});

test("a revert of a commit outside served tickets, or a message without the trailer, is not counted", () => {
  assert.deepEqual(comptes([revert("7", `Revert "chore"\n\nThis reverts commit ${sha("2")}.`)]), []);
  assert.deepEqual(comptes([revert("7", `Revert "docs"\n\nThis reverts commit ${sha("4")}.`)]), []);
  assert.deepEqual(comptes([revert("7", `Revert the wording of ${sha("1")}`)]), []);
});
