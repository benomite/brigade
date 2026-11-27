// #4121 : le tableau que l'app dessine devient la vue que le second lit — déposée, relue par le crochet, bandeaux et carte avant le reste.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { VueOfProject } from "../../src/second/context-of-blockage.ts";
import type { Board } from "../../src/facts.ts";
import { blockage } from "../../src/second/blockage-of-second.ts";
import { dropTheVue } from "../../src/second/vue-of-project.ts";
import { stopKitchenRead } from "../../src/vue/banner-stop/stop-of-rail.ts";

const card = { ticket: 221, etat: "queued", titre: "Espace: sync the board", ligne: "ready, waits for a place in the kitchen", ouvrable: true, attendu: false, attend: [], fiche: {}, dit: [] };
// La vue que l'app dépose pour ce tableau, relue du fichier.
function vueDropped(t: Board): VueOfProject {
  const views = mkdtempSync(join(tmpdir(), "vue-4121-lue-"));
  try {
    dropTheVue("espace", t, views);
    return JSON.parse(readFileSync(join(views, "espace.json"), "utf8")) as VueOfProject;
  } finally {
    rmSync(views, { recursive: true, force: true });
  }
}

const board = {
  arretCuisine: { cause: { kind: "unknown" }, since: "2026-11-24T10:00:00Z", statut: "cause unknown" },
  alertesDuRail: [{ sorte: "aucun-cook", phrase: "No cook can start", fait: { depuis: "2026-11-24T10:00:00Z", ticket: 221 }, geste: "Start it on its computer", geree: null }],
  attenteDuRail: { raison: "arretee", phrase: "The station is stopped, so no cook can start.", geste: "demarrer-la-station", stations: ["box"] },
  rail: { colonnes: [{ nom: "QUEUED", ton: "", compte: "1", cartes: [card], vide: "" }], hors: [] },
} as unknown as Board;

test("le tableau devient la vue : bandeaux STOPPED et FAULT #221, carte #221 affichée prête, état réel et geste", () => {
  const vue = vueDropped(board);
  assert.deepEqual(vue.banners.map((b) => b.label), ["STOPPED", "FAULT #221"]);
  assert.equal(vue.rail[0]!.number, 221);
  assert.equal(vue.rail[0]!.displayed, "queued - ready, waits for a place in the kitchen");
  assert.equal(vue.rail[0]!.real, "The station is stopped, so no cook can start.");
  assert.equal(vue.rail[0]!.waitsOn, "Start it on its computer");
  assert.deepEqual(vue.gesture, { what: "Start it on its computer", by: "the chef" });
});

test("sans raison dite à la file, la carte n'a pas d'état réel différent, et sans geste la vue n'en invente pas", () => {
  const vue = vueDropped({ ...board, attenteDuRail: undefined } as unknown as Board);
  assert.equal(vue.rail[0]!.real, vue.rail[0]!.displayed);
  assert.equal(vue.gesture, undefined);
});

test("la vue déposée par l'app est celle que le crochet rend", () => {
  const views = mkdtempSync(join(tmpdir(), "vue-4121-depot-"));
  try {
    dropTheVue("espace", board, views);
    const output = JSON.parse(blockage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, views)) as { hookSpecificOutput: { additionalContext: string } };
    const context = output.hookSpecificOutput.additionalContext;
    assert.ok(context.includes("STOPPED") && context.includes("FAULT #221") && context.includes("#221 Espace: sync the board"));
    assert.ok(context.includes("contradicts the real state"));
  } finally {
    rmSync(views, { recursive: true, force: true });
  }
});

test("le bandeau STOPPED dit ce que l'arrêt attend : le statut que la lecture du rail pose, et à qui selon sa cause", () => {
  const withIt = (cause: unknown) => vueDropped({ ...board, ...stopKitchenRead({ cause, since: "2026-11-24T10:00:00Z" }) } as unknown as Board).banners[0]!;
  assert.deepEqual(withIt({ kind: "frozen-zone", ticket: 1078, zone: "app/src" }), { label: "STOPPED", waitsFor: "frozen ticket #1078 holds the file zone app/src", waitsOn: "whoever serves #1078, or the chef who sets it free" });
  assert.deepEqual(withIt({ kind: "main-red" }), { label: "STOPPED", waitsFor: "main is red", waitsOn: "the repair of main" });
  assert.deepEqual(withIt({ kind: "zone-held", pr: 4077, zone: "app/src" }), { label: "STOPPED", waitsFor: "zone held by PR 4077", waitsOn: "whoever serves PR 4077, or the chef who merges or closes it" });
  assert.deepEqual(withIt({ kind: "unknown" }), { label: "STOPPED", waitsFor: "cause unknown", waitsOn: "the chef" });
});

test("le bandeau STOPPED d'une zone tenue nomme la PR, et les autres causes ne la nomment pas (#4244)", () => {
  const withIt = (cause: unknown) => vueDropped({ ...board, ...stopKitchenRead({ cause, since: "2026-11-24T10:00:00Z" }) } as unknown as Board).banners[0]!;
  const heldOne = withIt({ kind: "zone-held", pr: 4077, zone: "app/src" });
  assert.match(heldOne.waitsFor, /zone held by PR 4077/);
  assert.match(heldOne.waitsOn, /PR 4077/);
  assert.equal(withIt({ kind: "main-red" }).waitsFor, "main is red");
  assert.equal(withIt({ kind: "unknown" }).waitsFor, "cause unknown");
  for (const cause of [{ kind: "main-red" }, { kind: "unknown" }, { kind: "frozen-zone", ticket: 5, zone: "app/src" }]) {
    assert.doesNotMatch(withIt(cause).waitsOn, /PR /);
    assert.doesNotMatch(withIt(cause).waitsFor, /zone held by PR/);
  }
});

test("le bandeau STOPPED dit à qui chaque cause attend, sans mélanger main rouge et cause inconnue (#4244)", () => {
  const withIt = (cause: unknown) => vueDropped({ ...board, ...stopKitchenRead({ cause, since: "2026-11-24T10:00:00Z" }) } as unknown as Board).banners[0]!;
  assert.equal(withIt({ kind: "main-red" }).waitsOn, "the repair of main");
  assert.equal(withIt({ kind: "unknown" }).waitsOn, "the chef");
});

test("le bandeau STOPPED dit le statut de l'arrêt tel quel, sans le recalculer, et une cause inconnue sans statut (#4503)", () => {
  const withIt = (stop: unknown) => vueDropped({ ...board, arretCuisine: stop } as unknown as Board).banners[0]!;
  assert.equal(withIt({ cause: { kind: "main-red" }, since: "2026-11-24T10:00:00Z", statut: "main is red since 09:12 UTC" }).waitsFor, "main is red since 09:12 UTC");
  assert.equal(withIt({ cause: { kind: "main-red" }, since: "2026-11-24T10:00:00Z" }).waitsFor, "cause unknown");
});

test("le geste d'ajouter le projet à une station se dit avec les mots du rail (#4503)", () => {
  const vue = vueDropped({ ...board, attenteDuRail: { raison: "aucune-station", phrase: "No station serves this project.", geste: "ajouter-a-une-station", stations: [] } } as unknown as Board);
  assert.equal(vue.rail[0]!.real, "No station serves this project.");
  assert.equal(vue.rail[0]!.waitsOn, "Add the project to a station");
  assert.deepEqual(vue.gesture, { what: "Add the project to a station", by: "the chef" });
});
