// #3515, critère 3 : un bug n'est échappé que s'il porte le label `bug`, a été créé après que le ticket qu'il cite a été servi,
// et cite son numéro dans son titre ou son corps ; un bug qui ne cite aucun ticket servi n'est pas compté.
// Test d'acceptation : le calcul de l'app sur l'échantillon commité, sans GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chiffresDAutonomie } from "../../../../runtime/src/autonomie/compute.ts";
import { avec, MAINTENANT } from "./sample.ts";

// #101 is served on 2026-11-05 at 10:00.
const bug = (number: number, created_at: string, title: string, body: string, labels = ["bug"]) => ({ number, created_at, title, body, labels: labels.map((name) => ({ name })), html_url: `https://github.com/chef/parade/issues/${number}` });
const echappes = (bugs: object[]) => chiffresDAutonomie([avec({ bugs })], 7, MAINTENANT).bugsEchappes?.map(({ bug, tickets }) => ({ bug, tickets }));

test("a bug-labelled issue created after the ticket was served, citing it in its body or title, is escaped", () => {
  assert.deepEqual(echappes([bug(301, "2026-11-06T00:00:00Z", "Blank rail", "Since #101.")]), [{ bug: 301, tickets: [101] }]);
  assert.deepEqual(echappes([bug(302, "2026-11-06T00:00:00Z", "Regression of #101", "")]), [{ bug: 302, tickets: [101] }]);
});

test("a bug created before the ticket was served, without the bug label, or citing no served ticket, is not counted", () => {
  assert.deepEqual(echappes([bug(303, "2026-11-05T09:00:00Z", "Blank rail", "While #101 cooked.")]), []);
  assert.deepEqual(echappes([bug(304, "2026-11-06T00:00:00Z", "Blank rail", "Since #101.", ["enhancement"])]), []);
  assert.deepEqual(echappes([bug(305, "2026-11-06T00:00:00Z", "Crash", "See #999.")]), []);
  assert.deepEqual(echappes([bug(306, "2026-11-06T00:00:00Z", "Crash", "No ticket named.")]), []);
});
