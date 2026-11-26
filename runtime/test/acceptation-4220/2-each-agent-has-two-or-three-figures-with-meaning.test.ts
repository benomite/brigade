// #4220, critère 2 : 2 ou 3 chiffres par agent, chacun avec label, value et meaning non vides.
// Contrat supposé par les tests d acceptation de #4220 (le cook le réalise, sans le changer) :
//   runtime/src/agents-tab/registre.ts  exporte REGISTRE : { id, name, role }[]
//   runtime/src/agents-tab/api.ts       exporte repondre({ method, url }, sources) -> { statut, corps }
//   sources (tous les champs sont facultatifs sauf maintenant) : { maintenant: Date, repertoireDesGestes?: string,
//     enCours?: { id, ticket: number | null }[], enEchec?: string[] /* id dont le dernier run a échoué sans reprise */ }
import assert from "node:assert/strict";
import { test } from "node:test";
import { repondre } from "../../src/agents-tab/api.ts";

test("every entry has 2 or 3 figures, each with a non-empty label, value and meaning", () => {
  const { corps } = repondre({ method: "GET", url: "/api/agents" }, { maintenant: new Date("2026-11-25T12:00:00.000Z") });
  const liste = corps as { id: string; figures: { label: unknown; value: unknown; meaning: unknown }[] }[];
  assert.ok(liste.length > 0);
  for (const { id, figures } of liste) {
    assert.ok(figures.length === 2 || figures.length === 3, `${id}: ${figures.length} figures`);
    for (const f of figures) {
      for (const champ of ["label", "value", "meaning"] as const) {
        const v = f[champ];
        assert.ok((typeof v === "string" && v.trim() !== "") || typeof v === "number", `${id}: ${champ} is empty`);
      }
      assert.ok(typeof f.meaning === "string" && f.meaning.trim() !== "", `${id}: meaning must be a sentence`);
    }
  }
});
