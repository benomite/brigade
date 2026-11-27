// La sélection d'une station du compte (#1706), écrite par l'app selon le contrat du runtime
// (runtime/src/enregistrement-station/README.md, « The selection the app writes ») : le seul fichier
// `brigade-selection.json` du gist de la station, la sélection entière, relue telle quelle par le lecteur du runtime —
// c'est ce qui la garde d'un lancement de l'app à l'autre. Ce que la vue envoie est vérifié avant toute écriture ; un
// refus de GitHub se dit en une ligne, son détail à part.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import * as contract from "../../runtime/src/enregistrement-station/contrat.ts";
import { stationDuGist } from "../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { githubOfStations } from "../src/stations/github.ts";
import { withTheirState, choiceOfProjects, REFUSAL_ABSENT, REFUSAL_CONNECTION, REFUSAL_GITHUB, REFUSAL_LIMIT, REFUSAL_PERMISSION, REFUSAL_PROJECTS, REFUSAL_NETWORK, REFUSAL_STATION, type StationRecorded, type StationsOfAccount } from "../src/stations-of-account.ts";
import { ghOfDirectory } from "./helpers/gh-of-directory.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

const INSTANT = Date.parse("2026-10-26T09:45:00.000Z");
const RECORDING = JSON.stringify({ brigade: "station-registration", format: 1, name: "box", platform: "linux", machine: "Linux 6.1.0", version: "1.4.0", registeredAt: "2026-10-26T09:00:00.000Z", lastSeen: "2026-10-26T09:44:00.000Z", refreshMs: 120_000, stoppedAt: null });

// Un gist en mémoire : ce que chaque écriture y a posé, et la liste des écritures.
function oneGist() {
  const files: Record<string, string> = { [contract.FICHIER_ENREGISTREMENT]: RECORDING };
  const writes: Array<{ id: string; noms: string[] }> = [];
  const choose = choiceOfProjects({
    ecrire: async (id, writtenOnes) => {
      writes.push({ id, noms: Object.keys(writtenOnes) });
      Object.assign(files, writtenOnes);
    },
    contrat: async () => contract,
    maintenant: () => INSTANT,
  });
  return { fichiers: files, ecritures: writes, choisir: choose };
}

describe("la sélection s'écrit selon le contrat, et se relit d'un lancement à l'autre", () => {
  test("seul brigade-selection.json est écrit : la sélection entière, sa forme et l'instant de l'écriture", async () => {
    const { fichiers: files, ecritures: writes, choisir: choose } = oneGist();
    assert.deepEqual(await choose("a1b2c3", ["acme/shop", "acme/site"]), { selection: ["acme/shop", "acme/site"] });
    assert.deepEqual(writes, [{ id: "a1b2c3", noms: [contract.FICHIER_SELECTION] }]);
    assert.deepEqual(JSON.parse(files[contract.FICHIER_SELECTION] ?? "null"), { brigade: "station-selection", format: contract.FORMAT, repositories: ["acme/shop", "acme/site"], updatedAt: "2026-10-26T09:45:00.000Z" });
    // L'enregistrement de la station n'est pas touché.
    assert.equal(files[contract.FICHIER_ENREGISTREMENT], RECORDING);
  });

  test("le lecteur du runtime relit ce que l'app a écrit : la station sert ce qui a été choisi", async () => {
    const { fichiers: files, choisir: choose } = oneGist();
    assert.equal((stationDuGist("a1b2c3", files, "chef", INSTANT) as { selection: unknown }).selection, null);
    await choose("a1b2c3", ["acme/site"]);
    assert.deepEqual((stationDuGist("a1b2c3", files, "chef", INSTANT) as { selection: unknown }).selection, ["acme/site"]);
    // Tout décoché : la station ne sert rien — ce n'est pas « rien de choisi ».
    await choose("a1b2c3", []);
    assert.deepEqual((stationDuGist("a1b2c3", files, "chef", INSTANT) as { selection: unknown }).selection, []);
  });

  test("un dépôt nommé deux fois ne l'est qu'une", async () => {
    const { fichiers: files, choisir: choose } = oneGist();
    assert.deepEqual(await choose("a1b2c3", ["acme/shop", "acme/shop"]), { selection: ["acme/shop"] });
    assert.deepEqual(contract.selectionLue(files[contract.FICHIER_SELECTION] ?? "")?.repositories, ["acme/shop"]);
  });
});

