// Le TODO parked du chef (ticket 4281), le module seul devant un faux document : son compte, qui et jusqu'à quand, ce qui
// n'est pas connu, les boutons d'un ticket et le recommandé, la lecture seule, un seul envoi par item, le numéro qui ouvre
// la carte, et le contrôle de park qui s'ouvre sous l'item et le reste d'un rendu à l'autre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parkedTodo } from "../../../src/vue/parked/parked-todo.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const rec = (ticket: number, plus: object = {}) => ({ ticket, who: "chef", what: `thing ${ticket}`, until: "2026-12-01", step: "Cooks", ...plus });
const headOf = (n: number) => `TODO (${n})`;
const [NO_WHAT, NO_UNTIL, OPEN_PARK] = ["for what: not given", "no date set", "park or unpark…"];
const items = (todo: Faux) => todo.dessous("li").filter(({ dataset }) => dataset.ticket !== undefined);
const tete = (todo: Faux) => todo.dessous("p").find(({ className }) => className === "tete-du-todo")?.textContent;
const ligne = (item: Faux) => item.dessous("span").find(({ className }) => className === "qui-jusqua")?.textContent;

test("the head counts the items, and an answered item leaves the count; a second click sends nothing more", () => {
  const calls: unknown[][] = [];
  const todo = parkedTodo(doc, { records: [rec(1), rec(2), rec(3, { who: "Camille" })], chef: "chef", choices: ["go"], answer: (...a: unknown[]) => void calls.push(a) }) as unknown as Faux;
  assert.equal(tete(todo), headOf(2));
  const bouton = items(todo)[0]!.dessous("button")[0]!;
  bouton.click();
  bouton.click();
  assert.deepEqual(calls, [[1, "go"]]);
  assert.equal(tete(todo), headOf(1));
});

test("an item says who it waits for and until when, and what is not known; for what is the line above", () => {
  const todo = parkedTodo(doc, { records: [rec(4), rec(5, { what: null, until: null }), rec(6, { who: "Camille" })], chef: "chef", choices: [], answer: () => {} }) as unknown as Faux;
  const [quatre, cinq] = items(todo);
  assert.equal(ligne(quatre!), "waits for chef · until 2026-12-01");
  assert.deepEqual(quatre!.dessous("p").map(({ className, textContent }) => [className, textContent]), [["demande-du-todo", "thing 4"]]);
  assert.equal(ligne(cinq!), `waits for chef · ${NO_WHAT} · ${NO_UNTIL}`);
  assert.deepEqual(cinq!.dessous("p"), []);
  const autre = parkedTodo(doc, { records: [rec(6, { who: "Camille" })], chef: "Camille", choices: [], answer: () => {} }) as unknown as Faux;
  assert.equal(ligne(items(autre)[0]!), "waits for Camille · until 2026-12-01");
});

test("each item can have its own buttons, the recommended one filled; without any, no row of buttons", () => {
  const calls: unknown[][] = [];
  const choices = ({ ticket }: { ticket: number }) => (ticket === 7 ? [{ texte: "Yes", recommande: true }, { texte: "No", recommande: false }] : []);
  const todo = parkedTodo(doc, { records: [rec(7), rec(8)], chef: "chef", choices, answer: (...a: unknown[]) => void calls.push(a) }) as unknown as Faux;
  const [sept, huit] = items(todo);
  assert.deepEqual(sept!.dessous("button").map(({ textContent, className }) => [textContent, className]), [["Yes", "recommande"], ["No", ""]]);
  assert.deepEqual(huit!.dessous("div"), []);
  sept!.dessous("button")[1]!.click();
  assert.deepEqual(calls, [[7, "No"]]);
});

test("read-only, an item is listed without any button or park control", () => {
  const todo = parkedTodo(doc, { records: [rec(9)], chef: "chef", choices: ["go"], answer: () => {}, readOnly: "no write access", control: () => new Faux("div") }) as unknown as Faux;
  assert.equal(items(todo).length, 1);
  assert.equal(todo.dessous("button").length, 0);
});

test("with `open`, an item's number and title open its card in one click, its title said on hover; without it, they are only read", () => {
  const ouvertes: number[] = [];
  const todo = parkedTodo(doc, { records: [rec(11, { title: "Le menu" }), rec(12)], chef: "chef", choices: [], answer: () => {}, open: (n) => void ouvertes.push(n), openTitle: (n) => `see #${n}` }) as unknown as Faux;
  const [a, b] = items(todo).map((item) => item.dessous("button")[0]!);
  assert.deepEqual([a!.textContent, b!.textContent, a!.title], ["#11 Le menu", "#12", "see #11"]);
  a!.click();
  assert.deepEqual(ouvertes, [11]);
  const parDefaut = parkedTodo(doc, { records: [rec(10)], chef: "chef", choices: [], answer: () => {}, open: () => {} }) as unknown as Faux;
  assert.equal(parDefaut.dessous("button")[0]?.title, "open #10's card");
  const lu = parkedTodo(doc, { records: [rec(13, { title: "Le menu" })], chef: "chef", choices: [], answer: () => {} }) as unknown as Faux;
  assert.equal(lu.dessous("strong")[0]?.textContent, "#13 Le menu");
  assert.equal(lu.dessous("button").length, 0);
});

test("« park or unpark… » opens the control under its item, closes it, and an opened one stays open on the next render", () => {
  const opened = new Set<number>();
  const control = (r: { ticket: number }) => Object.assign(new Faux("div"), { className: `control-${r.ticket}` });
  const poser = () => parkedTodo(doc, { records: [rec(14), rec(15)], chef: "chef", choices: [], answer: () => {}, control, opened }) as unknown as Faux;
  const controls = (todo: Faux) => todo.dessous("div").filter(({ className }) => className.startsWith("control-")).map(({ className }) => className);
  const todo = poser();
  assert.deepEqual(controls(todo), []);
  const ouvrir = (t: Faux, n: number) => items(t)[n]!.dessous("button").find(({ dataset }) => dataset.action === "open-park")!.click();
  assert.deepEqual(items(todo)[0]!.dessous("button").map(({ textContent }) => textContent), [OPEN_PARK]);
  ouvrir(todo, 1);
  assert.deepEqual(controls(todo), ["control-15"]);
  assert.deepEqual([...opened], [15]);
  assert.deepEqual(controls(poser()), ["control-15"]);
  ouvrir(todo, 1);
  assert.deepEqual(controls(todo), []);
  assert.deepEqual([...opened], []);
  const rouvert = poser();
  ouvrir(rouvert, 0);
  assert.deepEqual(controls(rouvert), ["control-14"]);
  ouvrir(rouvert, 0);
  assert.deepEqual(controls(rouvert), []);
});
