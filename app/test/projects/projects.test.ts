// « Add a project » : l'app écrit la demande dans le gist de chaque station choisie, relit ce que
// chacune en dit, et retire le projet de toutes. Contre une doublure de `gh` qui tient les gists du
// compte et ses dépôts dans un répertoire : ni réseau, ni GitHub, ni station — GitHub est le seul
// canal, et ce test n'en ouvre aucun autre.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { FILE_PROJECTS, FILE_TRACKING } from "../../src/projects/request.ts";
import { repositoriesOfChef } from "../../src/projects/github.ts";
import type { ProjectRequest } from "../../src/projects/request.ts";
import { warning, CALIBRATION_MEASURE, calibrationRecommended, cooksOfCores, isOneComputer, mergeTheTime, machineProposed, stationRecommended, holdProjects, type OptionsProjects, type SeenOfProjects } from "../../src/projects/projects.ts";
import { githubOfStations } from "../../src/stations/github.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { ghOfDirectory } from "../helpers/gh-of-directory.ts";
import { reply } from "./fake-gh.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";

// Copy of the station's cap rule (formerly runtime/src/projections/stations.ts, `plafondDesCoeurs`): two cores
// are kept for the kitchen itself, and never fewer than one cook.
const plafondDesCoeurs = (cores: number): number => Math.max(1, cores - 2);

const SOURCES = join(import.meta.dirname, "../../src/projects");
const NOW = Date.parse("2026-10-15T12:01:00Z");
const OPEN = "2026-10-15T12:00:00.000Z";

