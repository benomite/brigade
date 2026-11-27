// Le plan de la cuisine (ticket 4238), le module seul (vue/kitchen/kitchen.js) devant un faux document : chaque carte dans la
// colonne de son étape — backlog, le rail en tête, manager, cooks, pass, served —, la carte parked qui dit qui elle attend et
// jusqu'à quand, le TODO — une ligne, puis exactement ce qui attend le chef —, la bande du haut, et le message qui n'existe qu'avec un geste.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Card, Column } from "../../../src/facts.ts";
import { aOneAction, whatAwaitingYou, columnOfPlan, lineParked, messageOfAlerts, planOfTheKitchen, setTheBandOfTop, setTheTodo } from "../../../src/vue/kitchen/kitchen.js";
import { Fake } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const card = (ticket: number, state: string, more: Partial<Card> = {}): Card => ({ ticket, etat: state, titre: `Ticket ${ticket}`, ouvrable: true, attendu: false, attend: [], dit: [], fiche: {} as Card["fiche"], ...more }) as Card;
const column = (name: string, cards: Card[], more: Partial<Column> = {}): Column => ({ nom: name, ton: "gris", compte: String(cards.length), cartes: cards, vide: `no ticket in ${name}`, ...more });
const numbers = (cards: readonly Card[] | undefined) => (cards ?? []).map(({ ticket }) => ticket);
const PARKED = { qui: "Camille", jusqua: "2026-11-28T09:00:00Z" };

describe("chaque carte dans la colonne de son étape", () => {
  test("les colonnes de facts.ts deviennent le plan : backlog, manager, cooks, pass, served — dans cet ordre", () => {
    const plan = planOfTheKitchen([
      column("On the rail", [card(10, "en attente")]),
      column("Taken", [card(11, "pris")]),
      column("Pass", [card(12, "en pass")]),
      column("Waiting", []),
      column("Served", [card(13, "servi")], { defile: true }),
    ]);
    assert.deepEqual(plan.map(({ nom: name }) => name), ["Backlog", "Manager", "Cooks", "Pass", "Served"]);
    assert.deepEqual(plan.map(({ cartes: cards }) => numbers(cards)), [[10], [], [11], [12], [13]]);
    assert.deepEqual(plan.map(({ compte: account }) => account), ["1", "0", "1", "1", "1"]);
    assert.deepEqual(plan.map(({ ton: your }) => your), ["gris", "gris", "bleu", "jaune", "vert"]);
    assert.deepEqual(plan.map(({ defile: scrolls }) => scrolls), [undefined, undefined, undefined, undefined, true]);
    // Le vide de chaque colonne est celui que facts.ts dit ; le manager a le sien.
    assert.deepEqual(plan.map(({ vide: empty }) => empty), ["no ticket in On the rail", "no ticket with the manager", "no ticket in Taken", "no ticket in Pass", "no ticket in Served"]);
  });

  test("aucune colonne Waiting : une carte qui attend va dans la colonne de son étape, d'après son mot", () => {
    const wait = [card(21, "pris", { parque: PARKED }), card(22, "en pass", { parque: PARKED }), card(23, "base rouge"), card(24, "servi"), card(25, "WAITING", { parque: PARKED }), card(26, "en attente")];
    const plan = planOfTheKitchen([column("On the rail", []), column("Waiting", wait)]);
    const of = (name: string) => numbers(plan.find((one) => one.nom === name)?.cartes);
    assert.deepEqual([of("Backlog"), of("Manager"), of("Cooks"), of("Pass"), of("Served")], [[25, 26], [], [21], [22, 23], [24]]);
    assert.ok(!plan.some(({ nom: name }) => /waiting/i.test(name)));
  });

  test("le manager tient sa question avant de découper, posée au chef ou répondue", () => {
    const plan = planOfTheKitchen([column("On the rail", [card(60, "en attente", { question: true, attendu: true }), card(61, "en attente")]), column("Waiting", [card(62, "en attente", { repondue: { par: "you", a: "2026-11-25T08:00:00Z" } })])]);
    assert.deepEqual(numbers(plan[1]?.cartes), [60, 62]);
    assert.deepEqual(numbers(plan[0]?.cartes), [61]);
    assert.equal(columnOfPlan("On the rail", card(60, "en attente", { question: true })), "Manager");
    assert.equal(columnOfPlan("Taken", card(1, "pris")), "Cooks");
    assert.equal(columnOfPlan("Waiting", card(1, "en pass")), "Pass");
    assert.equal(columnOfPlan("Waiting", card(1, "86")), "Backlog");
    assert.equal(columnOfPlan("Une colonne inconnue", card(1, "pris")), "Backlog");
  });

  test("le backlog : le rail en tête, les tickets prêts à cuire ; dessous, ce qui ne l'est pas — rouges d'abord", () => {
    const [backlog] = planOfTheKitchen([
      column("On the rail", [card(30, "en attente", { attendu: true, parque: { qui: "the chef", jusqua: null, chef: true } }), card(31, "en attente"), card(32, "tests écrits"), card(33, "BLOQUÉ"), card(34, "en attente", { parque: PARKED })]),
      column("Waiting", [card(35, "WAITING", { parque: { ...PARKED, chef: true } })]),
    ]);
    assert.deepEqual(numbers(backlog?.cartes), [30, 35, 31, 32, 33, 34]);
    assert.deepEqual(numbers(backlog?.pretes), [31, 32]);
    assert.deepEqual(numbers(backlog?.pasPretes), [30, 35, 33, 34]);
    // Les autres colonnes ne se coupent pas.
    assert.equal(planOfTheKitchen([column("Taken", [card(1, "pris")])])[2]?.pretes, undefined);
  });

  test("une colonne pas connue — la box ne répond pas — rend tout le plan inconnu, sans « 0 »", () => {
    const plan = planOfTheKitchen([column("On the rail", [], { compte: "?", vide: "not known while the station is unreachable" }), column("Taken", [], { compte: "?" })]);
    assert.deepEqual(plan.map(({ compte: account }) => account), ["?", "?", "?", "?", "?"]);
    assert.equal(plan[1]?.vide, "not known while the station is unreachable");
    assert.deepEqual(planOfTheKitchen([column("Taken", [])]).map(({ compte: account }) => account), ["0", "0", "0", "0", "0"]);
  });
});

