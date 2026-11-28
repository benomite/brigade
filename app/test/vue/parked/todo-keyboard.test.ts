// Le TODO du chef au clavier (ticket 4646) : sur l'entrée qui a le focus, `1` à `5` répondent ses choix comme ses boutons,
// Entrée le recommandé, Échap la replie sur une ligne (« later ») qu'Entrée rouvre ; répondue, l'entrée dit en une ligne la
// réponse envoyée, et le focus passe à la suivante. D'abord le module seul, puis le TODO du rail, puis la vue jouée.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../../../src/bar.ts";
import type { CardOfTodo } from "../../../src/card-todo.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { holdFacts, type Card, type Facts } from "../../../src/facts.ts";
import { HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { parkedTodo } from "../../../src/vue/parked/parked-todo.js";
import { setTheTodo } from "../../../src/vue/kitchen/kitchen.js";
import { Fake, type Played, playTheVue, repos } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const rec = (ticket: number) => ({ ticket, who: "chef", what: `thing ${ticket}`, until: null, step: "Cooks" });
const items = (todo: Fake) => todo.dessous("li");
const shown = (item: Fake) => item.children.filter(({ hidden }) => !hidden).map(({ textContent }) => textContent);
const head = (todo: Fake) => todo.dessous("p").find(({ className }) => className === "tete-du-todo")?.textContent;
// Une touche frappée sur l'entrée qui a le focus ; rend si elle a été prise.
const press = (item: Fake, key: string, target: Fake = item) => {
  let taken = false;
  item.declencher("keydown", { key, target, preventDefault: () => void (taken = true) });
  return taken;
};
const CHOICES = [{ texte: "Yes", recommande: true }, { texte: "No", recommande: false }];

describe("une entrée du TODO se répond au clavier", () => {
  test("avec deux cartes qui attendent, `1` sur la première poste son premier choix, comme son bouton, et le focus passe à la seconde", () => {
    const calls: unknown[][] = [];
    const todo = parkedTodo(doc, { records: [rec(1), rec(2)], chef: "chef", choices: () => CHOICES, answer: (...a: unknown[]) => void calls.push(a) }) as unknown as Fake;
    const [first, second] = items(todo) as [Fake, Fake];
    assert.deepEqual([first.tabIndex, second.tabIndex], [0, 0]);
    assert.equal(press(first, "1"), true);
    const byButton: unknown[][] = [];
    const other = parkedTodo(doc, { records: [rec(1), rec(2)], chef: "chef", choices: () => CHOICES, answer: (...a: unknown[]) => void byButton.push(a) }) as unknown as Fake;
    items(other)[0]!.dessous("button").find(({ textContent }) => textContent === "Yes")!.click();
    assert.deepEqual(calls, [[1, "Yes"]]);
    assert.deepEqual(calls, byButton);
    assert.equal(second.focalise, 1);
    assert.equal(first.focalise, 0);
    // Une touche de plus sur l'entrée répondue ne poste rien d'autre ; `2` sur la seconde poste son second choix.
    press(first, "2");
    press(second, "2");
    assert.deepEqual(calls, [[1, "Yes"], [2, "No"]]);
  });

  test("Entrée sur une carte qui a un choix recommandé poste ce choix ; sans recommandé, elle ne poste rien", () => {
    const calls: unknown[][] = [];
    const choices = ({ ticket }: { ticket: number }) => (ticket === 3 ? [{ texte: "Keep", recommande: false }, { texte: "Ship", recommande: true }] : [{ texte: "Maybe" }]);
    const todo = parkedTodo(doc, { records: [rec(3), rec(4)], chef: "chef", choices, answer: (...a: unknown[]) => void calls.push(a) }) as unknown as Fake;
    const [three, four] = items(todo) as [Fake, Fake];
    assert.equal(press(four, "Enter"), false);
    assert.equal(press(three, "Enter"), true);
    assert.deepEqual(calls, [[3, "Ship"]]);
    // Entrée sur un bouton de l'entrée reste le clic de ce bouton : l'entrée ne le double pas.
    const later = parkedTodo(doc, { records: [rec(5)], chef: "chef", choices: () => CHOICES, answer: (...a: unknown[]) => void (calls as unknown[][]).push(a) }) as unknown as Fake;
    const five = items(later)[0]!;
    assert.equal(press(five, "Enter", five.dessous("button")[1]), false);
    assert.deepEqual(calls, [[3, "Ship"]]);
  });

  test("Échap replie la carte sur une ligne, « later », sans rien poster ; Entrée sur cette ligne la rouvre", () => {
    const calls: unknown[][] = [];
    const later = new Set<number>();
    const set = () => parkedTodo(doc, { records: [rec(6), rec(7)], chef: "chef", choices: () => CHOICES, answer: (...a: unknown[]) => void calls.push(a), later }) as unknown as Fake;
    const todo = set();
    const six = items(todo)[0]!;
    assert.equal(press(six, "Escape"), true);
    assert.deepEqual(shown(six), ["#6 · later"]);
    assert.equal(six.dataset.plie, "");
    // Repliée, ses touches de choix ne répondent pas, et elle compte toujours.
    assert.equal(press(six, "1"), false);
    assert.equal(head(todo), "TODO (2)");
    // Remise à plus tard, elle le reste d'un rendu à l'autre.
    assert.deepEqual(shown(items(set())[0]!), ["#6 · later"]);
    assert.equal(press(six, "Enter"), true);
    assert.deepEqual(shown(six), ["#6", "thing 6", "waits for chef · no date set", "YesNo"]);
    assert.equal("plie" in six.dataset, false);
    assert.deepEqual([...later], []);
    assert.deepEqual(calls, []);
    // Une frappe dans un champ de l'entrée (le contrôle de park) est du texte : Échap n'y replie rien.
    assert.equal(press(six, "Escape", new Fake("input")), false);
  });

  test("une carte répondue, au clavier ou à la souris, montre une ligne avec la réponse envoyée, gardée d'un rendu à l'autre", () => {
    const answered = new Map<number, string>();
    const set = () => parkedTodo(doc, { records: [rec(8), rec(9)], chef: "chef", choices: () => CHOICES, answer: () => {}, answered }) as unknown as Fake;
    const todo = set();
    const [eight, nine] = items(todo) as [Fake, Fake];
    press(eight, "2");
    nine.dessous("button").find(({ textContent }) => textContent === "Yes")!.click();
    assert.deepEqual(shown(eight), ["#8 · answered: “No”"]);
    assert.deepEqual(shown(nine), ["#9 · answered: “Yes”"]);
    assert.equal(head(todo), "TODO (0)");
    const again = set();
    assert.deepEqual(items(again).map((item) => item.textContent), ["#8 · answered: “No”", "#9 · answered: “Yes”"]);
    assert.deepEqual(again.dessous("button"), []);
    assert.equal(head(again), "TODO (0)");
  });

  test("l'entrée porte la clé où la vue lui rend le clavier ; en lecture seule, elle ne prend pas le focus", () => {
    const todo = parkedTodo(doc, { records: [rec(10)], chef: "chef", choices: () => CHOICES, answer: () => {} }) as unknown as Fake;
    assert.deepEqual({ ...items(todo)[0]!.dataset }, { ticket: "10", cle: "entree-du-todo#10", champ: "entree-du-todo" });
    const readOnly = parkedTodo(doc, { records: [rec(10)], chef: "chef", choices: () => CHOICES, answer: () => {}, readOnly: "no" }) as unknown as Fake;
    assert.equal(items(readOnly)[0]!.tabIndex, -1);
  });
});

const PARKED = { qui: "the chef", jusqua: null, chef: true };
const card = (ticket: number, more: Partial<Card> = {}): Card => ({ ticket, titre: `Ticket ${ticket}`, ouvrable: true, attendu: true, attend: [], dit: [], fiche: {} as Card["fiche"], parque: { ...PARKED, quoi: "Ship it?" }, ...more }) as Card;
const todoCard = (more: Partial<CardOfTodo> = {}): CardOfTodo => ({ sorte: "product-question", question: "Ship it?", choix: [{ texte: "Yes", prix: "" }, { texte: "No", prix: "" }], prixDuTexte: "", ...more });

describe("le TODO du rail, au clavier", () => {

  test("redessinée, une carte dont la réponse est en route ou attend la cuisine dit la réponse ; refusée, ses boutons reviennent ; partie du TODO, elle est oubliée", () => {
    const answered = new Map<number, string>();
    const later = new Set<number>([52]);
    let state: unknown = { etape: "envoi", reponse: { question: "Ship it?", choix: 2 } };
    const gestures = { etat: () => state as never, jouer: () => {} };
    const set = (cards: Card[]) => setTheTodo(doc, { deplie: { ouvert: true }, cartes: cards, ouvrir: () => {}, gestes: gestures as never, answered, later }) as unknown as Fake;
    // Répondue sur sa fiche : l'entrée du TODO le dit aussi.
    assert.deepEqual(set([card(50, { todo: todoCard() })]).dessous("li").map((li) => li.textContent), ["#50 Ticket 50 · answered: “No”"]);
    state = { etape: "repos" };
    assert.deepEqual(set([card(50, { todo: todoCard({ envoi: { etat: "attente", reponse: "No", commentaire: 3 } } as never) })]).dessous("li").map((li) => li.textContent), ["#50 Ticket 50 · answered: “No”"]);
    state = { etape: "refus", dit: "GitHub said no", detail: "" };
    const refused = set([card(50, { todo: todoCard() })]);
    assert.deepEqual(refused.dessous("li")[0]!.dessous("button").slice(1).map(({ textContent }) => textContent), ["Yes", "No"]);
    set([card(53, { todo: todoCard() })]);
    assert.deepEqual([[...answered], [...later]], [[], []]);
  });
});

// La vue jouée : `1` sur l'entrée du TODO part comme depuis la carte, et le redessin garde l'entrée repliée sur sa réponse.
const PARADE = "parade";
const A = "2026-11-25T09:00:00.000Z";
const url = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const QUESTION = { sorte: "product-question", texte: "Ship the export as CSV?\n- [resume] Yes, ship it\n- [close] No, drop it" };
const WORLD: Facts = {
  etat: "ouverte", lu: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, attend: [{ ticket: 50, titre: "Ticket 50", url: url(50), chef: QUESTION }, { ticket: 51, titre: "Ticket 51", url: url(51), chef: QUESTION }],
} as unknown as Facts;
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE, exemple: EXAMPLE, rubriques: HEADINGS,
  calibrage: { modeles: MODELS, efforts: EFFORTS }, });
