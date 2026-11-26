// Le plan de la cuisine (ticket 4238), le module seul (vue/kitchen/kitchen.js) devant un faux document : chaque carte dans la
// colonne de son étape — backlog, le rail en tête, manager, cooks, pass, served —, la carte parked qui dit qui elle attend et
// jusqu'à quand, le TODO — une ligne, puis exactement ce qui attend le chef —, la bande du haut, et le message qui n'existe qu'avec un geste.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Card, Colonne } from "../../../src/facts.ts";
import { aUnAction, ceQuiAwaitingYou, colonneDuPlan, lineParquee, messageDesAlerts, planDeLaKitchen, poserLaBandeDuHaut, poserLeTodo } from "../../../src/vue/kitchen/kitchen.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const card = (ticket: number, state: string, plus: Partial<Card> = {}): Card => ({ ticket, etat: state, titre: `Ticket ${ticket}`, ouvrable: true, attendu: false, attend: [], dit: [], fiche: {} as Card["fiche"], ...plus }) as Card;
const colonne = (name: string, cards: Card[], plus: Partial<Colonne> = {}): Colonne => ({ nom: name, ton: "gris", compte: String(cards.length), cartes: cards, vide: `no ticket in ${name}`, ...plus });
const numeros = (cards: readonly Card[] | undefined) => (cards ?? []).map(({ ticket }) => ticket);
const PARKED = { qui: "Camille", jusqua: "2026-11-28T09:00:00Z" };

describe("chaque carte dans la colonne de son étape", () => {
  test("les colonnes de facts.ts deviennent le plan : backlog, manager, cooks, pass, served — dans cet ordre", () => {
    const plan = planDeLaKitchen([
      colonne("On the rail", [card(10, "en attente")]),
      colonne("Taken", [card(11, "pris")]),
      colonne("Pass", [card(12, "en pass")]),
      colonne("Waiting", []),
      colonne("Served", [card(13, "servi")], { defile: true }),
    ]);
    assert.deepEqual(plan.map(({ nom: name }) => name), ["Backlog", "Manager", "Cooks", "Pass", "Served"]);
    assert.deepEqual(plan.map(({ cartes: cards }) => numeros(cards)), [[10], [], [11], [12], [13]]);
    assert.deepEqual(plan.map(({ compte: account }) => account), ["1", "0", "1", "1", "1"]);
    assert.deepEqual(plan.map(({ ton }) => ton), ["gris", "gris", "bleu", "jaune", "vert"]);
    assert.deepEqual(plan.map(({ defile }) => defile), [undefined, undefined, undefined, undefined, true]);
    // Le vide de chaque colonne est celui que facts.ts dit ; le manager a le sien.
    assert.deepEqual(plan.map(({ vide: empty }) => empty), ["no ticket in On the rail", "no ticket with the manager", "no ticket in Taken", "no ticket in Pass", "no ticket in Served"]);
  });

  test("aucune colonne Waiting : une carte qui attend va dans la colonne de son étape, d'après son mot", () => {
    const wait = [card(21, "pris", { parque: PARKED }), card(22, "en pass", { parque: PARKED }), card(23, "base rouge"), card(24, "servi"), card(25, "WAITING", { parque: PARKED }), card(26, "en attente")];
    const plan = planDeLaKitchen([colonne("On the rail", []), colonne("Waiting", wait)]);
    const de = (name: string) => numeros(plan.find((une) => une.nom === name)?.cartes);
    assert.deepEqual([de("Backlog"), de("Manager"), de("Cooks"), de("Pass"), de("Served")], [[25, 26], [], [21], [22, 23], [24]]);
    assert.ok(!plan.some(({ nom: name }) => /waiting/i.test(name)));
  });

  test("le manager tient sa question avant de découper, posée au chef ou répondue", () => {
    const plan = planDeLaKitchen([colonne("On the rail", [card(60, "en attente", { question: true, attendu: true }), card(61, "en attente")]), colonne("Waiting", [card(62, "en attente", { repondue: { par: "you", a: "2026-11-25T08:00:00Z" } })])]);
    assert.deepEqual(numeros(plan[1]?.cartes), [60, 62]);
    assert.deepEqual(numeros(plan[0]?.cartes), [61]);
    assert.equal(colonneDuPlan("On the rail", card(60, "en attente", { question: true })), "Manager");
    assert.equal(colonneDuPlan("Taken", card(1, "pris")), "Cooks");
    assert.equal(colonneDuPlan("Waiting", card(1, "en pass")), "Pass");
    assert.equal(colonneDuPlan("Waiting", card(1, "86")), "Backlog");
    assert.equal(colonneDuPlan("Une colonne inconnue", card(1, "pris")), "Backlog");
  });

  test("le backlog : le rail en tête, les tickets prêts à cuire ; dessous, ce qui ne l'est pas — rouges d'abord", () => {
    const [backlog] = planDeLaKitchen([
      colonne("On the rail", [card(30, "en attente", { attendu: true, parque: { qui: "the chef", jusqua: null, chef: true } }), card(31, "en attente"), card(32, "tests écrits"), card(33, "BLOQUÉ"), card(34, "en attente", { parque: PARKED })]),
      colonne("Waiting", [card(35, "WAITING", { parque: { ...PARKED, chef: true } })]),
    ]);
    assert.deepEqual(numeros(backlog?.cartes), [30, 35, 31, 32, 33, 34]);
    assert.deepEqual(numeros(backlog?.pretes), [31, 32]);
    assert.deepEqual(numeros(backlog?.pasPretes), [30, 35, 33, 34]);
    // Les autres colonnes ne se coupent pas.
    assert.equal(planDeLaKitchen([colonne("Taken", [card(1, "pris")])])[2]?.pretes, undefined);
  });

  test("une colonne pas connue — la box ne répond pas — rend tout le plan inconnu, sans « 0 »", () => {
    const plan = planDeLaKitchen([colonne("On the rail", [], { compte: "?", vide: "not known while the station is unreachable" }), colonne("Taken", [], { compte: "?" })]);
    assert.deepEqual(plan.map(({ compte: account }) => account), ["?", "?", "?", "?", "?"]);
    assert.equal(plan[1]?.vide, "not known while the station is unreachable");
    assert.deepEqual(planDeLaKitchen([colonne("Taken", [])]).map(({ compte: account }) => account), ["0", "0", "0", "0", "0"]);
  });
});