describe("la carte parked dit qui elle attend et jusqu'à quand", () => {
  test("qui, puis la date, en UTC ; sans date, elle le dit ; une date illisible est dite telle quelle", () => {
    const said = (parked: { qui: string; jusqua: string | null }) => (lineParked(doc, parked) as unknown as Fake).textContent;
    assert.equal(said({ qui: "the chef", jusqua: null }), "parked — waits for the chef, no date set");
    assert.equal(said({ qui: "Camille", jusqua: "2026-01-05T17:30:00Z" }), "parked — waits for Camille, until 5 Jan, 17:30 UTC");
    assert.equal(said({ qui: "Camille", jusqua: "next week" }), "parked — waits for Camille, until next week");
    const line = lineParked(doc, PARKED) as unknown as Fake;
    assert.deepEqual([line.balise, line.className, line.textContent], ["p", "parque", "parked — waits for Camille, until 28 Nov, 09:00 UTC"]);
  });
});

describe("le TODO liste exactement ce qui attend le chef", () => {
  // Ce qui attend le chef est parked pour lui (facts.ts, #4261) ; une relance passée ne la lui rend plus.
  test("les cartes rouges du plan, parked pour le chef comprises, une fois chacune — rien d'autre", () => {
    const forTheChef = { parque: { qui: "the chef", jusqua: null, chef: true } };
    const plan = planOfTheKitchen([
      column("On the rail", [card(50, "en attente", { attendu: true, ...forTheChef }), card(51, "en attente")]),
      column("Taken", [card(52, "pris", { attendu: true, qui: ["bob"] })]),
      column("Waiting", [card(53, "pris", { parque: { ...PARKED, chef: true } }), card(54, "pris", { parque: PARKED }), card(55, "WAITING", { relancePassee: true })]),
      column("Pass", [card(50, "en pass", { attendu: true, ...forTheChef })]),
    ]);
    assert.deepEqual(numbers(whatAwaitingYou(plan)), [50, 53]);
  });

  test("une ligne, « 2 wait for you » ; rien quand rien n'attend le chef (#4354)", () => {
    assert.equal(setTheTodo(doc, { cartes: [], ouvrir: () => {}, deplie: { ouvert: false } }), undefined);
    const oneOf = setTheTodo(doc, { cartes: [card(50, "en attente", { attendu: true })], ouvrir: () => {}, deplie: { ouvert: false } }) as unknown as Fake;
    assert.deepEqual(oneOf.dessous("button").map(({ textContent }) => textContent), ["1 waits for you"]);
    const two = setTheTodo(doc, { cartes: [card(50, "en attente", { attendu: true }), card(53, "pris", { parque: { ...PARKED, chef: true } })], ouvrir: () => {}, deplie: { ouvert: false } }) as unknown as Fake;
    assert.equal(two.className, "avis-du-todo");
    assert.deepEqual(two.dessous("button").map(({ textContent }) => textContent), ["2 wait for you"]);
    // Ni question, ni bouton, ni entrée tant que le chef ne l'a pas ouvert.
    assert.deepEqual(two.dessous("li"), []);
    assert.deepEqual(two.dessous("p"), []);
  });

  test("un clic montre une entrée par ticket, qui ouvre sa carte d'un clic ; un second les replie ; le dépli se garde (#4354)", () => {
    const openEntries: number[] = [];
    const unfolded = { ouvert: false };
    const todo = setTheTodo(doc, { cartes: [card(50, "en attente", { attendu: true }), card(53, "pris", { parque: { ...PARKED, chef: true }, titre: undefined })], ouvrir: ({ ticket }) => void openEntries.push(ticket), deplie: unfolded }) as unknown as Fake;
    const [line] = todo.dessous("button");
    assert.equal(line?.ariaExpanded, "false");
    line?.click();
    assert.equal(unfolded.ouvert, true);
    assert.equal(line?.ariaExpanded, "true");
    const list = todo.children[1] ?? assert.fail("pas de liste");
    assert.deepEqual([list.className, list.ariaLabel], ["todo-du-rail", "What awaits you"]);
    const entries = todo.dessous("li");
    assert.deepEqual(entries.map(({ dataset }) => dataset.ticket), ["50", "53"]);
    // Son numéro et son titre ; sous ce qui est demandé, qui il attend et jusqu'à quand (ticket 4281).
    assert.deepEqual(entries.map((entry) => entry.dessous("button")[0]?.textContent), ["#50 Ticket 50", "#53"]);
    assert.equal(entries[1]?.dessous("button")[0]?.title, "open #53's card — parked — waits for Camille, until 28 Nov, 09:00 UTC");
    entries[1]?.dessous("button")[0]?.click();
    assert.deepEqual(openEntries, [53]);
    line?.click();
    assert.equal(unfolded.ouvert, false);
    assert.deepEqual(todo.dessous("li"), []);
    // Le rendu suivant le garde comme le chef l'a laissé.
    const reopened = setTheTodo(doc, { cartes: [card(50, "en attente", { attendu: true })], ouvrir: () => {}, deplie: { ouvert: true } }) as unknown as Fake;
    assert.deepEqual(reopened.dessous("li").map(({ dataset }) => dataset.ticket), ["50"]);
  });
});

