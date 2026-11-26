// #4358 : la permission d'un auteur qui ne se lit pas ne décide rien à sa place — l'issue du chef
// n'est ni retenue ni jugée, aucune carte ne part —, et le tour suivant la relit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { aArreter, jusqua } from "../outils.ts";

test("la permission du chef illisible : ni carte ni jugement, c'est dit ; lisible, son issue est jugée", async (t) => {
  const c = cuisine(t, { issues: [issue(31, [])], manager: { suite: ["juge-ticket"] } });
  let panne = true;
  (c.gh.github as unknown as Record<string, unknown>).permissionDe = async (login: string) => {
    if (panne) throw new Error("gh api : HTTP 502");
    return login === "chef" ? "admin" : "none";
  };
  c.gh.decrire(31, { body: "A real need from the chef.", association: "OWNER", author: "chef" });
  chef(c.repertoire, "manager.enabled");
  const autre = ouvrirJournal(c.repertoire);
  aArreter(t, () => autre.fermer());
  const battre = () => void autre.ajouter({ project: c.runtime.projet, ticket: null, author: "runtime", type: "runtime.ticked", payload: { intervalMs: 100 } });

  await jusqua(() => c.avertissements.some((texte) => texte.includes("confiance non lue sur l'issue #31")));
  for (let i = 0; i < 2; i++) {
    const depart = c.gh.sondages.ouvertes;
    battre();
    await jusqua(() => c.gh.sondages.ouvertes > depart);
  }
  assert.equal(c.lancements().length, 0);
  assert.equal(c.gh.commentaires.some(([n]) => n === 31), false, "aucune carte sur l'issue du chef");

  panne = false;
  battre();
  await jusqua(() => (c.gh.lire(31)?.labels ?? []).includes("fire"));
  assert.equal(c.gh.commentaires.some(([n, corps]) => n === 31 && corps.includes("Held issue")), false);
});