describe("la carte parked dit qui elle attend et jusqu'à quand", () => {
  test("qui, puis la date, en UTC ; sans date, elle le dit ; une date illisible est dite telle quelle", () => {
    const dit = (parque: { qui: string; jusqua: string | null }) => (lineParquee(doc, parque) as unknown as Faux).textContent;
    assert.equal(dit({ qui: "the chef", jusqua: null }), "parked — waits for the chef, no date set");
    assert.equal(dit({ qui: "Camille", jusqua: "2026-01-05T17:30:00Z" }), "parked — waits for Camille, until 5 Jan, 17:30 UTC");
    assert.equal(dit({ qui: "Camille", jusqua: "next week" }), "parked — waits for Camille, until next week");
    const line = lineParquee(doc, PARKED) as unknown as Faux;
    assert.deepEqual([line.balise, line.className, line.textContent], ["p", "parque", "parked — waits for Camille, until 28 Nov, 09:00 UTC"]);
  });
});

describe("le TODO liste exactement ce qui attend le chef", () => {
  // Ce qui attend le chef est parked pour lui (facts.ts, #4261) ; une relance passée ne la lui rend plus.
  test("les cartes rouges du plan, parked pour le chef comprises, une fois chacune — rien d'autre", () => {
    const pourLeChef = { parque: { qui: "the chef", jusqua: null, chef: true } };
    const plan = planDeLaKitchen([
      colonne("On the rail", [card(50, "en attente", { attendu: true, ...pourLeChef }), card(51, "en attente")]),
      colonne("Taken", [card(52, "pris", { attendu: true, qui: ["bob"] })]),
      colonne("Waiting", [card(53, "pris", { parque: { ...PARKED, chef: true } }), card(54, "pris", { parque: PARKED }), card(55, "WAITING", { relancePassee: true })]),
      colonne("Pass", [card(50, "en pass", { attendu: true, ...pourLeChef })]),
    ]);
    assert.deepEqual(numeros(ceQuiAwaitingYou(plan)), [50, 53]);
  });

  test("une ligne, « 2 wait for you » ; rien quand rien n'attend le chef (#4354)", () => {
    assert.equal(poserLeTodo(doc, { cartes: [], ouvrir: () => {}, deplie: { ouvert: false } }), undefined);
    const un = poserLeTodo(doc, { cartes: [card(50, "en attente", { attendu: true })], ouvrir: () => {}, deplie: { ouvert: false } }) as unknown as Faux;
    assert.deepEqual(un.dessous("button").map(({ textContent }) => textContent), ["1 waits for you"]);
    const deux = poserLeTodo(doc, { cartes: [card(50, "en attente", { attendu: true }), card(53, "pris", { parque: { ...PARKED, chef: true } })], ouvrir: () => {}, deplie: { ouvert: false } }) as unknown as Faux;
    assert.equal(deux.className, "avis-du-todo");
    assert.deepEqual(deux.dessous("button").map(({ textContent }) => textContent), ["2 wait for you"]);
    // Ni question, ni bouton, ni entrée tant que le chef ne l'a pas ouvert.
    assert.deepEqual(deux.dessous("li"), []);
    assert.deepEqual(deux.dessous("p"), []);
  });

  test("un clic montre une entrée par ticket, qui ouvre sa carte d'un clic ; un second les replie ; le dépli se garde (#4354)", () => {
    const ouvertes: number[] = [];
    const deplie = { ouvert: false };
    const todo = poserLeTodo(doc, { cartes: [card(50, "en attente", { attendu: true }), card(53, "pris", { parque: { ...PARKED, chef: true }, titre: undefined })], ouvrir: ({ ticket }) => void ouvertes.push(ticket), deplie }) as unknown as Faux;
    const [line] = todo.dessous("button");
    assert.equal(line?.ariaExpanded, "false");
    line?.click();
    assert.equal(deplie.ouvert, true);
    assert.equal(line?.ariaExpanded, "true");
    const liste = todo.children[1] ?? assert.fail("pas de liste");
    assert.deepEqual([liste.className, liste.ariaLabel], ["todo-du-rail", "What awaits you"]);
    const entrees = todo.dessous("li");
    assert.deepEqual(entrees.map(({ dataset }) => dataset.ticket), ["50", "53"]);
    // Son numéro et son titre ; sous ce qui est demandé, qui il attend et jusqu'à quand (ticket 4281).
    assert.deepEqual(entrees.map((entree) => entree.dessous("button")[0]?.textContent), ["#50 Ticket 50", "#53"]);
    assert.equal(entrees[1]?.dessous("button")[0]?.title, "open #53's card — parked — waits for Camille, until 28 Nov, 09:00 UTC");
    entrees[1]?.dessous("button")[0]?.click();
    assert.deepEqual(ouvertes, [53]);
    line?.click();
    assert.equal(deplie.ouvert, false);
    assert.deepEqual(todo.dessous("li"), []);
    // Le rendu suivant le garde comme le chef l'a laissé.
    const rouvert = poserLeTodo(doc, { cartes: [card(50, "en attente", { attendu: true })], ouvrir: () => {}, deplie: { ouvert: true } }) as unknown as Faux;
    assert.deepEqual(rouvert.dessous("li").map(({ dataset }) => dataset.ticket), ["50"]);
  });
});

