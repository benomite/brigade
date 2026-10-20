// Le catalogue des refus : chaque cause que le runtime connaît a son code, sa
// phrase pour le chef et son geste. Un code ajouté sans l'un des deux fait
// échouer ce test (et le contrôle de types, `CAUSES` étant un `Record`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { CAUSES, CODES_DE_REFUS, refus } from "../../src/projets/refus.ts";

test("chaque cause de refus a un message d'une phrase et une action", () => {
  assert.deepEqual(Object.keys(CAUSES).sort(), [...CODES_DE_REFUS].sort());
  for (const code of CODES_DE_REFUS) {
    const { message, action } = CAUSES[code];
    assert.match(message, /^[A-Z][^\n]*\.$/, `${code} : message`);
    assert.doesNotMatch(message.slice(0, -1), /[.!?] [A-Z]/, `${code} : une seule phrase`);
    assert.doesNotMatch(message, /[/\\`]|\.(ts|json)\b|BRIGADE_/, `${code} : ni chemin ni terme de code dans le message`);
    assert.ok(action.trim().length > 10, `${code} : action`);
  }
});

test("un refus porte son statut, son code, son message et son action", () => {
  assert.deepEqual(refus("sandbox-unusable"), { status: "refused", code: "sandbox-unusable", ...CAUSES["sandbox-unusable"] });
});
