// Le contrôle de park (ticket 4281), le module seul devant un faux document : la raison d'un refus nomme le champ qui
// manque, ce que le geste partagé rend se dit à l'écran, un geste en route ne repart pas, et ce qui est tapé se garde.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parkControl } from "../../../src/vue/parked/park-control.js";
import { Faux, repos } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const SENDING = "sending…";
const FIELDS = [
  { field: "who", missing: "nothing parked: say who it waits for — a person, or the chef" },
  { field: "what", missing: "nothing parked: say for what it waits" },
  { field: "until", missing: "nothing parked: say until when — a date or a fact" },
];
type Gesture = Parameters<typeof parkControl>[1]["gesture"];
const poser = (gesture: Gesture, form = {}) => parkControl(doc, { project: "parade", ticket: 41, step: "Cooks", gesture, form }) as unknown as Faux;
const champ = (c: Faux, nom: string) => c.dessous("input").find(({ dataset }) => dataset.field === nom)!;
const presser = (c: Faux, action: string) => c.dessous("button").find(({ dataset }) => dataset.action === action)!.click();
const raison = (c: Faux) => c.dessous("p").find(({ className }) => className === "park-reason")!;
const remplir = (c: Faux, valeurs: Record<string, string>) => Object.entries(valeurs).forEach(([nom, v]) => void (champ(c, nom).value = v));

for (const { field, missing } of FIELDS) {
  test(`without ${field}, the reason on screen says ${field} is missing`, () => {
    const calls: unknown[] = [];
    const c = poser((...a) => void calls.push(a));
    remplir(c, { who: "Camille", what: "the invoice", until: "2026-12-01", [field]: "   " });
    presser(c, "park");
    assert.equal(raison(c).textContent, missing);
    assert.deepEqual(calls, []);
  });
}

test("a full form calls the gesture once, trimmed, with project, ticket and step; what it renders is said", async () => {
  const calls: unknown[][] = [];
  let rendre: (v: unknown) => void = () => {};
  const c = poser((...a) => {
    calls.push(a);
    return new Promise((r) => (rendre = r)) as never;
  });
  remplir(c, { who: " Camille ", what: "the invoice", until: "the vendor answers" });
  presser(c, "park");
  presser(c, "unpark");
  await repos();
  assert.equal(raison(c).textContent, SENDING);
  assert.deepEqual(calls, [[{ project: "parade", ticket: 41, step: "Cooks" }, { action: "park", who: "Camille", what: "the invoice", until: "the vendor answers" }]]);
  rendre({ refus: "nothing is written: not a day", detail: "the runtime says why" });
  await repos();
  assert.deepEqual([raison(c).textContent, raison(c).title], ["nothing is written: not a day", "the runtime says why"]);
  presser(c, "unpark");
  await repos();
  assert.deepEqual(calls[1], [{ project: "parade", ticket: 41, step: "Cooks" }, { action: "unpark" }]);
  rendre({ fait: "back to the kitchen" });
  await repos();
  assert.equal(raison(c).textContent, "back to the kitchen");
  presser(c, "unpark");
  rendre(undefined);
  await repos();
  assert.equal(raison(c).textContent, "");
});

test("a gesture that throws is said on screen, and the control can send again", async () => {
  let fois = 0;
  const c = poser(() => {
    fois += 1;
    throw new Error("bridge down");
  });
  presser(c, "unpark");
  await repos();
  assert.equal(raison(c).textContent, "nothing sent: bridge down");
  presser(c, "unpark");
  await repos();
  assert.equal(fois, 2);
});

test("what the chef types is kept in the form, and comes back on the next render", () => {
  const form: Record<string, string> = {};
  const c = poser(() => undefined, form);
  champ(c, "who").value = "Camille";
  champ(c, "who").declencher("input");
  assert.deepEqual(form, { who: "Camille" });
  assert.equal(champ(poser(() => undefined, form), "who").value, "Camille");
  assert.equal(champ(poser(() => undefined, form), "what").value, "");
});
