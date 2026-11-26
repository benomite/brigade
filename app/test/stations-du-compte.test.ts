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
import * as contrat from "../../runtime/src/enregistrement-station/contrat.ts";
import { stationDuGist } from "../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { githubDesStations } from "../src/stations/github.ts";
import { avecLeurEtat, choixDesProjets, REFUS_ABSENT, REFUS_CONNEXION, REFUS_GITHUB, REFUS_LIMITE, REFUS_PERMISSION, REFUS_PROJETS, REFUS_RESEAU, REFUS_STATION, type StationEnregistree, type StationsDuCompte } from "../src/stations-du-compte.ts";
import { ghDuRepertoire } from "./aides/gh-du-repertoire.ts";
import { SANS_POSIX } from "./aides/posix.ts";

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
        throw new Error("gh: Server Error (HTTP 502)");
      },
      contrat: async () => contrat,
    });
    assert.deepEqual(await choisir("a1b2c3", ["acme/shop"]), { refus: REFUS_GITHUB, detail: "gh: Server Error (HTTP 502)" });
  });
});

// Un refus qui dit sa cause et le geste qui la répare, sur la ligne même (#3187) : jamais la seule phrase « GitHub did
// not take the change ». Ce que `gh` a dit reste au survol.
describe("un refus de GitHub dit sa cause et son geste", () => {
  const refusePar = (message: string) =>
    choixDesProjets({
      ecrire: async () => {
        throw new Error(message);
      },
      contrat: async () => contrat,
    })("a1b2c3", ["acme/shop"]);

  test("la permission qui manque : elle est nommée, et la façon de la donner", async () => {
    const rendu = await refusePar('This API operation needs the "gist" scope. To request it, run:  gh auth refresh -h github.com -s gist');
    assert.equal("refus" in rendu && rendu.refus, REFUS_PERMISSION);
    assert.match(REFUS_PERMISSION, /“gist” permission/);
    assert.match(REFUS_PERMISSION, /sign(?:ing)? in to GitHub again on this computer/);
    assert.match("detail" in rendu ? (rendu.detail ?? "") : "", /gh auth refresh -h github\.com -s gist/);
    for (const autre of ["gh: Resource not accessible by personal access token (HTTP 403)", "gh: Must have admin rights to Repository. (HTTP 403)"]) assert.equal(((await refusePar(autre)) as { refus: string }).refus, REFUS_PERMISSION, autre);
  });

  test("le réseau qui manque : la connexion de cet ordinateur, puis choisir de nouveau", async () => {
    for (const message of ["error connecting to api.github.com", "GitHub gave no answer within 30 s", "dial tcp: lookup api.github.com: i/o timeout"]) {
      assert.deepEqual(await refusePar(message), { refus: REFUS_RESEAU, detail: message }, message);
    }
    assert.match(REFUS_RESEAU, /network connection/);
  });

  test("une autre cause : REFUS_GITHUB, qui dit d'où vient l'erreur et quoi faire", async () => {
    assert.deepEqual(await refusePar("gh: Validation Failed (HTTP 422)"), { refus: REFUS_GITHUB, detail: "gh: Validation Failed (HTTP 422)" });
    assert.match(REFUS_GITHUB, /choose again/);
  });

  test("une connexion échue, la limite du compte, un enregistrement disparu : chacun son geste", async () => {
    assert.equal(((await refusePar("gh: Bad credentials (HTTP 401)")) as { refus: string }).refus, REFUS_CONNEXION);
    // La limite répond 403 : ce n'est pas une permission qui manque.
    assert.equal(((await refusePar("gh: API rate limit exceeded for user ID 1. (HTTP 403)")) as { refus: string }).refus, REFUS_LIMITE);
    assert.equal(((await refusePar("this station's gist is no longer on GitHub")) as { refus: string }).refus, REFUS_ABSENT);
  });

  test("aucun refus ne se réduit à « GitHub did not take the change », ni ne cache son geste derrière un tiret", () => {
    for (const refus of [REFUS_PERMISSION, REFUS_CONNEXION, REFUS_LIMITE, REFUS_RESEAU, REFUS_ABSENT, REFUS_GITHUB]) {
      assert.doesNotMatch(refus, /did not take the change/);
      // projets-servis.js (`refusDit`) met au survol ce qui suit « — » : le geste resterait caché.
      assert.doesNotMatch(refus, / — /);
      assert.match(refus, /; .*(?:again|lifts)/, refus);
    }
  });

  test("par le vrai `gh` des stations : un 404 qui nomme la permission « gist » n'est pas un gist disparu", { skip: SANS_POSIX }, async () => {
    const repertoire = mkdtempSync(join(tmpdir(), "brigade-selection-"));
    try {
      const gh = ghDuRepertoire(repertoire, (_repertoire, args) =>
        args.includes("PATCH")
          ? { code: 1, sortie: "", erreurs: 'gh: Not Found (HTTP 404)\nThis API operation needs the "gist" scope. To request it, run:  gh auth refresh -h github.com -s gist\n' }
          : { code: 0, sortie: "{}", erreurs: "" },
      );
      const choisir = choixDesProjets({ ecrire: (id, fichiers) => githubDesStations({ gh, delaiMs: 2_000 }).ecrire(id, fichiers), contrat: async () => contrat });
      const rendu = await choisir("a1b2c3", ["acme/shop"]);
      assert.equal((rendu as { refus: string }).refus, REFUS_PERMISSION);
      assert.match((rendu as { detail: string }).detail, /^This API operation needs the "gist" scope/);
    } finally {
      rmSync(repertoire, { recursive: true, force: true });
    }
  });
});

