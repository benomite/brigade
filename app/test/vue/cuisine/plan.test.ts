// Le plan de la cuisine (ticket 4238), le module seul (vue/cuisine/cuisine.js) devant un faux document : chaque carte dans la
// colonne de son étape — backlog, le rail en tête, manager, cooks, pass, served —, la carte parked qui dit qui elle attend et
// jusqu'à quand, le TODO qui liste exactement ce qui attend le chef, la bande du haut, et le message qui n'existe qu'avec un geste.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Carte, Colonne } from "../../../src/faits.ts";
import { aUnGeste, ceQuiTAttend, colonneDuPlan, ligneParquee, messageDesAlertes, planDeLaCuisine, poserLaBandeDuHaut, poserLeTodo } from "../../../src/vue/cuisine/cuisine.js";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const carte = (ticket: number, etat: string, plus: Partial<Carte> = {}): Carte => ({ ticket, etat, titre: `Ticket ${ticket}`, ouvrable: true, attendu: false, attend: [], dit: [], fiche: {} as Carte["fiche"], ...plus }) as Carte;
const colonne = (nom: string, cartes: Carte[], plus: Partial<Colonne> = {}): Colonne => ({ nom, ton: "gris", compte: String(cartes.length), cartes, vide: `no ticket in ${nom}`, ...plus });
const numeros = (cartes: readonly Carte[] | undefined) => (cartes ?? []).map(({ ticket }) => ticket);
const PARKED = { qui: "Camille", jusqua: "2026-11-28T09:00:00Z" };

describe("chaque carte dans la colonne de son étape", () => {
  test("les colonnes de faits.ts deviennent le plan : backlog, manager, cooks, pass, served — dans cet ordre", () => {
    const plan = planDeLaCuisine([
      colonne("On the rail", [carte(10, "en attente")]),
      colonne("Taken", [carte(11, "pris")]),
      colonne("Pass", [carte(12, "en pass")]),
      colonne("Waiting", []),
      colonne("Served", [carte(13, "servi")], { defile: true }),
    ]);
    assert.deepEqual(plan.map(({ nom }) => nom), ["Backlog", "Manager", "Cooks", "Pass", "Served"]);
    assert.deepEqual(plan.map(({ cartes }) => numeros(cartes)), [[10], [], [11], [12], [13]]);
    assert.deepEqual(plan.map(({ compte }) => compte), ["1", "0", "1", "1", "1"]);
    assert.deepEqual(plan.map(({ ton }) => ton), ["gris", "gris", "bleu", "jaune", "vert"]);
    assert.deepEqual(plan.map(({ defile }) => defile), [undefined, undefined, undefined, undefined, true]);
    // Le vide de chaque colonne est celui que faits.ts dit ; le manager a le sien.
    assert.deepEqual(plan.map(({ vide }) => vide), ["no ticket in On the rail", "no ticket with the manager", "no ticket in Taken", "no ticket in Pass", "no ticket in Served"]);
  });

  test("aucune colonne Waiting : une carte qui attend va dans la colonne de son étape, d'après son mot", () => {
    const attente = [carte(21, "pris", { parque: PARKED }), carte(22, "en pass", { parque: PARKED }), carte(23, "base rouge"), carte(24, "servi"), carte(25, "WAITING", { parque: PARKED }), carte(26, "en attente")];
    const plan = planDeLaCuisine([colonne("On the rail", []), colonne("Waiting", attente)]);
    const de = (nom: string) => numeros(plan.find((une) => une.nom === nom)?.cartes);
    assert.deepEqual([de("Backlog"), de("Manager"), de("Cooks"), de("Pass"), de("Served")], [[25, 26], [], [21], [22, 23], [24]]);
    assert.ok(!plan.some(({ nom }) => /waiting/i.test(nom)));
  });

  test("le manager tient sa question avant de découper, posée au chef ou répondue", () => {
    const plan = planDeLaCuisine([colonne("On the rail", [carte(60, "en attente", { question: true, attendu: true }), carte(61, "en attente")]), colonne("Waiting", [carte(62, "en attente", { repondue: { par: "you", a: "2026-11-25T08:00:00Z" } })])]);
    assert.deepEqual(numeros(plan[1]?.cartes), [60, 62]);
    assert.deepEqual(numeros(plan[0]?.cartes), [61]);
    assert.equal(colonneDuPlan("On the rail", carte(60, "en attente", { question: true })), "Manager");
    assert.equal(colonneDuPlan("Taken", carte(1, "pris")), "Cooks");
    assert.equal(colonneDuPlan("Waiting", carte(1, "en pass")), "Pass");
    assert.equal(colonneDuPlan("Waiting", carte(1, "86")), "Backlog");
    assert.equal(colonneDuPlan("Une colonne inconnue", carte(1, "pris")), "Backlog");
  });

  test("le backlog : le rail en tête, les tickets prêts à cuire ; dessous, ce qui ne l'est pas — rouges d'abord", () => {
    const [backlog] = planDeLaCuisine([
      colonne("On the rail", [carte(30, "en attente", { attendu: true, parque: { qui: "the chef", jusqua: null, chef: true } }), carte(31, "en attente"), carte(32, "tests écrits"), carte(33, "BLOQUÉ"), carte(34, "en attente", { parque: PARKED })]),
      colonne("Waiting", [carte(35, "WAITING", { parque: { ...PARKED, chef: true } })]),
    ]);
    assert.deepEqual(numeros(backlog?.cartes), [30, 35, 31, 32, 33, 34]);
    assert.deepEqual(numeros(backlog?.pretes), [31, 32]);
    assert.deepEqual(numeros(backlog?.pasPretes), [30, 35, 33, 34]);
    // Les autres colonnes ne se coupent pas.
    assert.equal(planDeLaCuisine([colonne("Taken", [carte(1, "pris")])])[2]?.pretes, undefined);
  });

  test("une colonne pas connue — la box ne répond pas — rend tout le plan inconnu, sans « 0 »", () => {
    const plan = planDeLaCuisine([colonne("On the rail", [], { compte: "?", vide: "not known while the station is unreachable" }), colonne("Taken", [], { compte: "?" })]);
    assert.deepEqual(plan.map(({ compte }) => compte), ["?", "?", "?", "?", "?"]);
    assert.equal(plan[1]?.vide, "not known while the station is unreachable");
    assert.deepEqual(planDeLaCuisine([colonne("Taken", [])]).map(({ compte }) => compte), ["0", "0", "0", "0", "0"]);
  });
});

