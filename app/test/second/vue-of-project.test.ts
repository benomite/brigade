// #4121 : le tableau que l'app dessine devient la vue que le second lit — déposée, relue par le crochet. Plus aucun bandeau (#4509).
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
  rail: { colonnes: [{ nom: "QUEUED", ton: "", compte: "1", cartes: [card], vide: "" }], hors: [] },
} as unknown as Board;


test("la vue déposée par l'app est celle que le crochet rend", () => {
  const views = mkdtempSync(join(tmpdir(), "vue-4121-depot-"));
  try {
    dropTheVue("espace", board, views);
    const output = JSON.parse(blockage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, views)) as { hookSpecificOutput: { additionalContext: string } };
    const context = output.hookSpecificOutput.additionalContext;
    assert.ok(context.includes("#221 Espace: sync the board"));
    assert.ok(!context.includes("STOPPED") && !context.includes("FAULT"));
  } finally {
    rmSync(views, { recursive: true, force: true });
  }
});

