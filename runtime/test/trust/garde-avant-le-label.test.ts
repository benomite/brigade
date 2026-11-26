// #4358 : la confiance se relit juste avant de poser les labels d'un jugement, et ce qui ne se lit pas ne décide rien.
// - La pause de GitHub n'est pas une panne : rien n'est jugé, et rien n'est dit — le tour suivant relit.
// - L'issue d'un inconnu lancée par le `fire` du chef, qui le retire pendant son jugement : sa confiance se relit
//   pour ses labels d'alors ; illisible, aucun label n'est posé, et c'est dit.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { LimiteGitHubAtteinte } from "../../src/limite-github.ts";
import { aArreter, jusqua, repertoireTemporaire } from "../outils.ts";

test("la permission lue pendant la pause de GitHub : ni jugement ni avertissement ; la pause finie, l'issue du chef est jugée", async (t) => {
  const c = cuisine(t, { issues: [issue(31, [])], manager: { suite: ["juge-ticket"] } });
  let pause = true;
  let lectures = 0;
  (c.gh.github as unknown as Record<string, unknown>).permissionDe = async (login: string) => {
    lectures++;
    if (pause) throw new LimiteGitHubAtteinte(Date.now() + 60_000, 60_000);
    return login === "chef" ? "admin" : "none";
  };
  c.gh.decrire(31, { body: "A real need from the chef.", association: "OWNER", author: "chef" });
  chef(c.repertoire, "manager.enabled");
  const autre = ouvrirJournal(c.repertoire);
  aArreter(t, () => autre.fermer());
  const battre = () => void autre.ajouter({ project: c.runtime.projet, ticket: null, author: "runtime", type: "runtime.ticked", payload: { intervalMs: 100 } });

  for (let i = 0; i < 2; i++) {
    const depart = lectures;
    battre();
    await jusqua(() => lectures > depart);
  }
  assert.equal(c.lancements().length, 0);
  assert.equal(c.avertissements.some((texte) => texte.includes("confiance non lue")), false, c.avertissements.join("\n"));

  pause = false;
  battre();
  await jusqua(() => (c.gh.lire(31)?.labels ?? []).includes("fire"));
});

test("le chef retire son `fire` de l'issue d'un inconnu pendant son jugement, et sa confiance ne se relit pas : aucun label n'est posé, c'est dit", async (t) => {
  const feu = join(repertoireTemporaire(t), "feu");
  const c = cuisine(t, { issues: [issue(30, ["fire"])], manager: { jugement: "juge-ticket-lent" }, env: { FAUX_CLAUDE_FEU: feu } });
  c.gh.decrire(30, { body: "Please add dark mode.", association: "NONE", author: "mallory" });
  c.gh.garantir(30, ["fire"]);
  chef(c.repertoire, "manager.enabled");
  await jusqua(() => c.lancements().length === 1);

  // Le chef retire son `fire` ; les commentaires de l'issue, où se lirait un accord, ne se lisent plus.
  c.gh.poser(issue(30, [], { updatedAt: "2026-10-08T11:00:00Z" }));
  c.gh.garantir(30, []);
  const commentaires = c.gh.github.commentaires;
  c.gh.github.commentaires = async () => {
    throw new Error("gh api : HTTP 502");
  };
  t.after(() => void (c.gh.github.commentaires = commentaires));
  writeFileSync(feu, "");
  await jusqua(() => c.avertissements.some((texte) => texte.includes("confiance non lue sur l'issue #30")));
  // Deux sondages de plus : un label posé après l'avertissement aurait eu le temps de l'être.
  const autre = ouvrirJournal(c.repertoire);
  aArreter(t, () => autre.fermer());
  for (let i = 0; i < 2; i++) {
    const depart = c.gh.sondages.ouvertes;
    autre.ajouter({ project: c.runtime.projet, ticket: null, author: "runtime", type: "runtime.ticked", payload: { intervalMs: 100 } });
    await jusqua(() => c.gh.sondages.ouvertes > depart);
  }

  assert.deepEqual(c.gh.labellisations, []);
  assert.deepEqual(c.gh.lire(30)?.labels, []);
});

test("le chef retire son `fire` de l'issue d'un inconnu pendant son jugement : elle est de nouveau retenue, rien ne la met sur le rail", async (t) => {
  const feu = join(repertoireTemporaire(t), "feu");
  const c = cuisine(t, { issues: [issue(30, ["fire"])], manager: { jugement: "juge-ticket-lent" }, env: { FAUX_CLAUDE_FEU: feu } });
  c.gh.decrire(30, { body: "Please add dark mode.", association: "NONE", author: "mallory" });
  c.gh.garantir(30, ["fire"]);
  chef(c.repertoire, "manager.enabled");
  await jusqua(() => c.lancements().length === 1);

  c.gh.poser(issue(30, [], { updatedAt: "2026-10-08T11:00:00Z" }));
  c.gh.garantir(30, []);
  writeFileSync(feu, "");
  const autre = ouvrirJournal(c.repertoire);
  aArreter(t, () => autre.fermer());
  await jusqua(() => {
    autre.ajouter({ project: c.runtime.projet, ticket: null, author: "runtime", type: "runtime.ticked", payload: { intervalMs: 100 } });
    return c.gh.commentaires.some(([n, corps]) => n === 30 && corps.includes("Held issue #30: accept it"));
  });

  assert.deepEqual(c.gh.labellisations.filter(([, labels]) => labels.some((label) => label === "fire" || label.startsWith("model:") || label.startsWith("effort:"))), []);
  assert.equal((c.gh.lire(30)?.labels ?? []).includes("fire"), false);
});