describe("la carte parked dit qui elle attend et jusqu'à quand", () => {
  test("qui, puis la date, en UTC ; sans date, elle le dit ; une date illisible est dite telle quelle", () => {
    const dit = (parque: { qui: string; jusqua: string | null }) => (ligneParquee(doc, parque) as unknown as Faux).textContent;
    assert.equal(dit({ qui: "the chef", jusqua: null }), "parked — waits for the chef, no date set");
    assert.equal(dit({ qui: "Camille", jusqua: "2026-01-05T17:30:00Z" }), "parked — waits for Camille, until 5 Jan, 17:30 UTC");
    assert.equal(dit({ qui: "Camille", jusqua: "next week" }), "parked — waits for Camille, until next week");
    const ligne = ligneParquee(doc, PARKED) as unknown as Faux;
    assert.deepEqual([ligne.balise, ligne.className, ligne.textContent], ["p", "parque", "parked — waits for Camille, until 28 Nov, 09:00 UTC"]);
  });
});

describe("le TODO liste exactement ce qui attend le chef", () => {
  // Ce qui attend le chef est parked pour lui (faits.ts, #4261) ; une relance passée ne la lui rend plus.
  test("les cartes rouges du plan, parked pour le chef comprises, une fois chacune — rien d'autre", () => {
    const pourLeChef = { parque: { qui: "the chef", jusqua: null, chef: true } };
    const plan = planDeLaCuisine([
      colonne("On the rail", [carte(50, "en attente", { attendu: true, ...pourLeChef }), carte(51, "en attente")]),
      colonne("Taken", [carte(52, "pris", { attendu: true, qui: ["bob"] })]),
      colonne("Waiting", [carte(53, "pris", { parque: { ...PARKED, chef: true } }), carte(54, "pris", { parque: PARKED }), carte(55, "WAITING", { relancePassee: true })]),
      colonne("Pass", [carte(50, "en pass", { attendu: true, ...pourLeChef })]),
    ]);
    assert.deepEqual(numeros(ceQuiTAttend(plan)), [50, 53]);
  });

  test("une entrée par ticket, qui ouvre sa carte d'un clic ; rien quand rien n'attend le chef", () => {
    const ouvertes: number[] = [];
    assert.equal(poserLeTodo(doc, { cartes: [], ouvrir: () => {} }), undefined);
    const todo = poserLeTodo(doc, { cartes: [carte(50, "en attente", { attendu: true }), carte(53, "pris", { parque: { ...PARKED, chef: true }, titre: undefined })], ouvrir: ({ ticket }) => void ouvertes.push(ticket) }) as unknown as Faux;
    assert.deepEqual([todo.className, todo.ariaLabel], ["todo-du-rail", "What awaits you"]);
    assert.equal(todo.children[0]?.textContent, "TODO (2)");
    const entrees = todo.dessous("li");
    assert.deepEqual(entrees.map(({ dataset }) => dataset.ticket), ["50", "53"]);
    assert.deepEqual(entrees.map(({ textContent }) => textContent), ["#50 Ticket 50", "#53"]);
    assert.equal(entrees[1]?.dessous("button")[0]?.title, "open #53's card — parked — waits for Camille, until 28 Nov, 09:00 UTC");
    assert.equal(entrees[0]?.dessous("button")[0]?.title, "open #50's card");
    entrees[1]?.dessous("button")[0]?.click();
    assert.deepEqual(ouvertes, [53]);
  });
});

