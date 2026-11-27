// Test d'acceptation gelé (#4195). Critère 3 : l'état d'une carte est celui du rail — pas de « base rouge » main verte, pas de FAULT pour une boucle que la station a déjà arrêtée.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Tableau } from "../../src/faits.ts";
import type { VueDuProjet } from "../../src/second/contexte-du-blocage.ts";
import { deposerLaVue } from "../../src/second/vue-du-projet.ts";

const base = { attendu: false, attend: [], fiche: {}, ouvrable: true, dit: [] };
// Main est verte : ni `baseRouge`, ni alerte de base ; #4047 est en WAITING, la station a arrêté sa boucle de relances.
const tableau = {
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
} as unknown as Tableau;

test("main verte : aucune carte ne dit « base rouge » ; boucle déjà arrêtée par la station : aucun bandeau FAULT #4047", () => {
  const vues = mkdtempSync(join(tmpdir(), "vue-4195-"));
  try {
    deposerLaVue("espace", tableau, vues);
    const vue = JSON.parse(readFileSync(join(vues, "espace.json"), "utf8")) as VueDuProjet;
    const dit = JSON.stringify(vue.rail);
    assert.doesNotMatch(dit, /base rouge|waits for main to be green/i);
    assert.ok(!vue.banners.some((b) => b.label === "FAULT #4047"), "the stopped loop must not be a FAULT banner");
  } finally {
    rmSync(vues, { recursive: true, force: true });
  }
});
