// #4358 : après l'accord du chef, l'issue est jugée et lue comme toute autre, et sa carte
// disparaît du TODO ; l'accord est gardé : la cuisine ne redemande pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHEF_TODO } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { aArreter, jusqua } from "../outils.ts";

test("« accept » du chef : l'issue retenue est jugée et mise sur le rail, la carte est levée, aucune nouvelle ne revient", async (t) => {
  const c = cuisine(t, { issues: [issue(30, [])], manager: { suite: ["juge-ticket"] } });
  chef(c.repertoire, "manager.enabled");
  c.gh.decrire(30, { body: "PLANTED-BUT-ACCEPTED: export the CSV header.", association: "NONE", author: "mallory" });
  const autre = ouvrirJournal(c.repertoire);
  aArreter(t, () => autre.fermer());
  const battre = () => void autre.ajouter({ project: c.runtime.projet, ticket: null, author: "runtime", type: "runtime.ticked", payload: { intervalMs: 100 } });
  const cartes = () => c.gh.commentaires.filter(([n, corps]) => n === 30 && corps.startsWith("<!-- brigade:todo kind="));

  battre();
  await jusqua(() => cartes().length === 1);
  assert.equal(c.lancements().length, 0);

  // Le chef accepte : un commentaire de sa main, l'issue en est modifiée.
  c.gh.repondre(30, "accept", "OWNER", "chef");
  const lue = c.gh.lire(30);
  if (lue) c.gh.poser({ ...lue, updatedAt: "2026-10-08T11:00:00.000Z" });
  battre();

  await jusqua(() => (c.gh.lire(30)?.labels ?? []).includes("fire"));
  assert.equal((c.gh.lire(30)?.labels ?? []).includes(CHEF_TODO), false, "la carte a disparu du TODO");
  assert.ok(c.lancements().some((lancement) => JSON.stringify(lancement.args).includes("PLANTED-BUT-ACCEPTED")), "le manager lit l'issue acceptée");
  assert.ok(c.journal.duTicket(30).some((e) => e.type === "manager.judged" || e.type === "ticket.arrived"));

  // L'accord est gardé : de nouveaux sondages ne reposent aucune carte.
  const avant = cartes().length;
  for (let i = 0; i < 3; i++) {
    const depart = c.gh.sondages.ouvertes;
    battre();
    await jusqua(() => c.gh.sondages.ouvertes > depart);
  }
  assert.equal(cartes().length, avant);
  assert.equal((c.gh.lire(30)?.labels ?? []).includes(CHEF_TODO), false);
});