describe("la bande du haut : la ligne du supervisor et celle du closer", () => {
  const ROLES = [
    { role: "supervisor", does: "watches the whole kitchen", latest: { what: "parked #31 for the chef", ticket: 31, at: "2026-11-25T08:30:00Z" } },
    { role: "closer", does: "tidies what is served", latest: { what: "removed dead code", ticket: null, at: "2026-11-25T06:00:00Z" } },
  ];
  const agent = (handedToChef: number, nextRun: string) => ({ lastGesture: { line: "reran the tests", at: "2026-11-25T09:01:00Z" }, nextRun: { text: nextRun }, counters: { handedToChef } });
  const lignes = (bande: Faux) => bande.children.map((ligne) => ligne.children.filter(({ balise }) => balise !== "button").map(({ textContent }) => textContent));

  test("ce que la cuisine en dit : ce qu'il surveille, sa dernière action, ce qu'il a parked pour le chef ; le dernier rangement, le prochain", () => {
    const fils: string[] = [];
    const agents: Record<string, ReturnType<typeof agent>> = { supervisor: agent(3, "supervisor: wakes if nothing is merged by 10:40"), closer: agent(0, "closer: next pass in 3 h") };
    const bande = poserLaBandeDuHaut(doc, { roles: ROLES, agent: (nom) => agents[nom], ouvrirLeFil: (nom) => void fils.push(nom) }) as unknown as Faux;
    assert.equal(bande.className, "bande-du-haut");
    assert.deepEqual(bande.children.map(({ className }) => className), ["ligne-du-supervisor", "ligne-du-closer"]);
    assert.deepEqual(lignes(bande), [
      ["Supervisor", "watches the whole kitchen", "last: parked #31 for the chef · 08:30 UTC", "parked for you: 3 so far"],
      ["Closer", "last tidy: removed dead code · 06:00 UTC", "next tidy: next pass in 3 h"],
    ]);
    for (const ligne of bande.children) ligne.dessous("button").find(({ textContent }) => textContent === "its thread")?.click();
    assert.deepEqual(fils, ["supervisor", "closer"]);
  });

  test("sans rôle ni équipe lue : ce qu'il surveille d'après la spec, et « not known » — jamais inventé ; aucun fil à ouvrir", () => {
    const bande = poserLaBandeDuHaut(doc, { roles: undefined, agent: () => undefined, ouvrirLeFil: () => {} }) as unknown as Faux;
    assert.deepEqual(lignes(bande), [
      ["Supervisor", "watching: each ticket's progress, loops, load, what is served, tickets parked too long", "last: No action yet.", "parked for you: not known"],
      ["Closer", "last tidy: No tidy yet.", "next tidy: not known"],
    ]);
    assert.deepEqual(bande.dessous("button"), []);
  });

  test("l'équipe lue sans rôle : la dernière action est celle de son fil ; une heure illisible n'est pas dite ; en lecture seule, aucun fil", () => {
    const lu = { ...agent(0, "closer: next pass once its merges are in"), lastGesture: { line: "pruned the know-how", at: "hier" } };
    const bande = poserLaBandeDuHaut(doc, { roles: [], agent: () => lu, ouvrirLeFil: undefined }) as unknown as Faux;
    assert.deepEqual(lignes(bande)[1], ["Closer", "last tidy: pruned the know-how", "next tidy: next pass once its merges are in"]);
    assert.deepEqual(bande.dessous("button"), []);
  });
});

