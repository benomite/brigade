// #4358 : un élément retenu apparaît une fois au TODO du chef, avec son auteur et un bouton
// « accept » ; recharger ou sonder de nouveau n'en crée pas une seconde.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHEF_TODO } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { aArreter, jusqua } from "../outils.ts";

test("l'issue d'un inconnu a une seule carte de TODO, nommant son auteur et offrant « accept », après plusieurs sondages", async (t) => {
  const c = cuisine(t, { issues: [issue(30, [])], manager: { suite: ["juge-ticket"] } });
  chef(c.repertoire, "manager.enabled");
  c.gh.decrire(30, { body: "Something from a stranger.", association: "NONE", author: "mallory" });
  const autre = ouvrirJournal(c.repertoire);
  aArreter(t, () => autre.fermer());
  const battre = () => void autre.ajouter({ project: c.runtime.projet, ticket: null, author: "runtime", type: "runtime.ticked", payload: { intervalMs: 100 } });
  const cartes = () => c.gh.commentaires.filter(([n, corps]) => n === 30 && corps.startsWith("<!-- brigade:todo kind="));

  battre();
  await jusqua(() => cartes().length === 1);
  for (let i = 0; i < 4; i++) {
    const depart = c.gh.sondages.ouvertes;
    battre();
    await jusqua(() => c.gh.sondages.ouvertes > depart);
  }

  assert.equal(cartes().length, 1, "une seule carte, malgré les sondages");
  assert.match(cartes()[0]?.[1] ?? "", /mallory/);
  assert.match(cartes()[0]?.[1] ?? "", /- \[accept\] /);
  assert.ok((c.gh.lire(30)?.labels ?? []).includes(CHEF_TODO));
  assert.equal(c.lancements().length, 0, "rien n'est donné à un agent tant que le chef n'a pas accepté");
});
