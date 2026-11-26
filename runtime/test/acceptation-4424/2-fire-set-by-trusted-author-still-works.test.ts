// #4424, critère 2 : le même label, posé par un compte de confiance, marche toujours.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { aArreter, jusqua } from "../outils.ts";

// brigade:guard
test("`fire` posé par un compte avec l'écriture sur l'issue d'un auteur de confiance la fait juger", async (t) => {
  const c = cuisine(t, { issues: [issue(41, ["fire"])], manager: { suite: ["juge-ticket"] } });
  chef(c.repertoire, "manager.enabled");
  c.gh.decrire(41, { body: "TRUSTED-FIRE: do it.", association: "OWNER", author: "chef" });
  c.gh.garantir(41, ["fire"]);
  const autre = ouvrirJournal(c.repertoire);
  aArreter(t, () => autre.fermer());

  void autre.ajouter({ project: c.runtime.projet, ticket: null, author: "runtime", type: "runtime.ticked", payload: { intervalMs: 100 } });
  await jusqua(() => c.journal.duTicket(41).some((e) => e.type === "manager.judged" || e.type === "ticket.arrived"));

  assert.ok(c.journal.duTicket(41).some((e) => e.type === "manager.judged" || e.type === "ticket.arrived"));
});
