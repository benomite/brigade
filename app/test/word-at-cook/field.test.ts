// Le champ du mot au cook, posé seul devant un faux document (#4048) : ce que les tests gelés ne disent pas — un texte vide
// ne part pas, un envoi en route n'en lance pas un second, Entrée pendant une composition n'envoie rien, et le texte, la
// raison d'un refus et l'envoi en route tiennent quand le rail se redessine.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Fake, repos } from "../helpers/false-vue.ts";
import { setTheWordAtCook } from "../../src/vue/word-at-cook/word-at-cook.js";
import { source } from "../../src/vue/word-at-cook/source.js";

const doc = { createElement: (balise: string) => new Fake(balise) };
type Answer = { ok: true } | { ok: false; reason: string; detail?: string };

// Un faux `send-word` : il note chaque appel et ne répond que quand le test le dit.
function fakeSend() {
  const calls: unknown[][] = [];
  const waits: ((answer: Answer) => void)[] = [];
  Object.assign(source, {
    envoyer: (...args: unknown[]) => {
      calls.push(args);
      return new Promise<Answer>((reply) => waits.push(reply));
    },
  });
  return { appels: calls, repondre: async (answer: Answer) => (waits.shift() ?? assert.fail("aucun envoi en attente"))(answer) };
}

let rank = 0;
const set = (project: string, ticket: number, state: string | undefined) => setTheWordAtCook(doc, project, { ticket, etat: state }) as Fake[];
const fieldOf = (pose: Fake[]) => pose[0]?.dessous("input")[0] ?? assert.fail("pas de champ");
const buttonOf = (pose: Fake[]) => pose[0]?.dessous("button").find((b) => b.textContent === "send") ?? assert.fail("pas de bouton");
const reasonOf = (pose: Fake[]) => [...(pose[0]?.descendants() ?? [])].filter((n) => n.children.length === 0 && n.className === "" && n.textContent !== "" && n.parentElement?.className === "mot-au-cook-raison").map((n) => n.textContent);
const type = (field: Fake, text: string) => {
  field.value = text;
  field.declencher("input");
};
const project = () => `p${++rank}`;

test("only a ticket a cook holds gets the field: taken, in the runtime's word or GitHub's", () => {
  const p = project();
  assert.equal(set(p, 1, "pris").length, 1);
  assert.equal(set(p, 2, "taken").length, 1);
  assert.equal(set(p, 3, "en pass").length, 0);
  assert.equal(set(p, 4, undefined).length, 0);
});

test("a blank word is not sent, by Enter or by the button", async () => {
  const { appels: calls } = fakeSend();
  const pose = set(project(), 14, "pris");
  type(fieldOf(pose), "   ");
  fieldOf(pose).declencher("keydown", { key: "Enter" });
  buttonOf(pose).click();
  await repos();
  assert.equal(calls.length, 0);
  assert.equal(fieldOf(pose).value, "   ");
});

test("another key, or Enter while a composition is open, sends nothing", async () => {
  const { appels: calls } = fakeSend();
  const pose = set(project(), 14, "pris");
  type(fieldOf(pose), "hello");
  fieldOf(pose).declencher("keydown", { key: "a" });
  fieldOf(pose).declencher("keydown", { key: "Enter", isComposing: true } as never);
  await repos();
  assert.equal(calls.length, 0);
  fieldOf(pose).declencher("keydown", { key: "Enter" });
  await repos();
  assert.equal(calls.length, 1);
});

test("while a word is on its way, the field is read-only and a second Enter or click sends nothing", async () => {
  const sending = fakeSend();
  const p = project();
  const pose = set(p, 14, "pris");
  type(fieldOf(pose), "one word");
  fieldOf(pose).declencher("keydown", { key: "Enter" });
  await repos();
  assert.equal(fieldOf(pose).readOnly, true);
  assert.equal(buttonOf(pose).disabled, true);
  fieldOf(pose).declencher("keydown", { key: "Enter" });
  buttonOf(pose).disabled = false;
  buttonOf(pose).click();
  await repos();
  assert.deepEqual(sending.appels, [[{ ticket: 14, text: "one word" }, p]]);
  await sending.repondre({ ok: true });
  await repos();
  assert.equal(fieldOf(pose).readOnly, false);
  assert.equal(buttonOf(pose).disabled, false);
  assert.equal(fieldOf(pose).value, "");
});

test("the typed text, a refusal's reason and its detail survive a redraw of the rail; a later {ok: true} clears them", async () => {
  const sending = fakeSend();
  const p = project();
  type(fieldOf(set(p, 14, "pris")), "draft");
  assert.equal(fieldOf(set(p, 14, "pris")).value, "draft", "le brouillon revient sur la carte redessinée");
  buttonOf(set(p, 14, "pris")).click();
  await repos();
  // Le rail se redessine pendant l'envoi : la réponse va au champ qui est à l'écran.
  const redrawn = set(p, 14, "pris");
  assert.equal(fieldOf(redrawn).readOnly, true);
  await sending.repondre({ ok: false, reason: "no cook holds #14", detail: "the runtime said more" });
  await repos();
  assert.equal(fieldOf(redrawn).value, "draft");
  assert.deepEqual(reasonOf(redrawn), ["no cook holds #14"]);
  assert.ok(redrawn[0]?.descendants().some((n) => n.className === "mot-au-cook-raison" && n.role === "alert"), "la raison se lit d'office");
  assert.ok(redrawn[0]?.dessous("button").some((b) => b.ariaLabel === "the runtime said more"), "le détail au survol");
  const still = set(p, 14, "pris");
  assert.deepEqual(reasonOf(still), ["no cook holds #14"]);
  assert.equal(fieldOf(still).value, "draft");
  buttonOf(still).click();
  await repos();
  await sending.repondre({ ok: true });
  await repos();
  assert.deepEqual(reasonOf(still), []);
  assert.equal(fieldOf(still).value, "");
});

test("a ticket that leaves the kitchen forgets its draft", () => {
  const p = project();
  type(fieldOf(set(p, 14, "pris")), "draft");
  assert.equal(set(p, 14, "en pass").length, 0);
  assert.equal(fieldOf(set(p, 14, "pris")).value, "");
});

test("an answer that arrives after the ticket left the kitchen leaves nothing behind", async () => {
  const sending = fakeSend();
  const p = project();
  type(fieldOf(set(p, 14, "pris")), "too late");
  fieldOf(set(p, 14, "pris")).declencher("keydown", { key: "Enter" });
  await repos();
  assert.equal(set(p, 14, "en pass").length, 0);
  await sending.repondre({ ok: false, reason: "no cook holds #14" });
  await repos();
  const back = set(p, 14, "pris");
  assert.equal(fieldOf(back).value, "");
  assert.deepEqual(reasonOf(back), []);
});