async function show(): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], ouvrirIssue: () => true, repondreCarte: () => ({ repondue: true, dit: "posted", commentaire: 7 }) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(WORLD) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const theTodo = (vue: Played): Fake => {
  const opinion = vue.element("rail").children.find(({ className }) => className === "avis-du-todo") ?? assert.fail("pas de TODO");
  const [line] = opinion.dessous("button");
  if (line?.ariaExpanded !== "true") line?.click();
  return opinion.children.find(({ className }) => className === "todo-du-rail") ?? assert.fail("TODO pas déplié");
};
const entryOf = (vue: Played, ticket: number): Fake => theTodo(vue).dessous("li").find(({ dataset }) => dataset.ticket === String(ticket)) ?? assert.fail(`pas d'entrée #${ticket}`);

test("la vue : `1` sur une entrée du TODO poste son premier choix par le pont, et l'entrée redessinée dit la réponse envoyée", async () => {
  const vue = await show();
  press(entryOf(vue, 50), "1");
  await repos();
  assert.deepEqual(vue.appels.filter(({ geste }) => geste === "repondreCarte").map(({ args }) => args), [[PARADE, 50, { question: "Ship the export as CSV?", choix: 1 }]]);
  assert.equal(entryOf(vue, 50).textContent, "#50 Ticket 50 · answered: “Yes, ship it”");
  assert.equal(entryOf(vue, 51).tabIndex, 0);
});
