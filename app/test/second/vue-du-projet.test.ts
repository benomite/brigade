// #4121 : le tableau que l'app dessine devient la vue que le second lit — déposée, relue par le crochet, bandeaux et carte avant le reste.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Tableau } from "../../src/faits.ts";
import { blocage } from "../../src/second/blocage-du-second.ts";
import { deposerLaVue, vueDuTableau } from "../../src/second/vue-du-projet.ts";

const carte = { ticket: 221, etat: "queued", titre: "Espace: sync the board", ligne: "ready, waits for a place in the kitchen", ouvrable: true, attendu: false, attend: [], fiche: {}, dit: [] };
const tableau = {
  arretCuisine: { cause: { kind: "unknown" }, since: "2026-11-24T10:00:00Z" },
  alertesDuRail: [{ sorte: "aucun-cook", phrase: "No cook can start", fait: { depuis: "2026-11-24T10:00:00Z", ticket: 221 }, geste: "Start it on its computer", geree: null }],
  attenteDuRail: { raison: "arretee", phrase: "The station is stopped, so no cook can start.", geste: "demarrer-la-station", stations: ["box"] },
  rail: { colonnes: [{ nom: "QUEUED", ton: "", compte: "1", cartes: [carte], vide: "" }], hors: [] },
} as unknown as Tableau;

test("le tableau devient la vue : bandeaux STOPPED et FAULT #221, carte #221 affichée prête, état réel et geste", () => {
  const vue = vueDuTableau(tableau);
  assert.deepEqual(vue.banners.map((b) => b.label), ["STOPPED", "FAULT #221"]);
  assert.equal(vue.rail[0]!.number, 221);
  assert.equal(vue.rail[0]!.displayed, "queued - ready, waits for a place in the kitchen");
  assert.equal(vue.rail[0]!.real, "The station is stopped, so no cook can start.");
  assert.equal(vue.rail[0]!.waitsOn, "Start it on its computer");
  assert.deepEqual(vue.gesture, { what: "Start it on its computer", by: "the chef" });
});

test("sans raison dite à la file, la carte n'a pas d'état réel différent, et sans geste la vue n'en invente pas", () => {
  const vue = vueDuTableau({ ...tableau, attenteDuRail: undefined } as unknown as Tableau);
  assert.equal(vue.rail[0]!.real, vue.rail[0]!.displayed);
  assert.equal(vue.gesture, undefined);
});

test("la vue déposée par l'app est celle que le crochet rend", () => {
  const vues = mkdtempSync(join(tmpdir(), "vue-4121-depot-"));
  try {
    deposerLaVue("espace", tableau, vues);
    const sortie = JSON.parse(blocage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, vues)) as { hookSpecificOutput: { additionalContext: string } };
    const contexte = sortie.hookSpecificOutput.additionalContext;
    assert.ok(contexte.includes("STOPPED") && contexte.includes("FAULT #221") && contexte.includes("#221 Espace: sync the board"));
    assert.ok(contexte.includes("contradicts the real state"));
  } finally {
    rmSync(vues, { recursive: true, force: true });
  }
});