const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", dit: "online", version: "1.4.0", projets: [], max: null };
const MAC: StationVue = { id: "g2", nom: "macbook", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", dit: "online", version: "1.4.0", projets: [], max: null };
const OFF: StationVue = { id: "g3", nom: "vieux", machine: "Linux 5.10", etat: "hors-ligne", ligne: "offline for 3 min · version 1.3.0 · no project", dit: "offline for 3 min", version: "1.3.0", projets: [], max: null };

const INPUT = {
  depot: "benomite/parade",
  base: "main",
  stations: ["g1", "g2"],
  cooks: "2",
  manager: { modele: "sonnet", effort: "medium" },
  reviewer: { modele: "opus", effort: "high" },
  ouvertLe: OPEN,
  capacites: [] as string[],
};

// GitHub : les gists des stations et les dépôts du compte, dans un répertoire que la doublure lit et écrit.
function oneGitHub(t: TestContext, stations: StationVue[] = [BOX, MAC], more: Partial<OptionsProjects> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-projets-"));
  writeFileSync(join(directory, "appels"), "");
  const gh = ghOfDirectory(directory, reply);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = (id: string) => join(directory, `${id}.gist.json`);
  const gist = (id: string) => JSON.parse(readFileSync(file(id), "utf8")) as { files: Record<string, { filename: string; content: string }> };
  for (const { id } of stations) writeFileSync(file(id), JSON.stringify({ id, description: "brigade — station", public: false, updated_at: "2026-10-15T11:00:00Z", files: { "brigade-station.json": { filename: "brigade-station.json", content: "{}" }, "brigade-appairage.json": { filename: "brigade-appairage.json", content: "{}" } } }));
  const request = (id: string) => (JSON.parse(gist(id).files[FILE_PROJECTS]?.content ?? "null") as { projets: Array<Record<string, unknown>> } | null)?.projets;
  // Ce que la station écrit de ses projets demandés (runtime/src/projets/tenir.ts).
  const follow = (id: string, projects: object[]) => {
    const readOne = gist(id);
    readOne.files[FILE_TRACKING] = { filename: FILE_TRACKING, content: JSON.stringify({ brigade: "projets-suivi", format: 1, a: "2026-10-15T12:02:00Z", projets: projects }) };
    writeFileSync(file(id), JSON.stringify(readOne));
  };
  const readings: SeenOfProjects[] = [];
  const projects = holdProjects({
    github: githubOfStations({ gh, delaiMs: 30_000 }),
    stations: () => stations,
    depots: repositoriesOfChef({ gh, delaiMs: 30_000 }),
    surLecture: (seenOne) => readings.push(seenOne),
    maintenant: () => NOW,
    ...more,
  });
  return { repertoire: directory, projets: projects, lectures: readings, demande: request, suivre: follow, gist, depots: (list: object[]) => writeFileSync(join(directory, "depots"), JSON.stringify(list)), panne: () => writeFileSync(join(directory, "panne"), "") };
}

test("la station recommandée est un serveur en ligne ; un ordinateur choisi se dit au moment du choix", () => {
  assert.equal(stationRecommended([MAC, OFF, BOX]), "g1");
  // Un serveur hors ligne ne peut pas cuire maintenant : il n'est jamais recommandé, et rien ne l'est à sa place (#3187).
  assert.equal(stationRecommended([MAC, OFF]), undefined);
  assert.equal(stationRecommended([MAC]), undefined);
  assert.equal(isOneComputer(MAC), true);
  assert.equal(isOneComputer({ machine: "Windows 10.0.26100" }), true);
  assert.equal(warning(BOX), undefined);
  assert.equal(warning(MAC), "macbook is a computer's app: this project's kitchen stops whenever you close the app there. A server station, always on, is recommended.");
});

const PHONE: StationVue = { id: "g4", nom: "pixel", machine: "Android 15", cuisine: false, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", dit: "online", version: "1.4.0", projets: [], max: null };


test("les cooks proposés sont ceux que les cœurs de la machine permettent — le plafond même que la station en dérive", () => {
  for (let cores = 1; cores <= 64; cores++) assert.equal(cooksOfCores(cores), plafondDesCoeurs(cores), `${cores} cœurs`);
  assert.deepEqual(machineProposed({ ...BOX, coeurs: 8 }), { toujoursAllumee: true, implique: "always on: it keeps cooking while your computer sleeps", cooks: 6, cooksDit: "from box's 8 cores: two are kept for the kitchen itself, then about one per cook" });
  assert.deepEqual(machineProposed({ ...MAC, coeurs: 12 }), { toujoursAllumee: false, implique: "stops when you close the app on this computer", cooks: 10, cooksDit: "from macbook's 12 cores: two are kept for the kitchen itself, then about one per cook" });
  // Une station qui ne publie pas encore ses cœurs : un départ prudent, dit comme tel.
  assert.deepEqual([machineProposed(BOX).cooks, machineProposed(BOX).cooksDit], [2, "box does not publish its cores yet: 2, a careful start"]);
});

test("le calibrage proposé est celui du projet confié le plus récemment ; sans autre projet, la valeur de départ mesurée", () => {
  const request = (name: string, requestThe: string | null, manager: { modele: string; effort: string }): ProjectRequest => ({ nom: name, depot: `benomite/${name}`, base: "main", principale: true, cooks: 2, manager, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: requestThe });
  assert.deepEqual(calibrationRecommended([]), { manager: CALIBRATION_MEASURE, reviewer: CALIBRATION_MEASURE, dit: "the starting value measured on brigade's own box, for lack of another project on your stations" });
  assert.deepEqual(CALIBRATION_MEASURE, { modele: "sonnet", effort: "medium" });
  assert.deepEqual(
    calibrationRecommended([request("ancien", "2026-10-01T00:00:00.000Z", { modele: "haiku", effort: "low" }), request("cantine", "2026-10-12T00:00:00.000Z", { modele: "opus", effort: "medium" }), request("vieux", null, { modele: "sonnet", effort: "max" })]),
    { manager: { modele: "opus", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, dit: "what cantine runs on, your project most recently given to a station" },
  );
  // Un calibrage que la station n'accepterait pas ne se propose pas.
  assert.equal(calibrationRecommended([request("bizarre", "2026-10-19T00:00:00.000Z", { modele: "gpt", effort: "medium" })]).dit, calibrationRecommended([]).dit);
});


describe("l'ajout, la lecture et le retrait d'un projet, contre un GitHub de test", { concurrency: 7 }, () => {





  test("les dépôts du chef : les plus récents d'abord, ni archivés ni forks, avec leur branche par défaut ; GitHub muet, le refus le dit", { skip: WITHOUT_POSIX }, async (t) => {
    const { projets: projects, depots: repositories, panne: outage } = oneGitHub(t);
    repositories([
      { full_name: "benomite/parade", default_branch: "main" },
      { full_name: "benomite/vieux", default_branch: "master", archived: true },
      { full_name: "benomite/fourche", default_branch: "main", fork: true },
      { full_name: "benomite/brigade", default_branch: "v2" },
    ]);
    assert.deepEqual(await projects.depots(), {
      depots: [
        { depot: "benomite/parade", base: "main" },
        { depot: "benomite/brigade", base: "v2" },
      ],
    });
    outage();
    assert.deepEqual(await projects.depots(), { refus: "your repositories could not be read on GitHub — error connecting to api.github.com" });
  });

  // La page d'un projet de l'app le confie à des stations (#983) : à une première, ou à une de plus.
  const TRUST = { ...INPUT, nom: "parade", stations: ["g1"] };
  const EXPECTED = { nom: "parade", depot: "benomite/parade", base: "main", cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: OPEN, demandeLe: "2026-10-15T12:01:00.000Z" };






  const WITHOUT_NOTHING = { nom: "parade", depot: "", base: "", stations: ["g2"], cooks: "", manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: OPEN };
  const SERVED = { nom: "parade", etat: "servi", dit: "", autoriser: [], serviLe: "2026-10-15T11:30:00Z" };









});

test("l'app ne joint aucune station : ce module ne parle qu'au `gh` du poste", () => {
  for (const file of ["projects.ts", "github.ts", "request.ts"]) {
    const source = readFileSync(join(SOURCES, file), "utf8");
    assert.doesNotMatch(source, /node:(net|http|https|dgram|tls)|fetch\(|WebSocket/, file);
  }
});

test("les temps de deux stations d'un projet : un ticket n'est compté qu'une fois, le plus récent l'emporte (#2567)", () => {
  const oneOf = (ticket: number, mergedAt: string, cooking = 60) => ({ ticket, mergedAt, cuisson: cooking });
  const merge = mergeTheTime({ enregistrements: [oneOf(1, "2026-11-06T07:00:00Z"), oneOf(2, "2026-11-06T07:10:00Z")], lostTimeMaxMin: 2 }, { enregistrements: [oneOf(2, "2026-11-06T07:10:00Z"), oneOf(3, "2026-11-06T07:20:00Z")], lostTimeMaxMin: 3 });
  assert.deepEqual(merge.enregistrements.map((e) => (e as { ticket: number }).ticket).sort(), [1, 2, 3]);
  assert.equal(merge.lostTimeMaxMin, 2);
  assert.deepEqual(mergeTheTime(undefined, { enregistrements: [], lostTimeMaxMin: 2 }), { enregistrements: [], lostTimeMaxMin: 2 });
  // Le résumé de la mesure (#2664) passe tel quel : celui de la première station qui en publie un.
  const resume = { n: 3, medianMin: 14, p75Min: 47, perduMedianMin: 5, lostTimeMaxMin: 2, phaseLaPlusLongue: null, perteLaPlusLourde: null };
  assert.deepEqual(mergeTheTime({ enregistrements: [], lostTimeMaxMin: 2 }, { enregistrements: [], lostTimeMaxMin: 2, resume }).resume, resume);
});

test("the pass time of two stations (#3512) is the first one published: a station that publishes none (null) does not hide the other's", () => {
  const pass = { jours: 7, livraisons: 2, parts: [], phaseLaPlusLourde: null, partLaPlusLourde: { nom: "CI", partPct: 70 }, relancees: null, renvoyees: 0, passesRenvoyeesS: 0 };
  assert.deepEqual(mergeTheTime({ enregistrements: [], lostTimeMaxMin: 2, passe: null }, { enregistrements: [], lostTimeMaxMin: 2, passe: pass }).passe, pass);
  assert.equal(mergeTheTime({ enregistrements: [], lostTimeMaxMin: 2, passe: null }, { enregistrements: [], lostTimeMaxMin: 2 }).passe, undefined);
});