describe("la bande du haut : une carte du supervisor et une du closer, sur une ligne (#4354)", () => {
  const ROLES = [
    { role: "supervisor", does: "watches the whole kitchen", latest: { what: "parked #31 for the chef", ticket: 31, at: "2026-11-25T08:30:00Z" } },
    { role: "closer", does: "tidies what is served", latest: { what: "removed dead code", ticket: null, at: "2026-11-25T06:00:00Z" } },
  ];
  const MAINTENANT = Date.parse("2026-11-25T09:00:00Z");
  const bande = (plus: Partial<Parameters<typeof poserLaBandeDuHaut>[1]> = {}) =>
    poserLaBandeDuHaut(doc, { roles: ROLES, montre: () => false, alerte: undefined, maintenant: MAINTENANT, deplies: new Set(), ...plus }) as unknown as Faux;
  const cards = (posee: Faux) => posee.dessous("button").map((une) => [une.dataset.agent, une.textContent]);
  const tons = (posee: Faux) => posee.dessous("span").filter(({ className }) => className === "pastille").map(({ dataset }) => dataset.ton);

  test("son nom, un point d'état et deux ou trois mots — aucune phrase", () => {
    const posee = bande();
    assert.equal(posee.className, "bande-du-haut");
    assert.deepEqual(cards(posee), [["supervisor", "supervisorok"], ["closer", "closertidied 3 h ago"]]);
    assert.deepEqual(tons(posee), ["gris", "gris"]);
    assert.deepEqual(posee.dessous("p"), []);
  });

  test("une issue que la cuisine a ouverte sur elle-même : le supervisor en alerte ; sans rôle, « no tidy yet »", () => {
    const posee = bande({ roles: undefined, alerte: 77 });
    assert.deepEqual(cards(posee), [["supervisor", "supervisoralert: #77"], ["closer", "closerNo tidy yet."]]);
    assert.deepEqual(tons(posee), ["rouge", "gris"]);
  });

  test("un clic déplie son détail — ce qu'il fait, sa dernière action et son heure — ; un second le replie ; le dépli se garde", () => {
    const deplies = new Set<string>();
    const posee = bande({ deplies });
    const [supervisor] = posee.dessous("button");
    supervisor?.click();
    assert.deepEqual(posee.dessous("p").map(({ textContent }) => textContent), ["watches the whole kitchen · last: parked #31 for the chef · 08:30 UTC"]);
    assert.equal(supervisor?.ariaExpanded, "true");
    assert.deepEqual([...deplies], ["supervisor"]);
    assert.deepEqual(bande({ deplies, roles: [] }).dessous("p").map(({ textContent }) => textContent), ["No action yet."]);
    supervisor?.click();
    assert.deepEqual(posee.dessous("p"), []);
    assert.deepEqual([...deplies], []);
  });

  test("un agent que l'équipe lue montre déjà n'a pas de carte ici ; la ligne du délai de prise vient au bout", () => {
    const posee = bande({ montre: (name) => name === "supervisor", delai: "40 % merged within 10 min of their claim" });
    assert.deepEqual(cards(posee), [["closer", "closertidied 3 h ago"]]);
    const [delay] = posee.dessous("span").filter(({ className }) => className === "ligne-du-delai");
    assert.deepEqual([delay?.textContent, delay?.title], ["40 % merged within 10 min of their claim", "40 % merged within 10 min of their claim"]);
  });
});

