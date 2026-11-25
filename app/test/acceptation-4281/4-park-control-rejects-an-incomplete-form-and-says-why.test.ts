// Test d'acceptation gelé (#4281). Critère 4 : le contrôle de park refuse un formulaire sans who, for what ou until, et montre la raison à l'écran.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parkControl } from "../../src/vue/parked/park-control.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const FIELDS = { who: "Camille", what: "the invoice", until: "2026-12-01" };

for (const missing of ["who", "what", "until"] as const) {
  test(`a form without ${missing} is rejected, with the reason on screen`, async () => {
    const calls: unknown[] = [];
    const control = parkControl(doc, { project: "parade", ticket: 41, step: "pris", gesture: (...args: unknown[]) => void calls.push(args) }) as unknown as Faux;
    const field = (name: string) => control.dessous("input").find(({ dataset }) => dataset.field === name) ?? assert.fail(`no field ${name}`);
    for (const [name, value] of Object.entries(FIELDS)) field(name).value = name === missing ? "" : value;
    (control.dessous("button").find(({ dataset }) => dataset.action === "park") ?? assert.fail("no park button")).click();
    await repos();
    assert.deepEqual(calls, [], "the gesture is not called");
    assert.match(control.textContent, new RegExp(missing === "what" ? "for what|what" : missing, "i"), "the reason names the missing field");
  });
}
