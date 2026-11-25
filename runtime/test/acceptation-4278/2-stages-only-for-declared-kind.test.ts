// #4278, critère 2 : les étapes ne valent que pour la sorte déclarée ; toute autre sorte a une seule étape. Contrat : `etapesDuTicket({ projet: { stages?: Record<string, string[]> }, sorte })` -> `string[]` de `runtime/src/etapes-du-ticket.ts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { etapesDuTicket } from "../../src/etapes-du-ticket.ts";

const projet = { stages: { video: ["script", "storyboard", "voice", "render"], podcast: ["draft", "record"] } };

test("each declared kind gets its own stages and no other kind inherits them", () => {
  assert.deepEqual(etapesDuTicket({ projet, sorte: "video" }), ["script", "storyboard", "voice", "render"]);
  assert.deepEqual(etapesDuTicket({ projet, sorte: "podcast" }), ["draft", "record"]);
  assert.equal(etapesDuTicket({ projet, sorte: "bug" }).length, 1);
  assert.equal(etapesDuTicket({ projet, sorte: "feature" }).length, 1);
  assert.equal(etapesDuTicket({ projet: {}, sorte: "video" }).length, 1);
});
