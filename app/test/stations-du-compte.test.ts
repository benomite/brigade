// La sélection d'une station du compte (#1706), écrite par l'app selon le contrat du runtime
// (runtime/src/enregistrement-station/README.md, « The selection the app writes ») : le seul fichier
// `brigade-selection.json` du gist de la station, la sélection entière, relue telle quelle par le lecteur du runtime —
// c'est ce qui la garde d'un lancement de l'app à l'autre. Ce que la vue envoie est vérifié avant toute écriture ; un
// refus de GitHub se dit en une ligne, son détail à part.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as contrat from "../../runtime/src/enregistrement-station/contrat.ts";
import { stationDuGist } from "../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { choixDesProjets, REFUS_GITHUB, REFUS_PROJETS, REFUS_STATION } from "../src/stations-du-compte.ts";

const INSTANT = Date.parse("2026-10-26T09:45:00.000Z");
const ENREGISTREMENT = JSON.stringify({ brigade: "station-registration", format: 1, name: "box", platform: "linux", machine: "Linux 6.1.0", version: "1.4.0", registeredAt: "2026-10-26T09:00:00.000Z", lastSeen: "2026-10-26T09:44:00.000Z", refreshMs: 120_000, stoppedAt: null });

// Un gist en mémoire : ce que chaque écriture y a posé, et la liste des écritures.
function unGist() {
  const fichiers: Record<string, string> = { [contrat.FICHIER_ENREGISTREMENT]: ENREGISTREMENT };
  const ecritures: Array<{ id: string; noms: string[] }> = [];
  const choisir = choixDesProjets({
    ecrire: async (id, ecrits) => {
      ecritures.push({ id, noms: Object.keys(ecrits) });
      Object.assign(fichiers, ecrits);
    },
    contrat: async () => contrat,
    maintenant: () => INSTANT,
  });
  return { fichiers, ecritures, choisir };
}

describe("la sélection s'écrit selon le contrat, et se relit d'un lancement à l'autre", () => {
  test("seul brigade-selection.json est écrit : la sélection entière, sa forme et l'instant de l'écriture", async () => {
    const { fichiers, ecritures, choisir } = unGist();
    assert.deepEqual(await choisir("a1b2c3", ["acme/shop", "acme/site"]), { selection: ["acme/shop", "acme/site"] });
    assert.deepEqual(ecritures, [{ id: "a1b2c3", noms: [contrat.FICHIER_SELECTION] }]);
    assert.deepEqual(JSON.parse(fichiers[contrat.FICHIER_SELECTION] ?? "null"), { brigade: "station-selection", format: contrat.FORMAT, repositories: ["acme/shop", "acme/site"], updatedAt: "2026-10-26T09:45:00.000Z" });
    // L'enregistrement de la station n'est pas touché.
    assert.equal(fichiers[contrat.FICHIER_ENREGISTREMENT], ENREGISTREMENT);
  });

  test("le lecteur du runtime relit ce que l'app a écrit : la station sert ce qui a été choisi", async () => {
    const { fichiers, choisir } = unGist();
    assert.equal((stationDuGist("a1b2c3", fichiers, "chef", INSTANT) as { selection: unknown }).selection, null);
    await choisir("a1b2c3", ["acme/site"]);
    assert.deepEqual((stationDuGist("a1b2c3", fichiers, "chef", INSTANT) as { selection: unknown }).selection, ["acme/site"]);
    // Tout décoché : la station ne sert rien — ce n'est pas « rien de choisi ».
    await choisir("a1b2c3", []);
    assert.deepEqual((stationDuGist("a1b2c3", fichiers, "chef", INSTANT) as { selection: unknown }).selection, []);
  });

  test("un dépôt nommé deux fois ne l'est qu'une", async () => {
    const { fichiers, choisir } = unGist();
    assert.deepEqual(await choisir("a1b2c3", ["acme/shop", "acme/shop"]), { selection: ["acme/shop"] });
    assert.deepEqual(contrat.selectionLue(fichiers[contrat.FICHIER_SELECTION] ?? "")?.repositories, ["acme/shop"]);
  });
});

describe("ce qui ne s'écrit pas", () => {
  test("une station ou des dépôts que la vue ne peut pas avoir lus : refusés, rien n'est écrit", async () => {
    const { ecritures, choisir } = unGist();
    for (const id of [undefined, "", "../gists", 42]) assert.deepEqual(await choisir(id, ["acme/shop"]), { refus: REFUS_STATION });
    for (const depots of [undefined, "acme/shop", ["acme"], ["acme/shop", 3], ["acme/shop; rm"]]) assert.deepEqual(await choisir("a1b2c3", depots), { refus: REFUS_PROJETS });
    assert.deepEqual(ecritures, []);
  });

  test("GitHub qui refuse l'écriture : une ligne, et ce que `gh` a dit à part", async () => {
    const choisir = choixDesProjets({
      ecrire: async () => {
        throw new Error("this station's gist is no longer on GitHub");
      },
      contrat: async () => contrat,
    });
    assert.deepEqual(await choisir("a1b2c3", ["acme/shop"]), { refus: REFUS_GITHUB, detail: "this station's gist is no longer on GitHub" });
  });
});
