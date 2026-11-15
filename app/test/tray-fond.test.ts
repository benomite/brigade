// L'icône de la station de fond (#3631) : ses comptes, son menu, et la confirmation que quitter la station demande.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ProjetLu } from "../src/barre-de-menus.ts";
import type { Faits } from "../src/faits.ts";
import { confirmationDeQuitter, ligneDuFond, menuDuFond } from "../src/tray-fond/tray-fond.ts";

const A = "2026-11-15T10:00:00.000Z";
const desFaits = (cooks: number, questions: number): Faits => ({
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
});

describe("les comptes de l'icône", () => {
  test("les cooks qui cuisent et les questions qui attendent, sur tous les projets, et ils suivent leur changement", () => {
    const projets: ProjetLu[] = [{ nom: "brigade", faits: desFaits(2, 1) }, { nom: "parade", faits: desFaits(1, 0) }];
    assert.equal(ligneDuFond(projets, "en-service"), "3 cooking · 1 for you");
    projets[1] = { nom: "parade", faits: desFaits(0, 2) };
    assert.equal(ligneDuFond(projets, "en-service"), "2 cooking · 3 for you");
  });

  test("rien de lu n'est jamais « 0 », et l'état de la station se dit", () => {
    assert.equal(ligneDuFond([{ nom: "brigade", faits: undefined }], "en-service"), "not read yet");
    assert.equal(ligneDuFond([{ nom: "brigade", faits: desFaits(0, 0) }], "en-pause"), "0 cooking · 0 for you · paused");
    assert.equal(ligneDuFond([{ nom: "brigade", faits: desFaits(0, 0) }], "arretee"), "0 cooking · 0 for you · stopped");
  });
});

describe("le menu", () => {
  test("ouvrir l'app, pause, arrêt, quitter — pause et arrêt éteints sur l'état où la station est déjà", () => {
    const gestes = (etat: Parameters<typeof menuDuFond>[1]) =>
      menuDuFond([], etat).flatMap((entree) => (entree.genre === "geste" ? [`${entree.geste}:${entree.actif}`] : []));
    assert.deepEqual(gestes("en-service"), ["ouvrir:true", "pause:true", "arret:true", "quitter:true"]);
    assert.deepEqual(gestes("en-pause"), ["ouvrir:true", "pause:false", "arret:true", "quitter:true"]);
    assert.deepEqual(gestes("arretee"), ["ouvrir:true", "pause:true", "arret:false", "quitter:true"]);
    assert.deepEqual(gestes("illisible"), ["ouvrir:true", "pause:false", "arret:false", "quitter:true"]);
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
