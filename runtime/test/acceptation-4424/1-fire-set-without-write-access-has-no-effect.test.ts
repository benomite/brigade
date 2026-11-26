// #4424, critère 1 : un label comme `fire` posé par un compte sans l'écriture n'a aucun effet — même sur l'issue d'un
// auteur de confiance. Le runtime lit qui a posé le label (les événements de l'issue), pas qui a écrit l'issue.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { aArreter, jusqua } from "../outils.ts";

test("`fire` posé par un compte sans l'écriture, sur l'issue d'un auteur de confiance, ne la fait ni juger ni prendre", async (t) => {
  const c = cuisine(t, { issues: [issue(40, ["fire"]), issue(41, ["fire"])], manager: { suite: ["juge-ticket", "juge-ticket"] } });
  chef(c.repertoire, "manager.enabled");
  // #40 : l'issue est du chef, mais GitHub ne nomme aucun compte de confiance pour son `fire`. #41 : témoin, `fire` posé par un compte avec l'écriture.
  c.gh.decrire(40, { body: "UNTRUSTED-FIRE: do it now.", association: "OWNER", author: "chef" });
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

  assert.equal(c.journal.duTicket(40).some((e) => e.type === "manager.judged" || e.type === "ticket.arrived"), false, "le `fire` sans garant n'a aucun effet");
  assert.equal(c.lancements().some((lancement) => JSON.stringify(lancement.args).includes("UNTRUSTED-FIRE")), false);
});
