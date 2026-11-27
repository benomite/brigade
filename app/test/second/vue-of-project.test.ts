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
  alertesDuRail: [{ sorte: "aucun-cook", phrase: "No cook can start", fait: { depuis: "2026-11-24T10:00:00Z", ticket: 221 }, geste: "Start it on its computer", geree: null }],
  rail: { colonnes: [{ nom: "QUEUED", ton: "", compte: "1", cartes: [card], vide: "" }], hors: [] },
} as unknown as Board;

test("le tableau devient la vue : bandeau FAULT #221, carte #221 affichée prête, et qui elle attend", () => {
  const vue = vueDropped(board);
  assert.deepEqual(vue.banners.map((b) => b.label), ["FAULT #221"]);
  assert.equal(vue.rail[0]!.number, 221);
  assert.equal(vue.rail[0]!.displayed, "queued - ready, waits for a place in the kitchen");
  assert.equal(vue.rail[0]!.real, vue.rail[0]!.displayed);
  assert.equal(vue.rail[0]!.waitsOn, "the kitchen, which will take it");
});

// L'arrêt de la cuisine et l'attente du rail sont des faits de l'ancien runtime : la vue n'en dit rien, ni bandeau
// STOPPED, ni état réel tiré de l'attente, ni geste (#4503).
test("un tableau qui porte encore l'arrêt de cuisine et l'attente du rail : ni STOPPED, ni état réel différent, ni geste", () => {
  const vue = vueDropped({
    ...board,
    arretCuisine: { cause: { kind: "main-red" }, since: "2026-11-24T10:00:00Z" },
    attenteDuRail: { raison: "arretee", phrase: "The station is stopped, so no cook can start.", geste: "demarrer-la-station", stations: ["box"] },
  } as unknown as Board);
  assert.deepEqual(vue.banners.map((b) => b.label), ["FAULT #221"]);
  assert.equal(vue.rail[0]!.real, vue.rail[0]!.displayed);
  assert.equal(vue.gesture, undefined);
});

test("la vue déposée par l'app est celle que le crochet rend", () => {
  const views = mkdtempSync(join(tmpdir(), "vue-4121-depot-"));
  try {
    dropTheVue("espace", board, views);
    const output = JSON.parse(blockage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, views)) as { hookSpecificOutput: { additionalContext: string } };
    const context = output.hookSpecificOutput.additionalContext;
    assert.ok(context.includes("FAULT #221") && context.includes("#221 Espace: sync the board"));
    assert.ok(context.includes("No gesture is known that unblocks"));
  } finally {
    rmSync(views, { recursive: true, force: true });
  }
});
