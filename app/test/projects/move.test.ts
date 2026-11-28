// Déménager la cuisine d'un projet depuis l'app (#1095) : déménagé, ou refusé avec sa raison en une phrase,
// sans jamais échouer en silence. Où cuit chaque projet se lit dans le
// suivi de ses stations, pas dans la demande ; et un déménagement en cours, écrit par le runtime
// dans la demande (`remise`, `reprise`), survit à toute réécriture de l'app.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { documentOfRequest, FILE_PROJECTS, FILE_TRACKING, type ProjectRequest } from "../../src/projects/request.ts";
import { type Mover } from "../../src/projects/move.ts";
import { holdProjects, type SeenOfProjects } from "../../src/projects/projects.ts";
import type { Files, GitHubOfStations } from "../../src/stations/github.ts";
import type { StationVue } from "../../src/stations/stations.ts";

const BOX: StationVue = { id: "gbox", nom: "parade-box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online", dit: "online", version: "1.4.0", projets: [], max: null };
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online", dit: "online", version: "1.4.0", projets: [], max: null };
const REQUEST_THE = "2026-10-20T10:00:00.000Z";
const PARADE: ProjectRequest = { nom: "parade", depot: "benomite/parade", base: "main", principale: true, cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "sonnet", effort: "medium" }, ouvertLe: null, demandeLe: REQUEST_THE };

// GitHub, en mémoire : le gist de chaque station, ses fichiers.
function oneGitHub(gists: Record<string, Files>): GitHubOfStations {
  return {
    lister: async () => Object.keys(gists).map((id) => ({ id, misAJour: "", appairee: true })),
    lire: async (id) => (gists[id] === undefined ? null : { ...gists[id] }),
    ecrire: async (id, files) => void (gists[id] = { ...(gists[id] ?? {}), ...files }),
    supprimer: async (id, file) => void delete gists[id]?.[file],
  };
}
const tracking = (station: { nom: string; locale: boolean }, projects: object[]) => `${JSON.stringify({ brigade: "projets-suivi", format: 1, a: REQUEST_THE, station, projets: projects })}\n`;
const oneTracking = (project: object) => ({ nom: "parade", etat: "servi", dit: "", autoriser: [], serviLe: null, cuitSur: null, ici: false, bascule: null, ...project });

function theProjects(gists: Record<string, Files>, options: { locale?: string | null; demenager?: Mover; stations?: StationVue[] } = {}) {
  const readings: SeenOfProjects[] = [];
  const projects = holdProjects({ github: oneGitHub(gists), stations: () => options.stations ?? [BOX, MAC], depots: async () => [], surLecture: (seenOne) => readings.push(seenOne), ...(options.locale === undefined ? {} : { locale: () => options.locale ?? null }), ...(options.demenager === undefined ? {} : { demenager: options.demenager }) });
  return { projets: projects, lectures: readings };
}

test("où il cuit : la station qui le sert, telle que son suivi le dit — « ici » pour celle de cet ordinateur", async () => {
  const onTheBox = theProjects({
    gbox: { [FILE_PROJECTS]: documentOfRequest([PARADE]), [FILE_TRACKING]: tracking({ nom: "parade-box", locale: false }, [oneTracking({ cuitSur: "parade-box" })]) },
    gmac: {},
  }, { locale: "gmac" });
  const seenOne = await onTheBox.projets.relire();
  assert.equal(seenOne.locale, "gmac");
  assert.deepEqual(seenOne.projets[0]?.cuitSur, { id: "gbox", nom: "parade-box", ici: false });
  assert.equal(seenOne.projets[0]?.demenagement, null);

  const onTheMac = theProjects({
    gbox: { [FILE_PROJECTS]: documentOfRequest([{ ...PARADE, principale: false }]), [FILE_TRACKING]: tracking({ nom: "parade-box", locale: false }, [oneTracking({ etat: "secondaire", cuitSur: "macbook" })]) },
    gmac: { [FILE_PROJECTS]: documentOfRequest([PARADE]), [FILE_TRACKING]: tracking({ nom: "macbook", locale: true }, [oneTracking({ cuitSur: "macbook", ici: true })]) },
  }, { locale: "gmac" });
  assert.deepEqual((await onTheMac.projets.relire()).projets[0]?.cuitSur, { id: "gmac", nom: "macbook", ici: true });
});

test("refusé par la station visée, il cuit toujours là où il cuisait : la demande nomme le Mac, le suivi la box — et la raison suit", async () => {
  const toggle = { de: "parade-box", vers: "macbook", demandeLe: REQUEST_THE, etape: "refusee" };
  const reason = "la configuration du bac à sable ne tient pas sur ce Mac — sandbox-exec is missing";
  const { projets: projects } = theProjects({
    gbox: {
      [FILE_PROJECTS]: documentOfRequest([{ ...PARADE, principale: false, remise: { vers: "macbook", gist: "gmac", demandeLe: REQUEST_THE } }]),
      [FILE_TRACKING]: tracking({ nom: "parade-box", locale: false }, [oneTracking({ dit: `served by parade-box; moving to macbook is refused, so it stays here — ${reason}`, cuitSur: "parade-box", bascule: toggle })]),
    },
    gmac: {
      [FILE_PROJECTS]: documentOfRequest([{ ...PARADE, reprise: { de: "parade-box", gist: "gbox", demandeLe: REQUEST_THE } }]),
      [FILE_TRACKING]: tracking({ nom: "macbook", locale: true }, [oneTracking({ etat: "refuse", dit: reason, cuitSur: "parade-box", bascule: toggle })]),
    },
  }, { locale: "gmac" });
  const [parade] = (await projects.relire()).projets;
  assert.deepEqual(parade?.cuitSur, { id: "gbox", nom: "parade-box", ici: false });
  assert.deepEqual(parade?.demenagement, { de: "parade-box", vers: "macbook", demandeLe: REQUEST_THE, etape: "refusee", dit: reason });
});