describe("une station hors ligne se choisit comme une autre", () => {
  test("sa sélection s'écrit : elle la lit à son retour", async () => {
    const { fichiers, ecritures, choisir } = unGist();
    // Le dernier signe de vie de la station date de 22 min : elle est hors ligne.
    const vingtDeux = INSTANT + 22 * 60_000;
    assert.equal((stationDuGist("a1b2c3", fichiers, "chef", vingtDeux) as { available: boolean }).available, false);
    assert.deepEqual(await choisir("a1b2c3", ["acme/shop"]), { selection: ["acme/shop"] });
    assert.deepEqual(ecritures, [{ id: "a1b2c3", noms: [contrat.FICHIER_SELECTION] }]);
    assert.deepEqual((stationDuGist("a1b2c3", fichiers, "chef", vingtDeux) as { selection: unknown }).selection, ["acme/shop"]);
  });
});

// L'état montré vient de ce que la station fait : son dernier signe de vie (#3187).
describe("l'état d'une station du compte est celui de son dernier signe de vie", () => {
  const station = (nom: string, lastSeen: string, available: boolean): StationEnregistree => ({ id: `g-${nom}`, name: nom, platform: "linux", machine: "Linux 6.1.0", version: "1.4.0", account: "chef", available, registeredAt: "2026-10-26T09:00:00.000Z", lastSeen, stoppedAt: null, refreshMs: 120_000, selection: null });
  const lues = (...stations: StationEnregistree[]): StationsDuCompte => ({ state: "listed", stations, unreadable: [] });
  const etats = (lu: StationsDuCompte) => (lu.state === "listed" ? lu.stations.map(({ name, available, offlineSince }) => [name, available ? "online" : "offline", offlineSince ?? null]) : []);

  test("une station vivante est en ligne, une station muette depuis 22 min est hors ligne, et depuis quand", () => {
    // Lues alors que les deux étaient dites disponibles : c'est l'instant qui juge, pas la lecture.
    const vivante = station("box", "2026-10-26T09:44:00.000Z", false);
    const muette = station("parade-box", "2026-10-26T09:23:00.000Z", true);
    assert.deepEqual(etats(avecLeurEtat(lues(vivante, muette), [], INSTANT)), [
      ["box", "online", null],
      ["parade-box", "offline", "2026-10-26T09:23:00.000Z"],
    ]);
  });

  test("la box du chef qui tourne n'est pas dite hors ligne : sa présence, fraîche, dit qu'elle vit même quand son enregistrement tarde", () => {
    const enRetard = station("Box", "2026-10-26T09:23:00.000Z", false);
    assert.deepEqual(etats(avecLeurEtat(lues(enRetard), [{ nom: "box", etat: "en-ligne" }], INSTANT)), [["Box", "online", null]]);
    // Une présence elle-même muette ne la ranime pas.
    assert.deepEqual(etats(avecLeurEtat(lues(enRetard), [{ nom: "box", etat: "hors-ligne" }], INSTANT)), [["Box", "offline", "2026-10-26T09:23:00.000Z"]]);
  });

  test("une station arrêtée est hors ligne depuis son arrêt ; une lecture en échec passe telle quelle", () => {
    const arretee = { ...station("box", "2026-10-26T09:44:00.000Z", true), stoppedAt: "2026-10-26T09:44:00.000Z" };
    assert.deepEqual(etats(avecLeurEtat(lues(arretee), [], INSTANT)), [["box", "offline", "2026-10-26T09:44:00.000Z"]]);
    const echec: StationsDuCompte = { state: "unavailable", cause: "github", reason: "GitHub could not be reached." };
    assert.equal(avecLeurEtat(echec, [], INSTANT), echec);
  });
});