describe("aucun message sans un geste que le chef peut faire", () => {
  type Alert = Parameters<typeof messageDesAlerts>[1][number];
  const alert = (plus: Partial<Alert>): Alert => ({ sorte: "base-rouge", phrase: "Main is red.", fait: { depuis: "2026-11-25T08:00:00Z" }, geste: "Open the failing check", geree: null, ...plus }) as Alert;
  const lineDe = (avecButton: boolean) => (une: Alert) => {
    const line = new Faux("p");
    line.append(une.phrase, ...(avecButton ? [new Faux("button")] : []));
    return [line] as unknown as HTMLElement[];
  };

  test("une alerte que la cuisine prend en charge seule n'est pas montrée ; la suivante l'est", () => {
    const vues = messageDesAlerts(doc, [alert({ geste: null, geree: "The kitchen repairs it.", phrase: "Handled.", fait: { depuis: "x", ticket: 4 } }), alert({ phrase: "Shown.", bouton: "ajouter-a-une-station" })], lineDe(true), { ouvrirTicket: () => {}, ouvrirLesChecks: () => {} }) as unknown as Faux[];
    assert.deepEqual(vues.map(({ textContent }) => textContent), ["Shown."]);
  });

  test("sans bouton du runtime : ouvrir son ticket, sinon les checks du dépôt ; sans l'un ni l'autre, rien", () => {
    const calls: string[] = [];
    const actions = { ouvrirTicket: (ticket: number) => void calls.push(`#${ticket}`), ouvrirLesChecks: () => void calls.push("checks") };
    const [duTicket] = messageDesAlerts(doc, [alert({ fait: { depuis: "x", ticket: 12, check: "tests" } })], lineDe(false), actions) as unknown as Faux[];
    assert.deepEqual(duTicket?.dessous("button").map(({ textContent }) => textContent), ["open #12"]);
    duTicket?.dessous("button")[0]?.click();
    const [duCheck] = messageDesAlerts(doc, [alert({ fait: { depuis: "x", check: "tests" } })], lineDe(false), actions) as unknown as Faux[];
    assert.deepEqual(duCheck?.dessous("button").map(({ textContent }) => textContent), ["open the checks"]);
    duCheck?.dessous("button")[0]?.click();
    assert.deepEqual(calls, ["#12", "checks"]);
    assert.deepEqual(messageDesAlerts(doc, [alert({ fait: { depuis: "x", check: "tests" } })], lineDe(false), { ...actions, ouvrirLesChecks: undefined }), []);
    assert.deepEqual(messageDesAlerts(doc, [alert({ fait: { depuis: "x" } })], lineDe(false), actions), []);
    assert.deepEqual(messageDesAlerts(doc, [alert({})], () => [], actions), []);
  });

  test("le bouton du runtime suffit : la ligne est montrée telle quelle", () => {
    const [line] = messageDesAlerts(doc, [alert({ fait: { depuis: "x", ticket: 3 } })], lineDe(true), { ouvrirTicket: () => {}, ouvrirLesChecks: () => {} }) as unknown as Faux[];
    assert.equal(line?.dessous("button").length, 1);
    assert.equal(aUnAction([new Faux("p")] as unknown as HTMLElement[]), false);
    assert.equal(aUnAction([new Faux("p"), line] as unknown as HTMLElement[]), true);
  });
});
