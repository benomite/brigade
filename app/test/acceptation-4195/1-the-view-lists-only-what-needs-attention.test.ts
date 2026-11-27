// Test d'acceptation gelé (#4195). Critère 1 : la vue du second ne liste que ce que le chef voit demander de l'attention, pas les cartes servies.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Board } from "../../src/facts.ts";
import type { VueOfProject } from "../../src/second/context-of-blockage.ts";
import { dropTheVue } from "../../src/second/vue-of-project.ts";

const base = { attendu: false, attend: [], fiche: {}, dit: [] };
const servedOnes = [4001, 4002, 4003].map((ticket) => ({ ...base, ticket, etat: "served", titre: `Served ${ticket}`, ouvrable: true }));
const board = {
  rail: {
    colonnes: [
      { nom: "TODO", ton: "", compte: "1", cartes: [{ ...base, ticket: 4100, etat: "todo", titre: "Pick a design", ouvrable: true, attendu: true, question: true }], vide: "" },
      { nom: "WAITING", ton: "", compte: "1", cartes: [{ ...base, ticket: 4047, etat: "waiting", titre: "Stuck card", ouvrable: true, enWaiting: true }], vide: "" },
      { nom: "SERVED", ton: "", compte: "3", cartes: servedOnes, vide: "" },
    ],
    hors: [],
  },
} as unknown as Board;

test("la vue déposée pour le second ne porte aucune carte servie, et garde la carte du TODO du chef et la carte coincée", () => {
  const views = mkdtempSync(join(tmpdir(), "vue-4195-"));
  try {
    dropTheVue("espace", board, views);
    const vue = JSON.parse(readFileSync(join(views, "espace.json"), "utf8")) as VueOfProject;
    const numbers = vue.rail.map((c) => c.number);
    for (const n of [4001, 4002, 4003]) assert.ok(!numbers.includes(n), `served #${n} must not be in the view`);
    assert.ok(numbers.includes(4100) && numbers.includes(4047));
  } finally {
    rmSync(views, { recursive: true, force: true });
  }
});
