// Le champ du mot au cook, posé seul devant un faux document (#4048) : ce que les tests gelés ne disent pas — un texte vide
// ne part pas, un envoi en route n'en lance pas un second, Entrée pendant une composition n'envoie rien, et le texte, la
// raison d'un refus et l'envoi en route tiennent quand le rail se redessine.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Faux, repos } from "../aides/fausse-vue.ts";
import { poserLeWordAuCook } from "../../src/vue/word-au-cook/word-au-cook.js";
import { source } from "../../src/vue/word-au-cook/source.js";

const doc = { createElement: (balise: string) => new Faux(balise) };
type Answer = { ok: true } | { ok: false; reason: string; detail?: string };

// Un faux `send-word` : il note chaque appel et ne répond que quand le test le dit.
function fauxEnvoi() {
  const calls: unknown[][] = [];
  const attentes: ((answer: Answer) => void)[] = [];
  Object.assign(source, {
    envoyer: (...args: unknown[]) => {
      calls.push(args);
      return new Promise<Answer>((repondre) => attentes.push(repondre));
    },
  });
  return { appels: calls, repondre: async (answer: Answer) => (attentes.shift() ?? assert.fail("aucun envoi en attente"))(answer) };
}

let rang = 0;
const poser = (project: string, ticket: number, state: string | undefined) => poserLeWordAuCook(doc, project, { ticket, etat: state }) as Faux[];
const champDe = (pose: Faux[]) => pose[0]?.dessous("input")[0] ?? assert.fail("pas de champ");
const buttonDe = (pose: Faux[]) => pose[0]?.dessous("button").find((b) => b.textContent === "send") ?? assert.fail("pas de bouton");
const raisonDe = (pose: Faux[]) => [...(pose[0]?.descendants() ?? [])].filter((n) => n.children.length === 0 && n.className === "" && n.textContent !== "" && n.parentElement?.className === "mot-au-cook-raison").map((n) => n.textContent);
const taper = (champ: Faux, texte: string) => {
  champ.value = texte;
  champ.declencher("input");
};
const project = () => `p${++rang}`;

test("only a ticket a cook holds gets the field: taken, in the runtime's word or GitHub's", () => {
  const p = project();
  assert.equal(poser(p, 1, "pris").length, 1);
  assert.equal(poser(p, 2, "taken").length, 1);
  assert.equal(poser(p, 3, "en pass").length, 0);
  assert.equal(poser(p, 4, undefined).length, 0);
});

test("a blank word is not sent, by Enter or by the button", async () => {
  const { appels: calls } = fauxEnvoi();
  const pose = poser(project(), 14, "pris");
  taper(champDe(pose), "   ");
  champDe(pose).declencher("keydown", { key: "Enter" });
  buttonDe(pose).click();
  await repos();
  assert.equal(calls.length, 0);
  assert.equal(champDe(pose).value, "   ");
});

test("another key, or Enter while a composition is open, sends nothing", async () => {
  const { appels: calls } = fauxEnvoi();
  const pose = poser(project(), 14, "pris");
  taper(champDe(pose), "hello");
  champDe(pose).declencher("keydown", { key: "a" });
  champDe(pose).declencher("keydown", { key: "Enter", isComposing: true } as never);
  await repos();
  assert.equal(calls.length, 0);
  champDe(pose).declencher("keydown", { key: "Enter" });
  await repos();
  assert.equal(calls.length, 1);
});

test("while a word is on its way, the field is read-only and a second Enter or click sends nothing", async () => {
  const envoi = fauxEnvoi();
  const p = project();
  const pose = poser(p, 14, "pris");
  taper(champDe(pose), "one word");
  champDe(pose).declencher("keydown", { key: "Enter" });
  await repos();
  assert.equal(champDe(pose).readOnly, true);
  assert.equal(buttonDe(pose).disabled, true);
  champDe(pose).declencher("keydown", { key: "Enter" });
  buttonDe(pose).disabled = false;
  buttonDe(pose).click();
  await repos();
  assert.deepEqual(envoi.appels, [[{ ticket: 14, text: "one word" }, p]]);
  await envoi.repondre({ ok: true });
  await repos();
  assert.equal(champDe(pose).readOnly, false);
  assert.equal(buttonDe(pose).disabled, false);
  assert.equal(champDe(pose).value, "");
});

test("the typed text, a refusal's reason and its detail survive a redraw of the rail; a later {ok: true} clears them", async () => {
  const envoi = fauxEnvoi();
  const p = project();
  taper(champDe(poser(p, 14, "pris")), "draft");
  assert.equal(champDe(poser(p, 14, "pris")).value, "draft", "le brouillon revient sur la carte redessinée");
  buttonDe(poser(p, 14, "pris")).click();
  await repos();
  // Le rail se redessine pendant l'envoi : la réponse va au champ qui est à l'écran.
  const redessinee = poser(p, 14, "pris");
  assert.equal(champDe(redessinee).readOnly, true);
  await envoi.repondre({ ok: false, reason: "no cook holds #14", detail: "the runtime said more" });
  await repos();
  assert.equal(champDe(redessinee).value, "draft");
  assert.deepEqual(raisonDe(redessinee), ["no cook holds #14"]);
  assert.ok(redessinee[0]?.descendants().some((n) => n.className === "mot-au-cook-raison" && n.role === "alert"), "la raison se lit d'office");
  assert.ok(redessinee[0]?.dessous("button").some((b) => b.ariaLabel === "the runtime said more"), "le détail au survol");
  const encore = poser(p, 14, "pris");
  assert.deepEqual(raisonDe(encore), ["no cook holds #14"]);
  assert.equal(champDe(encore).value, "draft");
  buttonDe(encore).click();
  await repos();
  await envoi.repondre({ ok: true });
  await repos();
  assert.deepEqual(raisonDe(encore), []);
  assert.equal(champDe(encore).value, "");
});

test("a ticket that leaves the kitchen forgets its draft", () => {
  const p = project();
  taper(champDe(poser(p, 14, "pris")), "draft");
  assert.equal(poser(p, 14, "en pass").length, 0);
  assert.equal(champDe(poser(p, 14, "pris")).value, "");
});

test("an answer that arrives after the ticket left the kitchen leaves nothing behind", async () => {
  const envoi = fauxEnvoi();
  const p = project();
  taper(champDe(poser(p, 14, "pris")), "too late");
  champDe(poser(p, 14, "pris")).declencher("keydown", { key: "Enter" });
  await repos();
  assert.equal(poser(p, 14, "en pass").length, 0);
  await envoi.repondre({ ok: false, reason: "no cook holds #14" });
  await repos();
  const revenue = poser(p, 14, "pris");
  assert.equal(champDe(revenue).value, "");
  assert.deepEqual(raisonDe(revenue), []);
});
