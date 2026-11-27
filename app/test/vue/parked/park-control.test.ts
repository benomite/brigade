// Le contrôle de park (ticket 4281), le module seul devant un faux document : la raison d'un refus nomme le champ qui
// manque, ce que le geste partagé rend se dit à l'écran, un geste en route ne repart pas, et ce qui est tapé se garde.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parkControl } from "../../../src/vue/parked/park-control.js";
import { Fake, repos } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const SENDING = "sending…";
const FIELDS = [
  { field: "who", missing: "nothing parked: say who it waits for — a person, or the chef" },
  { field: "what", missing: "nothing parked: say for what it waits" },
  { field: "until", missing: "nothing parked: say until when — a date or a fact" },
];
type Gesture = Parameters<typeof parkControl>[1]["gesture"];
const set = (gesture: Gesture, form = {}) => parkControl(doc, { project: "parade", ticket: 41, step: "Cooks", gesture, form }) as unknown as Fake;
const field = (c: Fake, name: string) => c.dessous("input").find(({ dataset }) => dataset.field === name)!;
const press = (c: Fake, action: string) => c.dessous("button").find(({ dataset }) => dataset.action === action)!.click();
const reason = (c: Fake) => c.dessous("p").find(({ className }) => className === "park-reason")!;
const fill = (c: Fake, values: Record<string, string>) => Object.entries(values).forEach(([name, v]) => void (field(c, name).value = v));

for (const { field, missing } of FIELDS) {
  test(`without ${field}, the reason on screen says ${field} is missing`, () => {
    const calls: unknown[] = [];
    const c = set((...a) => void calls.push(a));
    fill(c, { who: "Camille", what: "the invoice", until: "2026-12-01", [field]: "   " });
    press(c, "park");
    assert.equal(reason(c).textContent, missing);
    assert.deepEqual(calls, []);
  });
}

test("a full form calls the gesture once, trimmed, with project, ticket and step; what it renders is said", async () => {
  const calls: unknown[][] = [];
  let render: (v: unknown) => void = () => {};
  const c = set((...a) => {
    calls.push(a);
    return new Promise((r) => (render = r)) as never;
  });
  fill(c, { who: " Camille ", what: "the invoice", until: "the vendor answers" });
  press(c, "park");
  press(c, "unpark");
  await repos();
  assert.equal(reason(c).textContent, SENDING);
  assert.deepEqual(calls, [[{ project: "parade", ticket: 41, step: "Cooks" }, { action: "park", who: "Camille", what: "the invoice", until: "the vendor answers" }]]);
  render({ refus: "nothing is written: not a day", detail: "the runtime says why" });
  await repos();
  assert.deepEqual([reason(c).textContent, reason(c).title], ["nothing is written: not a day", "the runtime says why"]);
  press(c, "unpark");
  await repos();
  assert.deepEqual(calls[1], [{ project: "parade", ticket: 41, step: "Cooks" }, { action: "unpark" }]);
  render({ fait: "back to the kitchen" });
  await repos();
  assert.equal(reason(c).textContent, "back to the kitchen");
  press(c, "unpark");
  render(undefined);
  await repos();
  assert.equal(reason(c).textContent, "");
});

test("a gesture that throws is said on screen, and the control can send again", async () => {
  let times = 0;
  const c = set(() => {
    times += 1;
    throw new Error("bridge down");
  });
  press(c, "unpark");
  await repos();
  assert.equal(reason(c).textContent, "nothing sent: bridge down");
  press(c, "unpark");
  await repos();
  assert.equal(times, 2);
});

test("what the chef types is kept in the form, and comes back on the next render", () => {
  const form: Record<string, string> = {};
  const c = set(() => undefined, form);
  field(c, "who").value = "Camille";
  field(c, "who").declencher("input");
  assert.deepEqual(form, { who: "Camille" });
  assert.equal(field(set(() => undefined, form), "who").value, "Camille");
  assert.equal(field(set(() => undefined, form), "what").value, "");
});
