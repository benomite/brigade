// L'icône de la station de fond (#3631) : sa ligne, son menu — ouvrir, quitter, rien d'autre : aucune commande du
// runtime ne part du fond (ticket 4677) —, et la confirmation que quitter la station demande. L'état de la station lu des
// faits (`stateOfTheStation`) reste celui de l'icône de l'app.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ProjectRead } from "../src/menu-bar.ts";
import type { Facts } from "../src/facts.ts";
import { confirmationOfQuit, lineOfTheStationHere, stateOfTheStation, menuOfBackground } from "../src/tray-background/tray-background.ts";
import { lineOfBackground } from "../src/tray/line.ts";

type StateOfTheStation = ReturnType<typeof stateOfTheStation>;

const A = "2026-11-15T10:00:00.000Z";
const station = (name: string, cooking: string, remote = false) => ({ station: name, distante: remote, plafond: null, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: cooking });
const someFacts = (cooks: number, questions: number, more: Partial<Facts> = {}): Facts => ({
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 0, auTravail: cooks, aLaPass: 0, attend: questions, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: Array.from({ length: cooks }, (_, i) => ({ ticket: i + 1, titre: `ticket ${i + 1}`, station: "mac/claude" })),
  attend: Array.from({ length: questions }, (_, i) => ({ ticket: 100 + i, titre: `question ${i}`, url: null })),
  livres: [],
  urgence: null,
  ...more,
});
const IN_SERVICE: StateOfTheStation = { pause: false };

describe("les comptes de l'icône", () => {
  test("les cooks qui cuisent et les questions qui attendent, sur tous les projets, et ils suivent leur changement", () => {
    const projects: ProjectRead[] = [{ nom: "brigade", faits: someFacts(2, 1) }, { nom: "parade", faits: someFacts(1, 0) }];
    assert.equal(lineOfBackground(projects, IN_SERVICE), "3 cooking · 1 for you");
    projects[1] = { nom: "parade", faits: someFacts(0, 2) };
    assert.equal(lineOfBackground(projects, IN_SERVICE), "2 cooking · 3 for you");
  });

  test("rien de lu n'est jamais « 0 », et l'état de la station se dit", () => {
    assert.equal(lineOfBackground([{ nom: "brigade", faits: undefined }], "illisible"), "not read yet");
    assert.equal(lineOfBackground([], "illisible"), "no project on this station");
    assert.equal(lineOfBackground([{ nom: "brigade", faits: someFacts(1, 0) }, { nom: "parade", faits: undefined }], IN_SERVICE), "1 cooking · 0 for you · 1 not read");
    assert.equal(lineOfBackground([{ nom: "brigade", faits: someFacts(0, 0) }], { pause: true }), "0 cooking · 0 for you · paused");
  });
});

describe("l'état de la station, lu de ses projets", () => {
  test("en pause quand chaque projet lu est éteint", () => {
    const off = someFacts(0, 0, { etat: "éteinte", stations: [station("mac/claude", "cooking"), station("box/claude", "cooking", true)] });
    const stops = someFacts(1, 0, { stations: [station("mac/claude", "stopped"), station("box/claude", "cooking", true)] });
    assert.deepEqual(stateOfTheStation([{ nom: "a", faits: off }, { nom: "b", faits: undefined }]), { pause: true });
    assert.deepEqual(stateOfTheStation([{ nom: "a", faits: stops }, { nom: "b", faits: off }]), { pause: false });
    assert.deepEqual(stateOfTheStation([{ nom: "a", faits: someFacts(0, 0) }]), { pause: false });
    assert.equal(stateOfTheStation([{ nom: "a", faits: undefined }]), "illisible");
    assert.equal(stateOfTheStation([]), "illisible");
  });
});

describe("la ligne et le menu du fond", () => {
  test("la ligne dit combien de projets la station sert — ni cooks, ni questions, rien qui ne se lise plus", () => {
    assert.equal(lineOfTheStationHere([]), "no project on this station");
    assert.equal(lineOfTheStationHere(["brigade"]), "1 project on this station");
    assert.equal(lineOfTheStationHere(["brigade", "parade"]), "2 projects on this station");
  });

  test("ouvrir l'app et quitter, seuls : ni pause, ni arrêt, ni démarrage", () => {
    const entries = menuOfBackground(["brigade"]);
    assert.deepEqual(entries.flatMap((entry) => (entry.genre === "geste" ? [`${entry.geste}:${entry.actif}`] : [])), ["ouvrir:true", "quitter:true"]);
    assert.deepEqual(entries.flatMap((entry) => (entry.genre === "geste" ? [entry.libelle] : [])), ["Open brigade", "Quit the station…"]);
  });
});

describe("la confirmation de quitter", () => {
  test("elle dit que quitter arrête la cuisine et ses cooks en cours, sans en compter aucun", () => {
    const { message, detail, quitter: quit, annuler: cancel } = confirmationOfQuit();
    assert.equal(message, "Quit the station? This stops the kitchen.");
    assert.equal(detail, "The cooks running now stop. Its projects stop cooking on this computer until the station starts again.");
    assert.deepEqual([quit, cancel], ["Quit the station", "Cancel"]);
  });
});