describe("la bande du haut : une carte du supervisor et une du closer, sur une ligne (#4354)", () => {
  const ROLES = [
    { role: "supervisor", does: "watches the whole kitchen", latest: { what: "parked #31 for the chef", ticket: 31, at: "2026-11-25T08:30:00Z" } },
    { role: "closer", does: "tidies what is served", latest: { what: "removed dead code", ticket: null, at: "2026-11-25T06:00:00Z" } },
  ];
  const NOW = Date.parse("2026-11-25T09:00:00Z");
  const band = (more: Partial<Parameters<typeof setTheBandOfTop>[1]> = {}) =>
    setTheBandOfTop(doc, { roles: ROLES, montre: () => false, alerte: undefined, maintenant: NOW, deplies: new Set(), ...more }) as unknown as Fake;
  const cards = (setOne: Fake) => setOne.dessous("button").map((one) => [one.dataset.agent, one.textContent]);
  const tones = (setOne: Fake) => setOne.dessous("span").filter(({ className }) => className === "pastille").map(({ dataset }) => dataset.ton);

  test("son nom, un point d'état et deux ou trois mots — aucune phrase", () => {
    const setOne = band();
    assert.equal(setOne.className, "bande-du-haut");
    assert.deepEqual(cards(setOne), [["supervisor", "supervisorok"], ["closer", "closertidied 3 h ago"]]);
    assert.deepEqual(tones(setOne), ["gris", "gris"]);
    assert.deepEqual(setOne.dessous("p"), []);
  });

  test("une issue que la cuisine a ouverte sur elle-même : le supervisor en alerte ; sans rôle, « no tidy yet »", () => {
    const setOne = band({ roles: undefined, alerte: 77 });
    assert.deepEqual(cards(setOne), [["supervisor", "supervisoralert: #77"], ["closer", "closerNo tidy yet."]]);
    assert.deepEqual(tones(setOne), ["rouge", "gris"]);
  });

  test("un clic déplie son détail — ce qu'il fait, sa dernière action et son heure — ; un second le replie ; le dépli se garde", () => {
    const unfoldedOnes = new Set<string>();
    const setOne = band({ deplies: unfoldedOnes });
    const [supervisor] = setOne.dessous("button");
    supervisor?.click();
    assert.deepEqual(setOne.dessous("p").map(({ textContent }) => textContent), ["watches the whole kitchen · last: parked #31 for the chef · 08:30 UTC"]);
    assert.equal(supervisor?.ariaExpanded, "true");
    assert.deepEqual([...unfoldedOnes], ["supervisor"]);
    assert.deepEqual(band({ deplies: unfoldedOnes, roles: [] }).dessous("p").map(({ textContent }) => textContent), ["No action yet."]);
    supervisor?.click();
    assert.deepEqual(setOne.dessous("p"), []);
    assert.deepEqual([...unfoldedOnes], []);
  });

  test("un agent que l'équipe lue montre déjà n'a pas de carte ici ; la ligne du délai de prise vient au bout", () => {
    const setOne = band({ montre: (name) => name === "supervisor", delai: "40 % merged within 10 min of their claim" });
    assert.deepEqual(cards(setOne), [["closer", "closertidied 3 h ago"]]);
    const [delay] = setOne.dessous("span").filter(({ className }) => className === "ligne-du-delai");
    assert.deepEqual([delay?.textContent, delay?.title], ["40 % merged within 10 min of their claim", "40 % merged within 10 min of their claim"]);
  });
});

