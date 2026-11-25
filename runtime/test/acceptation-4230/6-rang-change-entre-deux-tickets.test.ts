// #4230, criterion 6: the chef changes one rank in the project sheet only. On the next ticket the new rank applies,
// with no other edit and no restart. On real git repositories, without network (`aides/projet-sur-git.ts`): the
// station reads the sheet on its clone's base, as last fetched.
import assert from "node:assert/strict";
import { test } from "node:test";
import { gestesEnAttente } from "../../src/autonomie/agents/porte.ts";
import { texteDuFichier, type ReglagesProjet } from "../../src/reglages-projet/reglages.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { cuisine } from "./aide.ts";

const FICHE: ReglagesProjet = { integrationBranch: "main", risks: { publish: "chef" } };

test("the chef ranks `publish` 'safe' in the project sheet between two tickets: the first is parked, the next is merged, by the same station", async (t) => {
  const { clone, merger, rapatrier } = projetSurGit(t, { reglages: FICHE, parDefaut: "main" });
  const { repertoire, faux, ticket, tours } = cuisine(t, { clone });
  ticket(1, "publish");
  await tours(3);
  assert.equal(faux.mergee(1), undefined);
  assert.deepEqual(gestesEnAttente(repertoire).map(({ line }) => line.replace(/PR #\d+/, "PR")), ["merge PR of #1, which will publish: ticket 1"]);

  // One rank changed in the sheet, merged on the base and fetched as the station does before each pass: nothing else.
  merger("main", texteDuFichier({ ...FICHE, risks: { publish: "safe" } }));
  rapatrier();
  ticket(2, "publish");
  await tours(4);
  assert.notEqual(faux.mergee(2), undefined);
  assert.equal(faux.ticket(2).state, "closed");
  assert.ok(gestesEnAttente(repertoire).every(({ line }) => !line.includes("of #2")), JSON.stringify(gestesEnAttente(repertoire)));
});

test("the chef ranks a kind 'chef' that was 'safe': the next ticket of that kind is parked", async (t) => {
  const { clone, merger, rapatrier } = projetSurGit(t, { reglages: { integrationBranch: "main" }, parDefaut: "main" });
  const { repertoire, faux, ticket, tours } = cuisine(t, { clone });
  ticket(1, "fix-typo");
  await tours(3);
  assert.notEqual(faux.mergee(1), undefined);
  assert.deepEqual(gestesEnAttente(repertoire), []);

  merger("main", texteDuFichier({ integrationBranch: "main", risks: { "fix-typo": "chef" } }));
  rapatrier();
  ticket(2, "fix-typo");
  await tours(4);
  assert.equal(faux.mergee(2), undefined);
  assert.deepEqual(gestesEnAttente(repertoire).map(({ line, reason }) => ({ line: line.replace(/PR #\d+/, "PR"), reason })), [{ line: "merge PR of #2, which will fix a typo: ticket 2", reason: "its kind of action is ranked 'chef' in the project's risk ranking: fix-typo" }]);
});

test("a project sheet that cannot be read parks the delivery for the chef and says why: nothing is guessed in its place", async (t) => {
  const { clone, merger, rapatrier } = projetSurGit(t, { reglages: { integrationBranch: "main" }, parDefaut: "main" });
  merger("main", "{ not json");
  rapatrier();
  const { repertoire, faux, ticket, tours } = cuisine(t, { clone });
  ticket(1, "fix-typo");
  await tours(3);
  assert.equal(faux.mergee(1), undefined);
  assert.match(gestesEnAttente(repertoire)[0]?.reason ?? "", /^the project sheet's risk ranking cannot be read \(`\.claude\/brigade\/projet\.json` is not valid JSON\)$/);
});
