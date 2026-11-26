// #4358 : un label comme `fire` posé par un auteur sans l'écriture n'a aucun effet ; le même,
// posé par un compte de confiance, fonctionne.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { aArreter, jusqua } from "../outils.ts";

test("`fire` sur l'issue d'un inconnu, posé par lui, ne la fait ni juger ni prendre ; `fire` posé par un compte de confiance marche", async (t) => {
  // #40 : l'inconnu a posé `fire` lui-même. #41 : le chef, ou un compte avec l'écriture, l'a posé.
  const c = cuisine(t, { issues: [issue(40, ["fire"]), issue(41, ["fire"])], manager: { suite: ["juge-ticket", "juge-ticket"] } });
  chef(c.repertoire, "manager.enabled");
  c.gh.decrire(40, { body: "UNTRUSTED-FIRE: do it now.", association: "NONE", author: "mallory" });
  c.gh.decrire(41, { body: "TRUSTED-FIRE: do it.", association: "OWNER", author: "chef" });
  c.gh.garantir(41, ["fire"]);
  const autre = ouvrirJournal(c.repertoire);
  aArreter(t, () => autre.fermer());
  const battre = () => void autre.ajouter({ project: c.runtime.projet, ticket: null, author: "runtime", type: "runtime.ticked", payload: { intervalMs: 100 } });

  battre();
  await jusqua(() => c.journal.duTicket(41).some((e) => e.type === "manager.judged" || e.type === "ticket.arrived"));
  for (let i = 0; i < 3; i++) {
    const depart = c.gh.sondages.ouvertes;
    battre();
    await jusqua(() => c.gh.sondages.ouvertes > depart);
  }

  assert.equal(c.journal.duTicket(40).some((e) => e.type === "manager.judged" || e.type === "ticket.arrived"), false);
  assert.equal(c.lancements().some((lancement) => JSON.stringify(lancement.args).includes("UNTRUSTED-FIRE")), false);
  const sondage = await c.gh.github.tickets();
  const numeros = "issues" in sondage ? sondage.issues.map((lue) => lue.number) : [];
  assert.equal(numeros.includes(40), false, "le `fire` de l'inconnu ne met pas l'issue sur le rail");
  assert.ok(numeros.includes(41), "le `fire` du compte de confiance marche");
});