describe("aucun message sans un geste que le chef peut faire", () => {
  type Alerte = Parameters<typeof messageDesAlertes>[1][number];
  const alerte = (plus: Partial<Alerte>): Alerte => ({ sorte: "base-rouge", phrase: "Main is red.", fait: { depuis: "2026-11-25T08:00:00Z" }, geste: "Open the failing check", geree: null, ...plus }) as Alerte;
  const ligneDe = (avecBouton: boolean) => (une: Alerte) => {
    const ligne = new Faux("p");
    ligne.append(une.phrase, ...(avecBouton ? [new Faux("button")] : []));
    return [ligne] as unknown as HTMLElement[];
  };

  test("une alerte que la cuisine prend en charge seule n'est pas montrée ; la suivante l'est", () => {
    const vues = messageDesAlertes(doc, [alerte({ geste: null, geree: "The kitchen repairs it.", phrase: "Handled.", fait: { depuis: "x", ticket: 4 } }), alerte({ phrase: "Shown.", bouton: "ajouter-a-une-station" })], ligneDe(true), { ouvrirTicket: () => {}, ouvrirLesChecks: () => {} }) as unknown as Faux[];
    assert.deepEqual(vues.map(({ textContent }) => textContent), ["Shown."]);
  });

  test("sans bouton du runtime : ouvrir son ticket, sinon les checks du dépôt ; sans l'un ni l'autre, rien", () => {
    const appels: string[] = [];
    const gestes = { ouvrirTicket: (ticket: number) => void appels.push(`#${ticket}`), ouvrirLesChecks: () => void appels.push("checks") };
    const [duTicket] = messageDesAlertes(doc, [alerte({ fait: { depuis: "x", ticket: 12, check: "tests" } })], ligneDe(false), gestes) as unknown as Faux[];
    assert.deepEqual(duTicket?.dessous("button").map(({ textContent }) => textContent), ["open #12"]);
    duTicket?.dessous("button")[0]?.click();
    const [duCheck] = messageDesAlertes(doc, [alerte({ fait: { depuis: "x", check: "tests" } })], ligneDe(false), gestes) as unknown as Faux[];
    assert.deepEqual(duCheck?.dessous("button").map(({ textContent }) => textContent), ["open the checks"]);
    duCheck?.dessous("button")[0]?.click();
    assert.deepEqual(appels, ["#12", "checks"]);
    assert.deepEqual(messageDesAlertes(doc, [alerte({ fait: { depuis: "x", check: "tests" } })], ligneDe(false), { ...gestes, ouvrirLesChecks: undefined }), []);
    assert.deepEqual(messageDesAlertes(doc, [alerte({ fait: { depuis: "x" } })], ligneDe(false), gestes), []);
    assert.deepEqual(messageDesAlertes(doc, [alerte({})], () => [], gestes), []);
  });

  test("le bouton du runtime suffit : la ligne est montrée telle quelle", () => {
    const [ligne] = messageDesAlertes(doc, [alerte({ fait: { depuis: "x", ticket: 3 } })], ligneDe(true), { ouvrirTicket: () => {}, ouvrirLesChecks: () => {} }) as unknown as Faux[];
    assert.equal(ligne?.dessous("button").length, 1);
    assert.equal(aUnGeste([new Faux("p")] as unknown as HTMLElement[]), false);
    assert.equal(aUnGeste([new Faux("p"), ligne] as unknown as HTMLElement[]), true);
  });
});
