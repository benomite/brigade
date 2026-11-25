// Le TODO parked du chef (ticket 4281), le module seul devant un faux document : son compte, la ligne d'un refus, la
// lecture seule, un seul envoi par item, et le contrôle de park qui s'ouvre sous l'item et le reste d'un rendu à l'autre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { headOf, NO_UNTIL, NO_WHAT, parkedInTodo, parkedTodo } from "../../../src/vue/parked/parked-todo.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const rec = (ticket: number, plus: object = {}) => ({ ticket, who: "chef", what: `thing ${ticket}`, until: "2026-12-01", step: "Cooks", ...plus });
const items = (todo: Faux) => todo.dessous("li").filter(({ dataset }) => dataset.ticket !== undefined);
const tete = (todo: Faux) => todo.dessous("p").find(({ className }) => className === "tete-parked")?.textContent;

test("the head counts the items, and an answered item leaves the count; a second click sends nothing more", () => {
  const calls: unknown[][] = [];
  const todo = parkedTodo(doc, { records: [rec(1), rec(2), rec(3, { who: "Camille" })], chef: "chef", choices: ["back to the kitchen"], answer: (...a: unknown[]) => void calls.push(a) }) as unknown as Faux;
  assert.equal(tete(todo), headOf(2));
  const bouton = items(todo)[0]!.dessous("button")[0]!;
  bouton.click();
  bouton.click();
  assert.deepEqual(calls, [[1, "back to the kitchen"]]);
  assert.equal(tete(todo), headOf(1));
});

test("an item says what is not known, and the reason its answer was refused", () => {
  const todo = parkedTodo(doc, { records: [rec(4, { what: null, until: null, note: "GitHub refused the comment" })], chef: "chef", choices: ["go"], answer: () => {} }) as unknown as Faux;
  const [item] = items(todo);
  assert.ok(item!.textContent.includes(NO_WHAT));
  assert.ok(item!.textContent.includes(NO_UNTIL));
  assert.ok(item!.textContent.includes("GitHub refused the comment"));
  const sans = parkedTodo(doc, { records: [rec(5)], chef: "chef", choices: ["go"], answer: () => {} }) as unknown as Faux;
  assert.equal(sans.dessous("p").filter(({ className }) => className === "parked-note").length, 0);
});

test("read-only, an item is listed without any button", () => {
  const todo = parkedTodo(doc, { records: [rec(6)], chef: "chef", choices: ["go"], answer: () => {}, readOnly: "no write access", control: () => new Faux("div") }) as unknown as Faux;
  assert.equal(items(todo).length, 1);
  assert.equal(todo.dessous("button").length, 0);
});

test("« park or unpark… » opens the control under its item, closes it, and an opened one stays open on the next render", () => {
  const opened = new Set<number>();
  const control = (r: { ticket: number }) => Object.assign(new Faux("div"), { className: `control-${r.ticket}` });
  const poser = () => parkedTodo(doc, { records: [rec(7), rec(8)], chef: "chef", choices: ["go"], answer: () => {}, control, opened }) as unknown as Faux;
  const controls = (todo: Faux) => todo.dessous("div").filter(({ className }) => className.startsWith("control-")).map(({ className }) => className);
  const todo = poser();
  assert.deepEqual(controls(todo), []);
  const ouvrir = (t: Faux, n: number) => items(t)[n]!.dessous("button").find(({ dataset }) => dataset.action === "open-park")!.click();
  ouvrir(todo, 1);
  assert.deepEqual(controls(todo), ["control-8"]);
  assert.deepEqual([...opened], [8]);
  assert.deepEqual(controls(poser()), ["control-8"]);
  ouvrir(todo, 1);
  assert.deepEqual(controls(todo), []);
  assert.deepEqual([...opened], []);
  const rouvert = poser();
  ouvrir(rouvert, 0);
  assert.deepEqual(controls(rouvert), ["control-7"]);
  ouvrir(rouvert, 0);
  assert.deepEqual(controls(rouvert), []);
});

test("nothing is posed in the TODO when no parked ticket waits for the chef", () => {
  const options = { chef: "chef", choices: ["go"], answer: () => {} };
  assert.deepEqual(parkedInTodo(doc, { ...options, records: [rec(9, { who: "Camille" })] }), []);
  assert.equal(parkedInTodo(doc, { ...options, records: [rec(9), rec(10, { who: "Camille" })] }).length, 1);
});

test("with `open`, an item's number and title open its card in one click; without it, they are only read", () => {
  const ouvertes: number[] = [];
  const todo = parkedTodo(doc, { records: [rec(11, { title: "Le menu" }), rec(12)], chef: "chef", choices: ["go"], answer: () => {}, open: (n) => void ouvertes.push(n) }) as unknown as Faux;
  const [a, b] = items(todo).map((item) => item.dessous("button")[0]!);
  assert.deepEqual([a!.textContent, b!.textContent], ["#11 Le menu", "#12"]);
  assert.equal(a!.title, "open #11's card");
  a!.click();
  assert.deepEqual(ouvertes, [11]);
  const lu = parkedTodo(doc, { records: [rec(13, { title: "Le menu" })], chef: "chef", choices: ["go"], answer: () => {} }) as unknown as Faux;
  assert.equal(lu.dessous("strong")[0]?.textContent, "#13 Le menu");
  assert.equal(lu.dessous("strong")[0]?.title, "");
});
