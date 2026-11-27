// Test d'acceptation gelé (#4195). Critère 3 : l'état d'une carte est celui du rail — pas de « base rouge » main verte, pas de FAULT pour une boucle que la station a déjà arrêtée.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Board } from "../../src/facts.ts";
import type { VueOfProject } from "../../src/second/context-of-blockage.ts";
import { dropTheVue } from "../../src/second/vue-of-project.ts";

const base = { attendu: false, attend: [], fiche: {}, ouvrable: true, dit: [] };
// Main est verte : ni `baseRouge`, ni alerte de base ; #4047 est en WAITING, la station a arrêté sa boucle de relances.
const board = {
  alertesDuRail: [
    { sorte: "relance-en-boucle", phrase: "#4047 was relaunched 5 times in 20 min.", fait: { depuis: "2026-11-24T22:00:00Z", ticket: 4047 }, geste: null, geree: "The station stopped the loop and set the card aside.", cause: undefined },
  ],
  rail: {
    colonnes: [
      { nom: "WAITING", ton: "", compte: "1", cartes: [{ ...base, ticket: 4047, etat: "waiting", titre: "Set aside", ligne: "set aside by the station", enWaiting: true, relancePassee: true }], vide: "" },
      { nom: "IN PASS", ton: "", compte: "1", cartes: [{ ...base, ticket: 4048, etat: "base rouge", titre: "Held", ligne: "waits for main to be green · 20 min" }], vide: "" },
    ],
    hors: [],
  },
} as unknown as Board;

test("main verte : aucune carte ne dit « base rouge » ; boucle déjà arrêtée par la station : aucun bandeau FAULT #4047", () => {
  const views = mkdtempSync(join(tmpdir(), "vue-4195-"));
  try {
    dropTheVue("espace", board, views);
    const vue = JSON.parse(readFileSync(join(views, "espace.json"), "utf8")) as VueOfProject;
    const said = JSON.stringify(vue.rail);
    assert.doesNotMatch(said, /base rouge|waits for main to be green/i);
    assert.ok(!vue.banners.some((b) => b.label === "FAULT #4047"), "the stopped loop must not be a FAULT banner");
  } finally {
    rmSync(views, { recursive: true, force: true });
  }
});
