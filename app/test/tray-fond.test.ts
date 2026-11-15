// L'icône de la station de fond (#3631) : ses comptes, son menu, ce que ses gestes lancent sur la station, et la
// confirmation que quitter la station demande.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ProjetLu } from "../src/barre-de-menus.ts";
import type { Faits } from "../src/faits.ts";
import { commandesDuGeste, confirmationDeQuitter, etatDeLaStation, ligneDuFond, menuDuFond, questionsDuFond, type EtatDeLaStation } from "../src/tray-fond/tray-fond.ts";

const A = "2026-11-15T10:00:00.000Z";
const station = (nom: string, cuisson: string, distante = false) => ({ station: nom, distante, plafond: null, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson });
const desFaits = (cooks: number, questions: number, plus: Partial<Faits> = {}): Faits => ({
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
const EN_SERVICE: EtatDeLaStation = { pause: false, arret: false };

describe("les comptes de l'icône", () => {
  test("les cooks qui cuisent et les questions qui attendent, sur tous les projets, et ils suivent leur changement", () => {
    const projets: ProjetLu[] = [{ nom: "brigade", faits: desFaits(2, 1) }, { nom: "parade", faits: desFaits(1, 0) }];
    assert.equal(ligneDuFond(projets, EN_SERVICE), "3 cooking · 1 for you");
    assert.equal(questionsDuFond(projets), 1);
    projets[1] = { nom: "parade", faits: desFaits(0, 2) };
    assert.equal(ligneDuFond(projets, EN_SERVICE), "2 cooking · 3 for you");
    assert.equal(questionsDuFond(projets), 3);
  });

  test("rien de lu n'est jamais « 0 », et l'état de la station se dit", () => {
    assert.equal(ligneDuFond([{ nom: "brigade", faits: undefined }], "illisible"), "not read yet");
    assert.equal(ligneDuFond([], "illisible"), "no project on this station");
    assert.equal(ligneDuFond([{ nom: "brigade", faits: desFaits(1, 0) }, { nom: "parade", faits: undefined }], EN_SERVICE), "1 cooking · 0 for you · 1 not read");
    assert.equal(ligneDuFond([{ nom: "brigade", faits: desFaits(0, 0) }], { pause: true, arret: false }), "0 cooking · 0 for you · paused");
    assert.equal(ligneDuFond([{ nom: "brigade", faits: desFaits(0, 0) }], { pause: false, arret: true }), "0 cooking · 0 for you · stopped");
  });
});

describe("l'état de la station, lu de ses projets", () => {
  test("en pause quand chaque projet lu est éteint, arrêtée quand chaque station de cet ordinateur l'est", () => {
    const eteint = desFaits(0, 0, { etat: "éteinte", stations: [station("mac/claude", "cooking"), station("box/claude", "cooking", true)] });
    const arrete = desFaits(1, 0, { stations: [station("mac/claude", "stopped"), station("box/claude", "cooking", true)] });
    assert.deepEqual(etatDeLaStation([{ nom: "a", faits: eteint }, { nom: "b", faits: undefined }]), { pause: true, arret: false });
    assert.deepEqual(etatDeLaStation([{ nom: "a", faits: arrete }]), { pause: false, arret: true });
    assert.deepEqual(etatDeLaStation([{ nom: "a", faits: arrete }, { nom: "b", faits: eteint }]), { pause: false, arret: false });
    // Un runtime qui ne donne pas ses stations ne dit pas un arrêt.
    assert.deepEqual(etatDeLaStation([{ nom: "a", faits: desFaits(0, 0) }]), { pause: false, arret: false });
    assert.equal(etatDeLaStation([{ nom: "a", faits: undefined }]), "illisible");
    assert.equal(etatDeLaStation([]), "illisible");
  });
});

describe("le menu", () => {
  const gestes = (etat: EtatDeLaStation) =>
    menuDuFond([{ nom: "brigade", faits: desFaits(0, 0) }], etat).flatMap((entree) => (entree.genre === "geste" ? [`${entree.geste}:${entree.actif}`] : []));

  test("ouvrir l'app, pause, arrêt, quitter — « Resume » en pause, « Start » à l'arrêt", () => {
    assert.deepEqual(gestes(EN_SERVICE), ["ouvrir:true", "pause:true", "arret:true", "quitter:true"]);
    assert.deepEqual(gestes({ pause: true, arret: false }), ["ouvrir:true", "reprise:true", "arret:true", "quitter:true"]);
    assert.deepEqual(gestes({ pause: false, arret: true }), ["ouvrir:true", "pause:true", "demarrage:true", "quitter:true"]);
    assert.deepEqual(gestes("illisible"), ["ouvrir:true", "pause:false", "arret:false", "quitter:true"]);
    const libelles = menuDuFond([], { pause: true, arret: true }).flatMap((entree) => (entree.genre === "geste" ? [entree.libelle] : []));
    assert.deepEqual(libelles, ["Open brigade", "Resume the station", "Start the station", "Quit the station…"]);
  });
});

describe("ce que les gestes lancent", () => {
  const projets: ProjetLu[] = [
    { nom: "brigade", faits: desFaits(0, 0, { stations: [station("mac/claude", "cooking"), station("box/claude", "cooking", true)] }) },
    { nom: "parade", faits: undefined },
  ];

  test("pause et reprise : l'interrupteur de chaque projet", () => {
    assert.deepEqual(commandesDuGeste("pause", projets), [{ projet: "brigade", commande: "switch off" }, { projet: "parade", commande: "switch off" }]);
    assert.deepEqual(commandesDuGeste("reprise", projets), [{ projet: "brigade", commande: "switch on" }, { projet: "parade", commande: "switch on" }]);
  });

  test("arrêt et démarrage : chaque station de cet ordinateur, jamais une station distante", () => {
    assert.deepEqual(commandesDuGeste("arret", projets), [{ projet: "brigade", commande: "station stop mac/claude" }]);
    assert.deepEqual(commandesDuGeste("demarrage", projets), [{ projet: "brigade", commande: "station start mac/claude" }]);
  });
});

describe("la confirmation de quitter", () => {
  test("elle dit que quitter arrête la cuisine et ses cooks en cours", () => {
    const { message, detail, quitter, annuler } = confirmationDeQuitter([{ nom: "brigade", faits: desFaits(3, 0) }]);
    assert.equal(message, "Quit the station? This stops the kitchen.");
    assert.equal(detail, "The 3 cooks running now stop. Its projects stop cooking on this computer until the station starts again.");
    assert.deepEqual([quitter, annuler], ["Quit the station", "Cancel"]);
    assert.match(confirmationDeQuitter([{ nom: "brigade", faits: desFaits(1, 0) }]).detail, /^The cook running now stops\./);
    assert.match(confirmationDeQuitter([]).detail, /^No cook is running now\./);
  });
});
