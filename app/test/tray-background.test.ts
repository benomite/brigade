// L'icône de la station de fond (#3631) : ses comptes, son menu, ce que ses gestes lancent sur la station, et la
// confirmation que quitter la station demande.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ProjectLu } from "../src/bar-de-menus.ts";
import type { Facts } from "../src/facts.ts";
import { commandsDuAction, confirmationDeQuitter, stateDeLaStation, menuDuBackground, questionsDuBackground } from "../src/tray-background/tray-background.ts";
import { lineDuBackground } from "../src/tray/line.ts";

type StateDeLaStation = ReturnType<typeof stateDeLaStation>;

const A = "2026-11-15T10:00:00.000Z";
const station = (name: string, cooking: string, remote = false) => ({ station: name, distante: remote, plafond: null, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: cooking });
const someFacts = (cooks: number, questions: number, plus: Partial<Facts> = {}): Facts => ({
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
  ...plus,
});
const EN_SERVICE: StateDeLaStation = { pause: false, arret: false };

describe("les comptes de l'icône", () => {
  test("les cooks qui cuisent et les questions qui attendent, sur tous les projets, et ils suivent leur changement", () => {
    const projects: ProjectLu[] = [{ nom: "brigade", faits: someFacts(2, 1) }, { nom: "parade", faits: someFacts(1, 0) }];
    assert.equal(lineDuBackground(projects, EN_SERVICE), "3 cooking · 1 for you");
    assert.equal(questionsDuBackground(projects), 1);
    projects[1] = { nom: "parade", faits: someFacts(0, 2) };
    assert.equal(lineDuBackground(projects, EN_SERVICE), "2 cooking · 3 for you");
    assert.equal(questionsDuBackground(projects), 3);
  });

  test("rien de lu n'est jamais « 0 », et l'état de la station se dit", () => {
    assert.equal(lineDuBackground([{ nom: "brigade", faits: undefined }], "illisible"), "not read yet");
    assert.equal(lineDuBackground([], "illisible"), "no project on this station");
    assert.equal(lineDuBackground([{ nom: "brigade", faits: someFacts(1, 0) }, { nom: "parade", faits: undefined }], EN_SERVICE), "1 cooking · 0 for you · 1 not read");
    assert.equal(lineDuBackground([{ nom: "brigade", faits: someFacts(0, 0) }], { pause: true, arret: false }), "0 cooking · 0 for you · paused");
    assert.equal(lineDuBackground([{ nom: "brigade", faits: someFacts(0, 0) }], { pause: false, arret: true }), "0 cooking · 0 for you · stopped");
  });
});

describe("l'état de la station, lu de ses projets", () => {
  test("en pause quand chaque projet lu est éteint, arrêtée quand chaque station de cet ordinateur l'est", () => {
    const eteint = someFacts(0, 0, { etat: "éteinte", stations: [station("mac/claude", "cooking"), station("box/claude", "cooking", true)] });
    const arrete = someFacts(1, 0, { stations: [station("mac/claude", "stopped"), station("box/claude", "cooking", true)] });
    assert.deepEqual(stateDeLaStation([{ nom: "a", faits: eteint }, { nom: "b", faits: undefined }]), { pause: true, arret: false });
    assert.deepEqual(stateDeLaStation([{ nom: "a", faits: arrete }]), { pause: false, arret: true });
    assert.deepEqual(stateDeLaStation([{ nom: "a", faits: arrete }, { nom: "b", faits: eteint }]), { pause: false, arret: false });
    // Un runtime qui ne donne pas ses stations ne dit pas un arrêt.
    assert.deepEqual(stateDeLaStation([{ nom: "a", faits: someFacts(0, 0) }]), { pause: false, arret: false });
    assert.equal(stateDeLaStation([{ nom: "a", faits: undefined }]), "illisible");
    assert.equal(stateDeLaStation([]), "illisible");
  });
});

describe("le menu", () => {
  const actions = (state: StateDeLaStation) =>
    menuDuBackground([{ nom: "brigade", faits: someFacts(0, 0) }], state).flatMap((entree) => (entree.genre === "geste" ? [`${entree.geste}:${entree.actif}`] : []));

  test("ouvrir l'app, pause, arrêt, quitter — « Resume » en pause, « Start » à l'arrêt", () => {
    assert.deepEqual(actions(EN_SERVICE), ["ouvrir:true", "pause:true", "arret:true", "quitter:true"]);
    assert.deepEqual(actions({ pause: true, arret: false }), ["ouvrir:true", "reprise:true", "arret:true", "quitter:true"]);
    assert.deepEqual(actions({ pause: false, arret: true }), ["ouvrir:true", "pause:true", "demarrage:true", "quitter:true"]);
    assert.deepEqual(actions("illisible"), ["ouvrir:true", "pause:false", "arret:false", "quitter:true"]);
    const libelles = menuDuBackground([], { pause: true, arret: true }).flatMap((entree) => (entree.genre === "geste" ? [entree.libelle] : []));
    assert.deepEqual(libelles, ["Open brigade", "Resume the station", "Start the station", "Quit the station…"]);
  });
});

describe("ce que les gestes lancent", () => {
  const projects: ProjectLu[] = [
    { nom: "brigade", faits: someFacts(0, 0, { stations: [station("mac/claude", "cooking"), station("box/claude", "cooking", true)] }) },
    { nom: "parade", faits: undefined },
  ];

  test("pause et reprise : l'interrupteur de chaque projet", () => {
    assert.deepEqual(commandsDuAction("pause", projects), [{ projet: "brigade", commande: "switch off" }, { projet: "parade", commande: "switch off" }]);
    assert.deepEqual(commandsDuAction("reprise", projects), [{ projet: "brigade", commande: "switch on" }, { projet: "parade", commande: "switch on" }]);
  });

  test("arrêt et démarrage : chaque station de cet ordinateur, jamais une station distante", () => {
    assert.deepEqual(commandsDuAction("arret", projects), [{ projet: "brigade", commande: "station stop mac/claude" }]);
    assert.deepEqual(commandsDuAction("demarrage", projects), [{ projet: "brigade", commande: "station start mac/claude" }]);
  });
});

describe("la confirmation de quitter", () => {
  test("elle dit que quitter arrête la cuisine et ses cooks en cours", () => {
    const { message, detail, quitter, annuler } = confirmationDeQuitter([{ nom: "brigade", faits: someFacts(3, 0) }]);
    assert.equal(message, "Quit the station? This stops the kitchen.");
    assert.equal(detail, "The 3 cooks running now stop. Its projects stop cooking on this computer until the station starts again.");
    assert.deepEqual([quitter, annuler], ["Quit the station", "Cancel"]);
    assert.match(confirmationDeQuitter([{ nom: "brigade", faits: someFacts(1, 0) }]).detail, /^The cook running now stops\./);
    assert.match(confirmationDeQuitter([]).detail, /^No cook is running now\./);
  });
});
