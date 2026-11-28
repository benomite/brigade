// Le catalogue des refus : chaque cause que le runtime connaît a son code, sa
// phrase pour le chef et son geste. Un code ajouté sans l'un des deux fait
// échouer ce test (et le contrôle de types, `REFUSAL_CAUSES` étant un `Record`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { REFUSAL_CODES } from "../../src/projets/refusal-codes.ts";
import { refusal, REFUSAL_CAUSES } from "../../src/projets/refusal.ts";
import { decrire } from "../../src/remedes/registre.ts";

test("chaque cause de refus a un message d'une phrase et une action", () => {
  assert.deepEqual(Object.keys(REFUSAL_CAUSES).sort(), [...REFUSAL_CODES].sort());
  for (const code of REFUSAL_CODES) {
    const { message, action } = REFUSAL_CAUSES[code];
    assert.match(message, /^[A-Z][^\n]*\.$/, `${code} : message`);
    assert.doesNotMatch(message.slice(0, -1), /[.!?] [A-Z]/, `${code} : une seule phrase`);
    assert.doesNotMatch(message, /[/\\`]|\.(ts|json)\b|BRIGADE_/, `${code} : ni chemin ni terme de code dans le message`);
    assert.ok(action.trim().length > 10, `${code} : action`);
  }
});

test("un refus porte son statut, son code, son message et son action — et son remède, ou pourquoi il n'y en a pas (`remedes/registre.ts`)", () => {
  assert.deepEqual(refusal("sandbox-unusable"), { status: "refused", code: "sandbox-unusable", ...REFUSAL_CAUSES["sandbox-unusable"], ...decrire("sandbox-unusable") });
});
