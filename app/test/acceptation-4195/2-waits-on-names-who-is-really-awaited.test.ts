// Test d'acceptation gelé (#4195). Critère 2 : « waits on » nomme qui est vraiment attendu — le chef seulement quand une carte lui demande quelque chose.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Tableau } from "../../src/faits.ts";
import type { VueDuProjet } from "../../src/second/contexte-du-blocage.ts";
import { deposerLaVue } from "../../src/second/vue-du-projet.ts";

const base = { attendu: false, attend: [], fiche: {}, ouvrable: true, dit: [] };
const tableau = {
  rail: {
    colonnes: [
      { nom: "TODO", ton: "", compte: "1", cartes: [{ ...base, ticket: 4100, etat: "todo", titre: "Pick a design", attendu: true, question: true }], vide: "" },
      { nom: "COOKING", ton: "", compte: "1", cartes: [{ ...base, ticket: 4200, etat: "cooking", titre: "A cook works on it", ligne: "cook on box" }], vide: "" },
      { nom: "IN PASS", ton: "", compte: "1", cartes: [{ ...base, ticket: 4300, etat: "in pass", titre: "The pass reviews it", ligne: "review running" }], vide: "" },
    ],
    hors: [],
  },
} as unknown as Tableau;

test("seule la carte qui pose une question au chef attend le chef ; un cook au travail et la pass ne l'attendent pas", () => {
  const vues = mkdtempSync(join(tmpdir(), "vue-4195-"));
  try {
    deposerLaVue("espace", tableau, vues);
    const vue = JSON.parse(readFileSync(join(vues, "espace.json"), "utf8")) as VueDuProjet;
    const attend = (n: number) => vue.rail.find((c) => c.number === n)!.waitsOn;
    assert.match(attend(4100), /chef/);
    assert.doesNotMatch(attend(4200), /chef/);
    assert.doesNotMatch(attend(4300), /chef/);
    assert.match(attend(4200), /cook/i);
    assert.match(attend(4300), /pass/i);
  } finally {
    rmSync(vues, { recursive: true, force: true });
  }
});