test("reçu par la station visée, le déménagement est fini : rien n'en reste à dire", async () => {
  const finished = (step: string) => ({ de: "parade-box", vers: "macbook", demandeLe: REQUEST_THE, etape: step });
  const { projets: projects } = theProjects({
    gbox: { [FILE_PROJECTS]: documentOfRequest([{ ...PARADE, principale: false }]), [FILE_TRACKING]: tracking({ nom: "parade-box", locale: false }, [oneTracking({ etat: "secondaire", cuitSur: "macbook", bascule: finished("remise") })]) },
    gmac: { [FILE_PROJECTS]: documentOfRequest([PARADE]), [FILE_TRACKING]: tracking({ nom: "macbook", locale: true }, [oneTracking({ cuitSur: "macbook", ici: true, bascule: finished("recue") })]) },
  });
  const [parade] = (await projects.relire()).projets;
  assert.equal(parade?.demenagement, null);
  assert.equal(parade?.cuitSur?.nom, "macbook");
});

test("déménager passe par l'opération du runtime, vers une station appairée, avec les gists de toutes ; puis les projets se relisent", async () => {
  const calls: Array<[string, string, readonly string[]]> = [];
  const { projets: projects, lectures: readings } = theProjects({ gbox: { [FILE_PROJECTS]: documentOfRequest([PARADE]) }, gmac: {} }, {
    demenager: async (project, to, gists) => {
      calls.push([project, to, gists]);
      return { refus: "sandbox-exec is missing on this computer" };
    },
  });
  assert.deepEqual(await projects.demenager("parade", "gmac"), { refus: "sandbox-exec is missing on this computer" });
  assert.deepEqual(calls, [["parade", "gmac", ["gbox", "gmac"]]]);
  assert.equal(readings.length, 1, "les projets sont relus après le geste");
  // Une station qui n'est pas appairée, ou une app sans runtime : refusé, en une phrase, sans rien lancer.
  assert.deepEqual(await projects.demenager("parade", "ailleurs"), { refus: "that station is no longer paired with this app: nothing was changed" });
  assert.deepEqual(await theProjects({}).projets.demenager("parade", "gmac"), { refus: "this app has no runtime beside it to move a kitchen: nothing was changed" });
  assert.equal(calls.length, 1);
});


// « Continue without sandbox » (#1113) : la décision se note pour la station qui cuit le projet, la seule
// que l'app atteigne.
describe("continuer sans bac à sable", () => {
  const gistsOfParade = (mainOn: "gbox" | "gmac") => ({
    gbox: { [FILE_PROJECTS]: documentOfRequest([{ ...PARADE, principale: mainOn === "gbox" }]), [FILE_TRACKING]: tracking({ nom: "parade-box", locale: false }, [oneTracking({})]) },
    gmac: { [FILE_PROJECTS]: documentOfRequest([{ ...PARADE, principale: mainOn === "gmac" }]), [FILE_TRACKING]: tracking({ nom: "macbook", locale: true }, [oneTracking({})]) },
  });
  const theProjectsWithoutSandbox = (mainOn: "gbox" | "gmac", acceptWithoutSandbox?: (project: string, station: string) => Promise<void>) => {
    const projects = holdProjects({ github: oneGitHub(gistsOfParade(mainOn)), stations: () => [BOX, MAC], depots: async () => [], surLecture: () => {}, locale: () => "gmac", ...(acceptWithoutSandbox === undefined ? {} : { accepterSansBac: acceptWithoutSandbox }) });
    return projects;
  };

});

test("deux stations servent le projet (#2714) : déménagé vers une troisième, l'app nomme celle où la page le dit cuire", async () => {
  const PI: StationVue = { ...MAC, id: "gpi", nom: "pi" };
  const calls: Array<[string, string, readonly string[], string | undefined]> = [];
  const { projets: projects } = theProjects(
    {
      gbox: { [FILE_PROJECTS]: documentOfRequest([PARADE]), [FILE_TRACKING]: tracking({ nom: "parade-box", locale: false }, [oneTracking({})]) },
      gmac: { [FILE_PROJECTS]: documentOfRequest([PARADE]), [FILE_TRACKING]: tracking({ nom: "macbook", locale: false }, [oneTracking({})]) },
      gpi: {},
    },
    {
      stations: [BOX, MAC, PI],
      demenager: async (project, to, gists, of) => {
        calls.push([project, to, gists, of]);
        return { demenage: { projet: project, de: "parade-box", vers: "pi" } };
      },
    },
  );
  const [parade] = (await projects.relire()).projets;
  assert.equal(parade?.cuitSur?.id, "gbox");
  assert.deepEqual(await projects.demenager("parade", "gpi"), { demenage: { projet: "parade", de: "parade-box", vers: "pi" } });
  assert.deepEqual(calls, [["parade", "gpi", ["gbox", "gmac", "gpi"], "gbox"]]);
});
