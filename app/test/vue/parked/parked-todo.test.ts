// Le TODO parked du chef (ticket 4281), le module seul devant un faux document : son compte, qui et jusqu'à quand, ce qui
// n'est pas connu, les boutons d'un ticket et le recommandé, la lecture seule, un seul envoi par item, le numéro qui ouvre
// la carte, et le contrôle de park qui s'ouvre sous l'item et le reste d'un rendu à l'autre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parkedTodo } from "../../../src/vue/parked/parked-todo.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const rec = (ticket: number, more: object = {}) => ({ ticket, who: "chef", what: `thing ${ticket}`, until: "2026-12-01", step: "Cooks", ...more });
const headOf = (n: number) => `TODO (${n})`;
const [NO_WHAT, NO_UNTIL] = ["for what: not given", "no date set"];
const items = (todo: Fake) => todo.dessous("li").filter(({ dataset }) => dataset.ticket !== undefined);
const head = (todo: Fake) => todo.dessous("p").find(({ className }) => className === "tete-du-todo")?.textContent;
const line = (item: Fake) => item.dessous("span").find(({ className }) => className === "qui-jusqua")?.textContent;

test("the head counts the items, and an answered item leaves the count; a second click sends nothing more", () => {
  const calls: unknown[][] = [];
  const todo = parkedTodo(doc, { records: [rec(1), rec(2), rec(3, { who: "Camille" })], chef: "chef", choices: ["go"], answer: (...a: unknown[]) => void calls.push(a) }) as unknown as Fake;
  assert.equal(head(todo), headOf(2));
  const button = items(todo)[0]!.dessous("button")[0]!;
  button.click();
  button.click();
  assert.deepEqual(calls, [[1, "go"]]);
  assert.equal(head(todo), headOf(1));
});

test("an item says who it waits for and until when, and what is not known; for what is the line above", () => {
  const todo = parkedTodo(doc, { records: [rec(4), rec(5, { what: null, until: null }), rec(6, { who: "Camille" })], chef: "chef", choices: [], answer: () => {} }) as unknown as Fake;
  const [four, five] = items(todo);
  assert.equal(line(four!), "waits for chef · until 2026-12-01");
  assert.deepEqual(four!.dessous("p").map(({ className, textContent }) => [className, textContent]), [["demande-du-todo", "thing 4"]]);
  assert.equal(line(five!), `waits for chef · ${NO_WHAT} · ${NO_UNTIL}`);
  assert.deepEqual(five!.dessous("p"), []);
  const other = parkedTodo(doc, { records: [rec(6, { who: "Camille" })], chef: "Camille", choices: [], answer: () => {} }) as unknown as Fake;
  assert.equal(line(items(other)[0]!), "waits for Camille · until 2026-12-01");
});

test("each item can have its own buttons, the recommended one filled; without any, no row of buttons", () => {
  const calls: unknown[][] = [];
  const choices = ({ ticket }: { ticket: number }) => (ticket === 7 ? [{ texte: "Yes", recommande: true }, { texte: "No", recommande: false }] : []);
  const todo = parkedTodo(doc, { records: [rec(7), rec(8)], chef: "chef", choices, answer: (...a: unknown[]) => void calls.push(a) }) as unknown as Fake;
  const [seven, eight] = items(todo);
  assert.deepEqual(seven!.dessous("button").map(({ textContent, className }) => [textContent, className]), [["Yes", "recommande"], ["No", ""]]);
  assert.deepEqual(eight!.dessous("div"), []);
  seven!.dessous("button")[1]!.click();
  assert.deepEqual(calls, [[7, "No"]]);
});

test("read-only, an item is listed without any button", () => {
  const todo = parkedTodo(doc, { records: [rec(9)], chef: "chef", choices: ["go"], answer: () => {}, readOnly: "no write access" }) as unknown as Fake;
  assert.equal(items(todo).length, 1);
  assert.equal(todo.dessous("button").length, 0);
});

test("with `open`, an item's number and title open its card in one click, its title said on hover; without it, they are only read", () => {
  const openEntries: number[] = [];
  const todo = parkedTodo(doc, { records: [rec(11, { title: "Le menu" }), rec(12)], chef: "chef", choices: [], answer: () => {}, open: (n) => void openEntries.push(n), openTitle: (n) => `see #${n}` }) as unknown as Fake;
  const [a, b] = items(todo).map((item) => item.dessous("button")[0]!);
  assert.deepEqual([a!.textContent, b!.textContent, a!.title], ["#11 Le menu", "#12", "see #11"]);
  a!.click();
  assert.deepEqual(openEntries, [11]);
  const byDefault = parkedTodo(doc, { records: [rec(10)], chef: "chef", choices: [], answer: () => {}, open: () => {} }) as unknown as Fake;
  assert.equal(byDefault.dessous("button")[0]?.title, "open #10's card");
  const readOne = parkedTodo(doc, { records: [rec(13, { title: "Le menu" })], chef: "chef", choices: [], answer: () => {} }) as unknown as Fake;
  assert.equal(readOne.dessous("strong")[0]?.textContent, "#13 Le menu");
  assert.equal(readOne.dessous("button").length, 0);
});
