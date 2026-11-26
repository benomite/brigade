// Test d'acceptation gelé (#4195). Critère 4 : la vue est jointe aux messages du chef, pas aux événements de fond.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { blockage } from "../../src/second/blockage-du-second.ts";

const VUE = { banners: [{ label: "STOPPED", waitsFor: "a restart", waitsOn: "the chef" }], rail: [{ number: 221, title: "Espace card", displayed: "queued", real: "queued", waitsOn: "the chef" }] };

test("un événement de fond (moniteur, notification de tâche) ne reçoit pas la vue, le message du chef oui", () => {
  const vues = mkdtempSync(join(tmpdir(), "vue-4195-"));
  try {
    writeFileSync(join(vues, "espace.json"), JSON.stringify(VUE));
    const events = [
      "<task-notification>\n<summary>Monitor event: the cook of #221 is blocked</summary>\n</task-notification>",
      "Monitor event: #221 stuck, what's happening",
    ];
    for (const prompt of events) assert.equal(blockage({ prompt }, { nom: "espace" }, vues), "", prompt);
    assert.match(blockage({ prompt: "pourquoi on est bloqués ?" }, { nom: "espace" }, vues), /STOPPED/);
  } finally {
    rmSync(vues, { recursive: true, force: true });
  }
});