describe("aucun message sans un geste que le chef peut faire", () => {
  type Alert = Parameters<typeof messageOfAlerts>[1][number];
  const alert = (more: Partial<Alert>): Alert => ({ sorte: "base-rouge", phrase: "Main is red.", fait: { depuis: "2026-11-25T08:00:00Z" }, geste: "Open the failing check", geree: null, ...more }) as Alert;
  const lineOf = (withButton: boolean) => (one: Alert) => {
    const line = new Fake("p");
    line.append(one.phrase, ...(withButton ? [new Fake("button")] : []));
    return [line] as unknown as HTMLElement[];
  };

  test("une alerte que la cuisine prend en charge seule n'est pas montrée ; la suivante l'est", () => {
    const views = messageOfAlerts(doc, [alert({ geste: null, geree: "The kitchen repairs it.", phrase: "Handled.", fait: { depuis: "x", ticket: 4 } }), alert({ phrase: "Shown.", bouton: "ajouter-a-une-station" })], lineOf(true), { ouvrirTicket: () => {}, ouvrirLesChecks: () => {} }) as unknown as Fake[];
    assert.deepEqual(views.map(({ textContent }) => textContent), ["Shown."]);
  });

  test("sans bouton du runtime : ouvrir son ticket, sinon les checks du dépôt ; sans l'un ni l'autre, rien", () => {
    const calls: string[] = [];
    const actions = { ouvrirTicket: (ticket: number) => void calls.push(`#${ticket}`), ouvrirLesChecks: () => void calls.push("checks") };
    const [ofTicket] = messageOfAlerts(doc, [alert({ fait: { depuis: "x", ticket: 12, check: "tests" } })], lineOf(false), actions) as unknown as Fake[];
    assert.deepEqual(ofTicket?.dessous("button").map(({ textContent }) => textContent), ["open #12"]);
    ofTicket?.dessous("button")[0]?.click();
    const [ofCheck] = messageOfAlerts(doc, [alert({ fait: { depuis: "x", check: "tests" } })], lineOf(false), actions) as unknown as Fake[];
    assert.deepEqual(ofCheck?.dessous("button").map(({ textContent }) => textContent), ["open the checks"]);
    ofCheck?.dessous("button")[0]?.click();
    assert.deepEqual(calls, ["#12", "checks"]);
    assert.deepEqual(messageOfAlerts(doc, [alert({ fait: { depuis: "x", check: "tests" } })], lineOf(false), { ...actions, ouvrirLesChecks: undefined }), []);
    assert.deepEqual(messageOfAlerts(doc, [alert({ fait: { depuis: "x" } })], lineOf(false), actions), []);
    assert.deepEqual(messageOfAlerts(doc, [alert({})], () => [], actions), []);
  });

  test("le bouton du runtime suffit : la ligne est montrée telle quelle", () => {
    const [line] = messageOfAlerts(doc, [alert({ fait: { depuis: "x", ticket: 3 } })], lineOf(true), { ouvrirTicket: () => {}, ouvrirLesChecks: () => {} }) as unknown as Fake[];
    assert.equal(line?.dessous("button").length, 1);
    assert.equal(aOneAction([new Fake("p")] as unknown as HTMLElement[]), false);
    assert.equal(aOneAction([new Fake("p"), line] as unknown as HTMLElement[]), true);
  });
});
