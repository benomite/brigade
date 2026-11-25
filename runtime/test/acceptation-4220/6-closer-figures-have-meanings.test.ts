// #4220, critère 6 : le closer a des chiffres avec leur sens, dans la même forme que les autres agents.
// Contrat supposé par les tests d acceptation de #4220 (le cook le réalise, sans le changer) :
//   runtime/src/agents-tab/registre.ts  exporte REGISTRE : { id, name, role }[]
//   runtime/src/agents-tab/api.ts       exporte repondre({ method, url }, sources) -> { statut, corps }
//   sources (tous les champs sont facultatifs sauf maintenant) : { maintenant: Date, repertoireDesGestes?: string,
//     enCours?: { id, ticket: number | null }[], enEchec?: string[] /* id dont le dernier run a échoué sans reprise */ }
import assert from "node:assert/strict";
import { test } from "node:test";
import { repondre } from "../../src/agents-tab/api.ts";

type Chiffre = { label: string; value: unknown; meaning: string };
test("the closer entry has 2 or 3 figures shaped {label, value, meaning} like every other agent", () => {
  const liste = repondre({ method: "GET", url: "/api/agents" }, { maintenant: new Date("2026-11-25T12:00:00.000Z") }).corps as { id: string; figures: Chiffre[] }[];
  const closer = liste.find((a) => a.id === "closer");
  assert.ok(closer, "the closer is in the list");
  assert.ok(closer.figures.length === 2 || closer.figures.length === 3);
  const forme = (f: Chiffre) => Object.keys(f).sort().join(",");
  const autre = liste.find((a) => a.id !== "closer")?.figures[0] as Chiffre;
  for (const f of closer.figures) {
    assert.equal(forme(f), forme(autre));
    assert.ok(f.label.trim() !== "" && String(f.value).trim() !== "" && f.meaning.trim() !== "");
    assert.notEqual(f.meaning.trim(), f.label.trim());
  }
});
