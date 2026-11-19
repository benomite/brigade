// Un test d'acceptation gelé faux, par la station (#3799) : le setup du projet
// qui échoue sur le worktree de la relecture est dit au journal, et le contrôle
// des types qu'il devait rendre possible n'a pas lieu ; un ticket mis de côté
// par ses tests gelés faux ne reçoit sur sa PR que la raison de sa mise de côté.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BON_CAS, ENTETE, livre, TICKET } from "./station-du-gel.ts";

const CAS_QUI_NE_TYPE_PAS = 'test("sums three numbers", () => assert.equal(somme(1, 2, 3), 6));\n';

test("a project setup that fails on the review's worktree is said in the station's log, the types go unchecked, and the delivery is judged as before", async (t) => {
  const { faux, avertis, testsGelesSurLaBranche } = await livre(t, ENTETE + BON_CAS + CAS_QUI_NE_TYPE_PAS, {
    base: { "tsconfig.json": "{}\n", ".claude/brigade/worktree-setup.sh": "#!/bin/sh\necho 'npm ci: lockfile out of date' >&2\nexit 3\n" },
    station: { setup: { delaiMs: 2_000 } },
  });
  assert.ok(avertis.some((ligne) => /`\.claude\/brigade\/worktree-setup\.sh` failed on the review's worktree \(exit code 3\)/.test(ligne)), avertis.join("\n"));
  assert.ok(avertis.some((ligne) => /the types of the frozen acceptance tests under `\.` are not checked: no TypeScript compiler is installed there/.test(ligne)), avertis.join("\n"));
  assert.equal(faux.mergee(TICKET)?.mergeePar, "box");
  assert.ok((testsGelesSurLaBranche() ?? "").includes(CAS_QUI_NE_TYPE_PAS.trim()), "nothing is dropped on a check that did not run");
});

test("a ticket set aside by its wrong frozen tests gets on its PR only the reason it is set aside, not a send-back to a cook", async (t) => {
  const { faux, surLaPR } = await livre(t, ENTETE + 'test("somme is a function", () => assert.equal(typeof somme, "function"));\n', { tours: 3 });
  assert.equal(faux.mergee(TICKET), undefined);
  const verdicts = surLaPR.filter((corps) => corps.startsWith("<!-- brigade:verdict"));
  assert.equal(verdicts.length, 1, "one verdict, not one per turn");
  assert.match(verdicts[0] ?? "", /\n\nSet aside: the frozen acceptance test `somme is a function` \(`lib\/41\.test\.ts`\) already passes on `main`: dropping it would leave `lib\/41\.test\.ts` with no case to prove its criterion\.$/);
  assert.doesNotMatch(verdicts[0] ?? "", /cook|Mutation check|Red on main/i, "nothing tells a cook to fix it");
});
