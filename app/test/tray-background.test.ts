// L'icône de la station de fond (#3631) : sa ligne, son menu — ouvrir, quitter, rien d'autre : aucune commande du
// runtime ne part du fond (ticket 4677) —, et la confirmation que quitter la station demande. L'état de la station lu des
// faits (`stateOfTheStation`) reste celui de l'icône de l'app.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { confirmationOfQuit, lineOfTheStationHere, stateOfTheStation, menuOfBackground } from "../src/tray-background/tray-background.ts";

type StateOfTheStation = ReturnType<typeof stateOfTheStation>;

const A = "2026-11-15T10:00:00.000Z";
const station = (name: string, cooking: string, remote = false) => ({ station: name, distante: remote, plafond: null, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: cooking });
const IN_SERVICE: StateOfTheStation = { pause: false };

describe("les comptes de l'icône", () => {

});

describe("l'état de la station, lu de ses projets", () => {
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
