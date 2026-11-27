// Test d'acceptation gelé (#4195). Critère 2 : « waits on » nomme qui est vraiment attendu — le chef seulement quand une carte lui demande quelque chose.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Board } from "../../src/facts.ts";
import type { VueOfProject } from "../../src/second/context-of-blockage.ts";
import { dropTheVue } from "../../src/second/vue-of-project.ts";

const base = { attendu: false, attend: [], fiche: {}, ouvrable: true, dit: [] };
const board = {
  rail: {
    colonnes: [
      { nom: "TODO", ton: "", compte: "1", cartes: [{ ...base, ticket: 4100, etat: "todo", titre: "Pick a design", attendu: true, question: true }], vide: "" },
      { nom: "COOKING", ton: "", compte: "1", cartes: [{ ...base, ticket: 4200, etat: "cooking", titre: "A cook works on it", ligne: "cook on box" }], vide: "" },
      { nom: "IN PASS", ton: "", compte: "1", cartes: [{ ...base, ticket: 4300, etat: "in pass", titre: "The pass reviews it", ligne: "review running" }], vide: "" },
    ],
    hors: [],
  },
} as unknown as Board;

test("seule la carte qui pose une question au chef attend le chef ; un cook au travail et la pass ne l'attendent pas", () => {
  const views = mkdtempSync(join(tmpdir(), "vue-4195-"));
  try {
    dropTheVue("espace", board, views);
    const vue = JSON.parse(readFileSync(join(views, "espace.json"), "utf8")) as VueOfProject;
    const awaiting = (n: number) => vue.rail.find((c) => c.number === n)!.waitsOn;
    assert.match(awaiting(4100), /chef/);
    assert.doesNotMatch(awaiting(4200), /chef/);
    assert.doesNotMatch(awaiting(4300), /chef/);
    assert.match(awaiting(4200), /cook/i);
    assert.match(awaiting(4300), /pass/i);
  } finally {
    rmSync(views, { recursive: true, force: true });
  }
});
