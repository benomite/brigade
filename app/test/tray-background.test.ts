// L'icône de la station de fond (#3631) : ses comptes, son menu, ce que ses gestes lancent sur la station, et la
// confirmation que quitter la station demande.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ProjectRead } from "../src/menu-bar.ts";
import type { Facts } from "../src/facts.ts";
import { commandsOfAction, confirmationOfQuit, stateOfTheStation, menuOfBackground, questionsOfBackground } from "../src/tray-background/tray-background.ts";
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
    assert.equal(questionsOfBackground(projects), 1);
    projects[1] = { nom: "parade", faits: someFacts(0, 2) };
    assert.equal(lineOfBackground(projects, IN_SERVICE), "2 cooking · 3 for you");
    assert.equal(questionsOfBackground(projects), 3);
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
    const off = someFacts(0, 0, { etat: "éteinte" });
    assert.deepEqual(stateOfTheStation([{ nom: "a", faits: off }, { nom: "b", faits: undefined }]), { pause: true });
    assert.deepEqual(stateOfTheStation([{ nom: "a", faits: someFacts(1, 0) }, { nom: "b", faits: off }]), { pause: false });
    assert.equal(stateOfTheStation([{ nom: "a", faits: undefined }]), "illisible");
    assert.equal(stateOfTheStation([]), "illisible");
  });
});

describe("le menu", () => {
  const actions = (state: StateOfTheStation) =>
    menuOfBackground([{ nom: "brigade", faits: someFacts(0, 0) }], state).flatMap((entry) => (entry.genre === "geste" ? [`${entry.geste}:${entry.actif}`] : []));

  test("ouvrir l'app, pause, quitter — « Resume » en pause ; aucun geste d'arrêt ni de démarrage", () => {
    assert.deepEqual(actions(IN_SERVICE), ["ouvrir:true", "pause:true", "quitter:true"]);
    assert.deepEqual(actions({ pause: true }), ["ouvrir:true", "reprise:true", "quitter:true"]);
    assert.deepEqual(actions("illisible"), ["ouvrir:true", "pause:false", "quitter:true"]);
    const wordings = menuOfBackground([], { pause: true }).flatMap((entry) => (entry.genre === "geste" ? [entry.libelle] : []));
    assert.deepEqual(wordings, ["Open brigade", "Resume the station", "Quit the station…"]);
  });
});

describe("ce que les gestes lancent", () => {
  const projects: ProjectRead[] = [
    { nom: "brigade", faits: someFacts(0, 0, { stations: [station("mac/claude", "cooking"), station("box/claude", "cooking", true)] }) },
    { nom: "parade", faits: undefined },
  ];

  test("pause et reprise : l'interrupteur de chaque projet", () => {
    assert.deepEqual(commandsOfAction("pause", projects), [{ projet: "brigade", commande: "switch off" }, { projet: "parade", commande: "switch off" }]);
    assert.deepEqual(commandsOfAction("reprise", projects), [{ projet: "brigade", commande: "switch on" }, { projet: "parade", commande: "switch on" }]);
  });
});

describe("la confirmation de quitter", () => {
  test("elle dit que quitter arrête la cuisine et ses cooks en cours", () => {
    const { message, detail, quitter: quit, annuler: cancel } = confirmationOfQuit([{ nom: "brigade", faits: someFacts(3, 0) }]);
    assert.equal(message, "Quit the station? This stops the kitchen.");
    assert.equal(detail, "The 3 cooks running now stop. Its projects stop cooking on this computer until the station starts again.");
    assert.deepEqual([quit, cancel], ["Quit the station", "Cancel"]);
    assert.match(confirmationOfQuit([{ nom: "brigade", faits: someFacts(1, 0) }]).detail, /^The cook running now stops\./);
    assert.match(confirmationOfQuit([]).detail, /^No cook is running now\./);
  });
});