describe("ce qui ne s'écrit pas", () => {
  test("une station ou des dépôts que la vue ne peut pas avoir lus : refusés, rien n'est écrit", async () => {
    const { ecritures: writes, choisir: choose } = oneGist();
    for (const id of [undefined, "", "../gists", 42]) assert.deepEqual(await choose(id, ["acme/shop"]), { refus: REFUSAL_STATION });
    for (const repositories of [undefined, "acme/shop", ["acme"], ["acme/shop", 3], ["acme/shop; rm"]]) assert.deepEqual(await choose("a1b2c3", repositories), { refus: REFUSAL_PROJECTS });
    assert.deepEqual(writes, []);
  });

  test("GitHub qui refuse l'écriture : une ligne, et ce que `gh` a dit à part", async () => {
    const choose = choiceOfProjects({
      ecrire: async () => {
        throw new Error("gh: Server Error (HTTP 502)");
      },
      contrat: async () => contract,
    });
    assert.deepEqual(await choose("a1b2c3", ["acme/shop"]), { refus: REFUSAL_GITHUB, detail: "gh: Server Error (HTTP 502)" });
  });
});

// Un refus qui dit sa cause et le geste qui la répare, sur la ligne même (#3187) : jamais la seule phrase « GitHub did
// not take the change ». Ce que `gh` a dit reste au survol.
describe("un refus de GitHub dit sa cause et son geste", () => {
  const refusesBy = (message: string) =>
    choiceOfProjects({
      ecrire: async () => {
        throw new Error(message);
      },
      contrat: async () => contract,
    })("a1b2c3", ["acme/shop"]);

  test("la permission qui manque : elle est nommée, et la façon de la donner", async () => {
    const rendered = await refusesBy('This API operation needs the "gist" scope. To request it, run:  gh auth refresh -h github.com -s gist');
    assert.equal("refus" in rendered && rendered.refus, REFUSAL_PERMISSION);
    assert.match(REFUSAL_PERMISSION, /“gist” permission/);
    assert.match(REFUSAL_PERMISSION, /sign(?:ing)? in to GitHub again on this computer/);
    assert.match("detail" in rendered ? (rendered.detail ?? "") : "", /gh auth refresh -h github\.com -s gist/);
    for (const other of ["gh: Resource not accessible by personal access token (HTTP 403)", "gh: Must have admin rights to Repository. (HTTP 403)"]) assert.equal(((await refusesBy(other)) as { refus: string }).refus, REFUSAL_PERMISSION, other);
  });

  test("le réseau qui manque : la connexion de cet ordinateur, puis choisir de nouveau", async () => {
    for (const message of ["error connecting to api.github.com", "GitHub gave no answer within 30 s", "dial tcp: lookup api.github.com: i/o timeout"]) {
      assert.deepEqual(await refusesBy(message), { refus: REFUSAL_NETWORK, detail: message }, message);
    }
    assert.match(REFUSAL_NETWORK, /network connection/);
  });

  test("une autre cause : REFUS_GITHUB, qui dit d'où vient l'erreur et quoi faire", async () => {
    assert.deepEqual(await refusesBy("gh: Validation Failed (HTTP 422)"), { refus: REFUSAL_GITHUB, detail: "gh: Validation Failed (HTTP 422)" });
    assert.match(REFUSAL_GITHUB, /choose again/);
  });

  test("une connexion échue, la limite du compte, un enregistrement disparu : chacun son geste", async () => {
    assert.equal(((await refusesBy("gh: Bad credentials (HTTP 401)")) as { refus: string }).refus, REFUSAL_CONNECTION);
    // La limite répond 403 : ce n'est pas une permission qui manque.
    assert.equal(((await refusesBy("gh: API rate limit exceeded for user ID 1. (HTTP 403)")) as { refus: string }).refus, REFUSAL_LIMIT);
    assert.equal(((await refusesBy("this station's gist is no longer on GitHub")) as { refus: string }).refus, REFUSAL_ABSENT);
  });

  test("aucun refus ne se réduit à « GitHub did not take the change », ni ne cache son geste derrière un tiret", () => {
    for (const refusal of [REFUSAL_PERMISSION, REFUSAL_CONNECTION, REFUSAL_LIMIT, REFUSAL_NETWORK, REFUSAL_ABSENT, REFUSAL_GITHUB]) {
      assert.doesNotMatch(refusal, /did not take the change/);
      // projects-served.js (`refusDit`) met au survol ce qui suit « — » : le geste resterait caché.
      assert.doesNotMatch(refusal, / — /);
      assert.match(refusal, /; .*(?:again|lifts)/, refusal);
    }
  });

  test("par le vrai `gh` des stations : un 404 qui nomme la permission « gist » n'est pas un gist disparu", { skip: WITHOUT_POSIX }, async () => {
    const directory = mkdtempSync(join(tmpdir(), "brigade-selection-"));
    try {
      const gh = ghOfDirectory(directory, (_directory, args) =>
        args.includes("PATCH")
          ? { code: 1, sortie: "", erreurs: 'gh: Not Found (HTTP 404)\nThis API operation needs the "gist" scope. To request it, run:  gh auth refresh -h github.com -s gist\n' }
          : { code: 0, sortie: "{}", erreurs: "" },
      );
      const choose = choiceOfProjects({ ecrire: (id, files) => githubOfStations({ gh, delaiMs: 2_000 }).ecrire(id, files), contrat: async () => contract });
      const rendered = await choose("a1b2c3", ["acme/shop"]);
      assert.equal((rendered as { refus: string }).refus, REFUSAL_PERMISSION);
      assert.match((rendered as { detail: string }).detail, /^This API operation needs the "gist" scope/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("une station hors ligne se choisit comme une autre", () => {
  test("sa sélection s'écrit : elle la lit à son retour", async () => {
    const { fichiers: files, ecritures: writes, choisir: choose } = oneGist();
    // Le dernier signe de vie de la station date de 22 min : elle est hors ligne.
    const twentyTwo = INSTANT + 22 * 60_000;
    assert.equal((stationDuGist("a1b2c3", files, "chef", twentyTwo) as { available: boolean }).available, false);
    assert.deepEqual(await choose("a1b2c3", ["acme/shop"]), { selection: ["acme/shop"] });
    assert.deepEqual(writes, [{ id: "a1b2c3", noms: [contract.FICHIER_SELECTION] }]);
    assert.deepEqual((stationDuGist("a1b2c3", files, "chef", twentyTwo) as { selection: unknown }).selection, ["acme/shop"]);
  });
});

// L'état montré vient de ce que la station fait : son dernier signe de vie (#3187).
describe("l'état d'une station du compte est celui de son dernier signe de vie", () => {
  const station = (name: string, lastSeen: string, available: boolean): StationRecorded => ({ id: `g-${name}`, name: name, platform: "linux", machine: "Linux 6.1.0", version: "1.4.0", account: "chef", available, registeredAt: "2026-10-26T09:00:00.000Z", lastSeen, stoppedAt: null, refreshMs: 120_000, selection: null });
  const readEntries = (...stations: StationRecorded[]): StationsOfAccount => ({ state: "listed", stations, unreadable: [] });
  const states = (readOne: StationsOfAccount) => (readOne.state === "listed" ? readOne.stations.map(({ name, available, offlineSince }) => [name, available ? "online" : "offline", offlineSince ?? null]) : []);

  test("une station vivante est en ligne, une station muette depuis 22 min est hors ligne, et depuis quand", () => {
    // Lues alors que les deux étaient dites disponibles : c'est l'instant qui juge, pas la lecture.
    const alive = station("box", "2026-10-26T09:44:00.000Z", false);
    const silentOne = station("parade-box", "2026-10-26T09:23:00.000Z", true);
    assert.deepEqual(states(withTheirState(readEntries(alive, silentOne), [], INSTANT)), [
      ["box", "online", null],
      ["parade-box", "offline", "2026-10-26T09:23:00.000Z"],
    ]);
  });

  test("la box du chef qui tourne n'est pas dite hors ligne : sa présence, fraîche, dit qu'elle vit même quand son enregistrement tarde", () => {
    const inDelay = station("Box", "2026-10-26T09:23:00.000Z", false);
    assert.deepEqual(states(withTheirState(readEntries(inDelay), [{ nom: "box", etat: "en-ligne" }], INSTANT)), [["Box", "online", null]]);
    // Une présence elle-même muette ne la ranime pas.
    assert.deepEqual(states(withTheirState(readEntries(inDelay), [{ nom: "box", etat: "hors-ligne" }], INSTANT)), [["Box", "offline", "2026-10-26T09:23:00.000Z"]]);
  });

  test("une station arrêtée est hors ligne depuis son arrêt ; une lecture en échec passe telle quelle", () => {
    const stopped = { ...station("box", "2026-10-26T09:44:00.000Z", true), stoppedAt: "2026-10-26T09:44:00.000Z" };
    assert.deepEqual(states(withTheirState(readEntries(stopped), [], INSTANT)), [["box", "offline", "2026-10-26T09:44:00.000Z"]]);
    const failure: StationsOfAccount = { state: "unavailable", cause: "github", reason: "GitHub could not be reached." };
    assert.equal(withTheirState(failure, [], INSTANT), failure);
  });
});
