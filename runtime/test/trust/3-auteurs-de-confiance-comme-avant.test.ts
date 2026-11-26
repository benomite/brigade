// #4358 : l'issue ou le commentaire du chef, d'un collaborateur avec l'écriture ou d'un agent
// de la cuisine passe comme avant.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { jusqua } from "../outils.ts";

// brigade:guard
test("les issues du chef, d'un collaborateur et d'un agent sont jugées, et leurs commentaires lus", async (t) => {
  const c = cuisine(t, { issues: [issue(31, []), issue(32, []), issue(33, [])], manager: { suite: ["juge-ticket", "juge-ticket", "juge-ticket"] } });
  chef(c.repertoire, "manager.enabled");
  c.gh.decrire(31, { body: "From the chef.", association: "OWNER", author: "chef" });
  c.gh.decrire(32, { body: "From a collaborator.", association: "COLLABORATOR", author: "sam" });
  c.gh.decrire(33, { body: "From the kitchen robot.", association: "NONE", author: "github-actions[bot]" });
  c.gh.repondre(31, "NOTE-CHEF: please keep it small.", "OWNER", "chef");
  c.gh.repondre(32, "NOTE-COLLAB: see the other ticket.", "COLLABORATOR", "sam");

  await jusqua(() => [31, 32, 33].every((n) => (c.gh.lire(n)?.labels ?? []).includes("fire")));

  const consignes = c.lancements().map((lancement) => JSON.stringify(lancement.args)).join("\n");
  assert.match(consignes, /NOTE-CHEF/);
  assert.match(consignes, /NOTE-COLLAB/);
  for (const n of [31, 32, 33]) assert.ok(c.journal.duTicket(n).some((e) => e.type === "manager.judged" || e.type === "ticket.arrived"), `#${n} jugée`);
});
