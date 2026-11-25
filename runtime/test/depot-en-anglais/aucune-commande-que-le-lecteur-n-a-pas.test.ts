// Aucun message écrit sur le dépôt ne dit à son lecteur de taper une commande qu'il ne peut pas avoir (#4056) : les
// gestes `brigade <projet> …` sont ceux de la box du chef, qu'un nouveau venu n'a pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { MARQUEUR_MANAGER } from "../../src/juger.ts";
import { jusqua } from "../outils.ts";

test("le commentaire du manager sur un ticket mis sur le rail ne cite aucune commande `brigade <projet> …`", async (t) => {
  const c = cuisine(t, { manager: {}, issues: [issue(30, [])] });
  chef(c.repertoire, "manager.enabled");
  const dits = () => c.gh.commentaires.filter(([n, corps]) => n === 30 && corps.includes(MARQUEUR_MANAGER)).map(([, corps]) => corps);
  await jusqua(() => dits().length === 1);
  for (const dit of dits()) assert.doesNotMatch(dit, /`brigade \S+ [a-z]/);
});
