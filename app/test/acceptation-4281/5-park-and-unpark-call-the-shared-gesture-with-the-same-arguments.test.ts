// Test d'acceptation gelé (#4281). Critère 5 : le contrôle de park et celui d'unpark appellent le geste partagé avec les mêmes arguments, quel que soit le projet.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parkControl } from "../../src/vue/parked/park-control.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

for (const project of ["parade", "atelier"]) {
  test(`for ${project}, park and unpark pass the same project and ticket to the shared gesture`, async () => {
    const calls: any[][] = [];
    const control = parkControl(doc, { project, ticket: 51, step: "pris", gesture: (...args: unknown[]) => void calls.push(args) }) as unknown as Faux;
    const field = (name: string) => control.dessous("input").find(({ dataset }) => dataset.field === name) ?? assert.fail(`no field ${name}`);
    field("who").value = "Camille";
    field("what").value = "the invoice";
    field("until").value = "2026-12-01";
    const press = (action: string) => (control.dessous("button").find(({ dataset }) => dataset.action === action) ?? assert.fail(`no ${action} button`)).click();
    press("park");
    await repos();
    press("unpark");
    await repos();
    assert.equal(calls.length, 2);
    const [park, unpark] = calls;
    assert.equal(JSON.stringify(park![0]).includes(project), true, "the project is passed");
    assert.deepEqual(park![0].project ?? park![0], unpark![0].project ?? unpark![0]);
    assert.equal(park![0].ticket, 51);
    assert.equal(unpark![0].ticket, 51);
  });
}
