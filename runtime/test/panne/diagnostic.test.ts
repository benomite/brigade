// #4214 : chaque branche de la panne — le rail, les labels, les retenues, les stations — et les lignes que `status` en écrit.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { diagnostiquer, lignesDeLaPanne, type TicketDeLaPanne } from "../../src/panne/index.ts";

type EntreeDeLaPanne = Parameters<typeof diagnostiquer>[0];

const feu = (numero: number, autres: string[] = [], plus: Partial<TicketDeLaPanne> = {}): TicketDeLaPanne => ({ numero, labels: ["fire", ...autres], decisionOuverte: false, enAttente: false, ...plus });
const calme = { mainRouge: false, boucleDeRelance: false };
const entree = (plus: Partial<EntreeDeLaPanne>): EntreeDeLaPanne => ({ rail: calme, stations: [{ nom: "A", enMarche: true }], tickets: [feu(1)], ...plus });

describe("le rail d'abord", () => {
  test("main rouge et sa réparation sur le rail : la cuisine la répare, dit fait", () => {
    assert.deepEqual(diagnostiquer(entree({ rail: { mainRouge: true, boucleDeRelance: true, reparationDeMain: 12 } })), { state: "fault", cause: "the main branch is red, so no delivery merges", action: { kind: "done", text: "the kitchen repairs it on #12" } });
  });

  test("main rouge sans réparation : un seul bouton", () => {
    assert.deepEqual(diagnostiquer(entree({ rail: { mainRouge: true, boucleDeRelance: false } })).action, { kind: "button", label: "Open a repair ticket for main", id: "reparer-main" });
  });

  test("une boucle de relances : la cuisine a sorti le ticket de la boucle, et le nomme", () => {
    assert.deepEqual(diagnostiquer(entree({ rail: { mainRouge: null, boucleDeRelance: true, ticketEnBoucle: 7 } })), { state: "fault", cause: "the kitchen relaunched #7 in a loop", action: { kind: "done", text: "the kitchen put #7 in WAITING, out of the loop" } });
    assert.equal(diagnostiquer(entree({ rail: { mainRouge: null, boucleDeRelance: true } })).cause, "the kitchen relaunched a ticket in a loop");
  });

  test("main et la boucle non lues (null) ne font aucune cause", () => {
    assert.equal(diagnostiquer(entree({ rail: { mainRouge: null, boucleDeRelance: null } })).state, "ready");
  });
});

describe("les tickets", () => {
  test("aucun ticket `fire` : au repos, et la phrase dit ce que le rail tient", () => {
    assert.deepEqual(diagnostiquer(entree({ tickets: [{ numero: 1, labels: [], decisionOuverte: false, enAttente: false }] })), { state: "idle", cause: "nothing to cook: the rail holds no `fire` ticket", action: null });
  });

  test("un ticket pris ou en pass : la cuisine cuit", () => {
    assert.deepEqual(diagnostiquer(entree({ tickets: [feu(2, ["decision"]), feu(3, ["in-pass"])], stations: [] })), { state: "ready", cause: "the kitchen is cooking #3", action: null });
  });

  test("un seul ticket retenu : au singulier", () => {
    assert.equal(diagnostiquer(entree({ tickets: [feu(1, ["decision"])] })).cause, "nothing to cook: 1 ticket waits on you or on a third party (1 open decision)");
  });

  test("chaque retenue comptée : décisions (au pluriel, du label ou de l'issue), attentes, labels", () => {
    const tickets = [feu(1, ["question"]), feu(2, [], { decisionOuverte: true }), feu(3, ["waiting"]), feu(4, ["blocked-on-human"]), feu(5, [], { enAttente: true, enAttenteDe: "client" })];
    assert.deepEqual(diagnostiquer(entree({ tickets, stations: [] })), { state: "idle", cause: "nothing to cook: 5 tickets wait on you or on a third party (2 open decisions, 2 on hold, 1 set aside by a label)", action: null });
  });

  test("un ticket faisable parmi des retenus : la cuisine peut cuire", () => {
    assert.deepEqual(diagnostiquer(entree({ tickets: [feu(1, ["waiting"]), feu(2)] })), { state: "ready", cause: "#2 is workable and station A takes it", action: null });
  });
});

describe("les stations", () => {
  test("des stations qui ne se lisent pas ne font aucune panne", () => {
    assert.deepEqual(diagnostiquer(entree({ stations: null })), { state: "ready", cause: "#1 is workable", action: null });
  });

  test("aucune station ne sert le projet : le bouton qui l'ajoute à une station", () => {
    assert.deepEqual(diagnostiquer(entree({ stations: [] })), { state: "fault", cause: "no station serves this project, so no cook takes #1", action: { kind: "button", label: "Add the project to a station", id: "ajouter-a-une-station" } });
  });

  test("toutes à l'arrêt : nommées, au pluriel, et le bouton qui les démarre", () => {
    assert.deepEqual(diagnostiquer(entree({ stations: [{ nom: "A", enMarche: false }, { nom: "B", enMarche: false }] })), { state: "fault", cause: "stations A, B are down, so no cook takes #1", action: { kind: "button", label: "Start it on its computer", id: "demarrer-la-station" } });
    assert.equal(diagnostiquer(entree({ stations: [{ nom: "A", enMarche: false }] })).cause, "station A is down, so no cook takes #1");
  });

  test("une en marche suffit, et elle est nommée", () => {
    assert.equal(diagnostiquer(entree({ stations: [{ nom: "A", enMarche: false }, { nom: "B", enMarche: true }] })).cause, "#1 is workable and station B takes it");
  });
});

describe("les lignes de `status`", () => {
  test("rien quand la cuisine peut cuire ; l'état et la cause, puis ce qui est fait ou le bouton", () => {
    assert.deepEqual(lignesDeLaPanne({ state: "ready", cause: "x", action: null }), []);
    assert.deepEqual(lignesDeLaPanne({ state: "idle", cause: "nothing to cook: y", action: null }), ["kitchen    idle: nothing to cook: y"]);
    assert.deepEqual(lignesDeLaPanne({ state: "fault", cause: "z", action: { kind: "done", text: "fixed" } }), ["kitchen    fault: z", "           done: fixed"]);
    assert.deepEqual(lignesDeLaPanne({ state: "fault", cause: "z", action: { kind: "button", label: "Start it", id: "demarrer-la-station" } }), ["kitchen    fault: z", "           button: Start it"]);
  });
});
