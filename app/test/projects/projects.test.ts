// « Add a project » : l'app écrit la demande dans le gist de chaque station choisie, relit ce que
// chacune en dit, et retire le projet de toutes. Contre une doublure de `gh` qui tient les gists du
// compte et ses dépôts dans un répertoire : ni réseau, ni GitHub, ni station — GitHub est le seul
// canal, et ce test n'en ouvre aucun autre.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { FILE_PROJECTS, FILE_TRACKING } from "../../src/projects/request.ts";
import { repositoriesOfChef } from "../../src/projects/github.ts";
import { readClone } from "../../src/addition.ts";
import type { ProjectRequest } from "../../src/projects/request.ts";
import { warning, CALIBRATION_MEASURE, calibrationRecommended, cooksOfCores, isOneComputer, mergeTheTime, readTrust, readInput, machineProposed, nameOfProject, stationRecommended, refusalOfTrust, refusalOfInput, holdProjects, type OptionsProjects, type SeenOfProjects } from "../../src/projects/projects.ts";
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

const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };
const MAC: StationVue = { id: "g2", nom: "macbook", machine: "macOS 25.0.0", etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };
const OFF: StationVue = { id: "g3", nom: "vieux", machine: "Linux 5.10", etat: "hors-ligne", ligne: "offline for 3 min · version 1.3.0 · no project", pannes: [], dit: "offline for 3 min", version: "1.3.0", projets: [], max: null };

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

const PHONE: StationVue = { id: "g4", nom: "pixel", machine: "Android 15", cuisine: false, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };

test("un téléphone ne cuit rien : jamais recommandé, et refusé de toute saisie qui le choisit", () => {
  assert.equal(stationRecommended([PHONE]), undefined);
  assert.equal(stationRecommended([PHONE, BOX]), "g1");
  const stations = [BOX, MAC, PHONE];
  assert.equal(refusalOfInput({ ...INPUT, stations: ["g1", "g4"] }, stations, []).stations, "pixel does not cook: choose a station that does.");
  assert.equal(refusalOfInput(INPUT, stations, []).stations, undefined);
  const trust = { ...INPUT, nom: "parade", stations: ["g4"] };
  assert.equal(refusalOfTrust(trust, stations, { portee: [], suivi: false }).stations, "pixel does not cook: choose a station that does.");
});

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

test("le nom du projet vient de son dépôt ; ce qui manque est signalé champ par champ", () => {
  assert.equal(nameOfProject("benomite/Calculus_Workspace"), "calculus-workspace");
  assert.deepEqual(refusalOfInput(readInput(INPUT), [BOX, MAC], []), {});
  assert.deepEqual(refusalOfInput(readInput({}), [BOX, MAC], []), {
    depot: "Choose the project's GitHub repository — `<owner>/<name>`.",
    base: "The integration branch is missing: the branch the kitchen delivers to.",
    stations: "Choose at least one station to serve this project.",
    cooks: "How many cooks may a station run at once for this project?",
    "manager-modele": "Choose the manager's model.",
    "manager-effort": "Choose the manager's effort.",
    "reviewer-modele": "Choose the reviewer's model.",
    "reviewer-effort": "Choose the reviewer's effort.",
  });
  assert.deepEqual(refusalOfInput(readInput({ ...INPUT, depot: "parade", cooks: "0" }), [BOX, MAC], []), {
    depot: "“parade” is not a GitHub repository: expected `<owner>/<name>`.",
    cooks: "The number of cooks is a whole number, 1 or more.",
  });
  assert.deepEqual(refusalOfInput(readInput({ ...INPUT, stations: ["g1", "g7"] }), [BOX, MAC], ["parade"]), {
    depot: "A project named parade is already on your stations: remove it first.",
    stations: "A chosen station is no longer paired with this app.",
  });
});

describe("l'ajout, la lecture et le retrait d'un projet, contre un GitHub de test", { concurrency: 7 }, () => {
  test("ajouté : la demande s'écrit dans le gist de chaque station choisie, la principale marquée — telle que la station la lit", { skip: WITHOUT_POSIX }, async (t) => {
    const { projets: projects, demande: request } = oneGitHub(t, [BOX, MAC, OFF]);
    assert.deepEqual(await projects.ajouter(INPUT), { ajoute: "parade" });
    const expected = { nom: "parade", depot: "benomite/parade", base: "main", cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: OPEN, demandeLe: "2026-10-15T12:01:00.000Z" };
    assert.deepEqual(request("g1"), [{ ...expected, principale: true }]);
    assert.deepEqual(request("g2"), [{ ...expected, principale: false }]);
    assert.equal(request("g3"), undefined);
    // Le même projet ne s'ajoute pas deux fois.
    assert.deepEqual(await projects.ajouter(INPUT), { signales: { depot: "A project named parade is already on your stations: remove it first." } });
  });

  test("une saisie incomplète n'écrit rien ; GitHub muet, le refus le dit en une ligne", { skip: WITHOUT_POSIX }, async (t) => {
    const { projets: projects, demande: request, panne: outage } = oneGitHub(t);
    const rendered = await projects.ajouter({ ...INPUT, cooks: "" });
    assert.deepEqual(rendered, { signales: { cooks: "How many cooks may a station run at once for this project?" } });
    assert.equal(request("g1"), undefined);
    outage();
    const refuses = await projects.ajouter(INPUT);
    assert.ok("refus" in refuses && /^parade was not added: GitHub could not be read or written — error connecting to api\.github\.com$/.test(refuses.refus), JSON.stringify(refuses));
  });

  test("ce que chaque station dit du projet se lit sous lui : servi, et en combien de temps depuis le parcours ouvert ; à autoriser, avec ses pages", { skip: WITHOUT_POSIX }, async (t) => {
    const { projets: projects, suivre: follow } = oneGitHub(t);
    await projects.ajouter(INPUT);
    const before = await projects.relire();
    assert.deepEqual(
      before.projets[0]?.stations.map(({ nom: name, etat: state }) => [name, state]),
      [
        ["box", "attendu"],
        ["macbook", "attendu"],
      ],
    );
    assert.equal(before.recommandee, "g1");
    assert.deepEqual(Object.keys(before.avertissements), ["g2"]);
    // Ce que l'écran de confiance propose : chaque station lisible, et le calibrage de parade, confié à l'instant.
    assert.deepEqual(Object.keys(before.machines), ["g1", "g2"]);
    assert.deepEqual(before.calibrage, { manager: INPUT.manager, reviewer: INPUT.reviewer, dit: "what parade runs on, your project most recently given to a station" });

    const pages = ["https://github.com/apps/brigade-cook/installations/new"];
    follow("g1", [{ nom: "parade", etat: "a-autoriser", dit: "authorize brigade on benomite/parade, on GitHub: one click per page", autoriser: [...pages, "https://ailleurs.example/piege"], serviLe: null }]);
    follow("g2", [{ nom: "parade", etat: "secondaire", dit: "not its main station: it runs neither its manager nor its pass", autoriser: [], serviLe: null }]);
    const aAllow = await projects.relire();
    assert.deepEqual(aAllow.projets[0]?.stations[0]?.autoriser, pages);
    assert.deepEqual(projects.pages(), pages);
    assert.equal(aAllow.projets[0]?.servi, null);

    follow("g1", [{ nom: "parade", etat: "servi", dit: "served by box", autoriser: [], serviLe: "2026-10-15T12:03:05.000Z" }]);
    const served = await projects.relire();
    assert.equal(served.projets[0]?.stations[0]?.etat, "servi");
    assert.equal(served.projets[0]?.servi, "served by box 3 min 05 s after “add a project” was opened");
    assert.deepEqual(projects.pages(), []);

    // Un clone en échec (#1390) : la page GitHub de son geste s'ouvre, même sans onboarding publié ; une autre, jamais.
    const tokens = "https://github.com/settings/personal-access-tokens";
    const clone = { cause: "token-excludes-repository", raison: "The token used by box does not include benomite/parade.", geste: "Add benomite/parade to the repositories of the token used by box.", ou: "On GitHub.", liens: [tokens, "https://ailleurs.example/piege"], compte: "box", detail: "fatal: repository not found", reessaieToutesLes: 30 };
    follow("g1", [{ nom: "parade", etat: "refuse", dit: `${clone.raison} ${clone.geste}`, autoriser: [], serviLe: null, clone }]);
    const withoutCopy = await projects.relire();
    assert.deepEqual(withoutCopy.projets[0]?.clone?.liens, [tokens]);
    assert.deepEqual(projects.pages(), [tokens]);

    // Ses blocages (#1394, #1399) : chacun sous le projet, et la page de GitHub où le lever s'ouvre ; une autre, jamais.
    const settings = "https://github.com/benomite/parade/settings/access";
    const blockages = [
      { id: "access", message: "box cannot push to benomite/parade.", cause: "Its account only reads this repository.", link: settings },
      { id: "piege", message: "Something else blocks parade.", cause: "A page outside GitHub.", link: "https://ailleurs.example/piege" },
    ];
    follow("g1", [{ nom: "parade", etat: "en-preparation", dit: "", autoriser: [], serviLe: null, blocages: blockages }]);
    const blocked = await projects.relire();
    assert.deepEqual(blocked.projets[0]?.blocages?.map(({ id, link }) => [id, link]), [["access", settings], ["piege", undefined]]);
    assert.deepEqual(projects.pages(), [settings]);
    follow("g1", [{ nom: "parade", etat: "servi", dit: "served by box", autoriser: [], serviLe: "2026-10-15T12:03:05.000Z" }]);
    assert.equal((await projects.relire()).projets[0]?.blocages, undefined, "levés, ils quittent le projet");
  });

  test("l'onboarding que la principale publie se lit sous le projet (#1111), et ses pages de GitHub s'ouvrent ; celui d'une secondaire, jamais", { skip: WITHOUT_POSIX }, async (t) => {
    const { projets: projects, gist, repertoire: directory } = oneGitHub(t);
    await projects.ajouter(INPUT);
    const issue = "https://github.com/benomite/parade/issues/7";
    const pr = "https://github.com/benomite/parade/pull/8";
    const onboarding = {
      etat: "en-cours",
      termine: false,
      courante: "preparation",
      etapes: [
        { etape: "depot", titre: "Repository", etat: "faite", dit: "benomite/parade is authorized and cloned on box.", geste: null },
        { etape: "machine", titre: "Cooking machine", etat: "faite", dit: "box cooks parade.", geste: null },
        { etape: "preparation", titre: "Repository preparation", etat: "courante", dit: "The preparation PR awaits you: no other ticket leaves before its merge.", geste: { quoi: "Review and merge the preparation PR.", ou: "On GitHub.", liens: [pr, "https://ailleurs.example/piege"] } },
        { etape: "premier-ticket", titre: "First ticket", etat: "a-venir", dit: "Once benomite/parade is prepared, post your first ticket with the `fire` label.", geste: null },
      ],
      preparation: { ticket: 7, url: issue, etat: "a-relire", raison: null, prochainEssai: null, pr },
      sansBacASable: false,
    };
    // Ce que la station écrit (runtime/src/projets/demande.ts, `documentDeSuivi`) : l'onboarding à côté de la liste.
    const write = (id: string, content: object) => {
      const readOne = gist(id);
      readOne.files[FILE_TRACKING] = { filename: FILE_TRACKING, content: JSON.stringify({ brigade: "projets-suivi", format: 1, a: "2026-10-15T12:02:00Z", projets: [{ nom: "parade", etat: "servi", dit: "served", autoriser: [], serviLe: null }], ...content }) };
      writeFileSync(join(directory, `${id}.gist.json`), JSON.stringify(readOne));
    };
    write("g2", { onboarding: { parade: { ...onboarding, etat: "pret", termine: true } } });
    assert.equal((await projects.relire()).projets[0]?.onboarding, undefined, "une secondaire n'en dit rien qui compte");
    write("g1", { onboarding: { parade: onboarding } });
    const readOne = (await projects.relire()).projets[0]?.onboarding;
    assert.equal(readOne?.courante, "preparation");
    assert.deepEqual(readOne?.etapes.map(({ etat: state }) => state), ["faite", "faite", "courante", "a-venir"]);
    assert.deepEqual(readOne?.etapes[2]?.geste, { quoi: "Review and merge the preparation PR.", ou: "On GitHub.", liens: [pr] });
    assert.deepEqual(readOne?.preparation, { ticket: 7, url: issue, etat: "a-relire", raison: null, prochainEssai: null, pr });
    assert.deepEqual(projects.pages().sort(), [issue, pr].sort());
  });

  test("retiré : le projet quitte la demande de chacune de ses stations, les autres projets restent", { skip: WITHOUT_POSIX }, async (t) => {
    const { projets: projects, demande: request } = oneGitHub(t);
    await projects.ajouter(INPUT);
    await projects.ajouter({ ...INPUT, depot: "benomite/espace", stations: ["g1"] });
    assert.deepEqual(await projects.retirer("parade"), { retire: "parade" });
    assert.deepEqual(
      request("g1")?.map(({ nom: name }) => name),
      ["espace"],
    );
    assert.deepEqual(request("g2"), []);
    assert.deepEqual(await projects.retirer("parade"), { refus: "parade is on none of your stations" });
  });

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

  test("confier un projet à sa première station : elle en devient la principale, avec le plafond et le calibrage choisis", { skip: WITHOUT_POSIX }, async (t) => {
    const { projets: projects, demande: request } = oneGitHub(t, [BOX, MAC]);
    assert.deepEqual(await projects.confier(TRUST), { ajoute: "parade" });
    assert.deepEqual(request("g1"), [{ ...EXPECTED, principale: true }]);
    assert.equal(request("g2"), undefined);
  });

  test("le nom est celui du projet dans l'app, pas celui que son dépôt donnerait", { skip: WITHOUT_POSIX }, async (t) => {
    const { projets: projects, demande: request } = oneGitHub(t, [BOX]);
    assert.deepEqual(await projects.confier({ ...TRUST, nom: "mon-parade" }), { ajoute: "mon-parade" });
    assert.equal(request("g1")?.[0]?.nom, "mon-parade");
    assert.deepEqual(refusalOfTrust(readTrust({ ...TRUST, nom: "Mon Parade" }), [BOX], { portee: [], suivi: false }).nom, "“Mon Parade” cannot be a project's name on a station: lowercase letters, digits and dashes.");
  });

  test("une station de plus reprend ce que l'app a déjà demandé, sans principale : ni plafond ni calibrage à redire, et celle d'avant ne bouge pas", { skip: WITHOUT_POSIX }, async (t) => {
    const { projets: projects, demande: request } = oneGitHub(t, [BOX, MAC]);
    await projects.confier(TRUST);
    const before = request("g1");
    const addition = { nom: "parade", depot: "benomite/parade", base: "main", stations: ["g2"], cooks: "", manager: { modele: "", effort: "" }, reviewer: { modele: "", effort: "" }, ouvertLe: OPEN };
    assert.deepEqual(await projects.confier(addition), { ajoute: "parade" });
    assert.deepEqual(request("g2"), [{ ...EXPECTED, principale: false }]);
    assert.deepEqual(request("g1"), before);
  });

  test("une station qui porte déjà le projet ne se choisit pas une seconde fois, et un projet qui a sa principale n'en prend pas d'autre", { skip: WITHOUT_POSIX }, async (t) => {
    const { projets: projects, demande: request } = oneGitHub(t, [BOX, MAC]);
    await projects.confier(TRUST);
    assert.deepEqual(await projects.confier({ ...TRUST, stations: ["g1", "g2"] }), {
      signales: {
        stations: "box already cooks it: choose another station.",
      },
    });
    assert.equal(request("g2"), undefined);
  });

  test("un projet qu'une station sert sans l'app a déjà sa principale : une station de plus est secondaire, et dit son plafond et son calibrage", { skip: WITHOUT_POSIX }, async (t) => {
    const SERVES: StationVue = { ...BOX, projets: ["parade"] };
    const { projets: projects, demande: request } = oneGitHub(t, [SERVES, MAC]);
    const addition = { ...TRUST, stations: ["g2"] };
    assert.deepEqual(await projects.confier({ ...addition, cooks: "" }), { signales: { cooks: "box does not say how many cooks it may run at once for parade: give the cook cap." }, manque: ["cooks"] });
    assert.deepEqual(await projects.confier({ ...addition, stations: ["g1"] }), { signales: { stations: "box already cooks it: choose another station." } });
    assert.deepEqual(await projects.confier(addition), { ajoute: "parade" });
    assert.deepEqual(request("g2"), [{ ...EXPECTED, principale: false }]);
    assert.equal(request("g1"), undefined);
  });

  const WITHOUT_NOTHING = { nom: "parade", depot: "", base: "", stations: ["g2"], cooks: "", manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: OPEN };
  const SERVED = { nom: "parade", etat: "servi", dit: "", autoriser: [], serviLe: "2026-10-15T11:30:00Z" };

  test("une station de plus d'un projet que la première sert sans l'app reprend son dépôt, sa branche et son plafond : le chef n'en dit aucun", { skip: WITHOUT_POSIX }, async (t) => {
    const { projets: projects, demande: request, suivre: follow } = oneGitHub(t, [{ ...BOX, projets: ["parade"] }, MAC]);
    follow("g1", [{ ...SERVED, depot: "benomite/parade", base: "v2", cooks: 3 }]);
    assert.deepEqual(await projects.confier(WITHOUT_NOTHING), { ajoute: "parade" });
    const written = request("g2")?.[0];
    assert.deepEqual([written?.depot, written?.base, written?.cooks, written?.principale], ["benomite/parade", "v2", 3, false]);
    assert.equal(request("g1"), undefined);
  });

  test("ce que la première station sert l'emporte sur le dépôt et la branche que la saisie dit ; les cooks sont ceux de la machine ajoutée", { skip: WITHOUT_POSIX }, async (t) => {
    const { projets: projects, demande: request, suivre: follow } = oneGitHub(t, [{ ...BOX, projets: ["parade"] }, MAC]);
    follow("g1", [{ ...SERVED, depot: "benomite/parade", base: "v2", cooks: 3 }]);
    assert.deepEqual(await projects.confier({ ...WITHOUT_NOTHING, cooks: "trois" }), { signales: { cooks: "The number of cooks is a whole number, 1 or more." } });
    assert.deepEqual(await projects.confier({ ...WITHOUT_NOTHING, depot: "autre/depot", base: "main", cooks: "9" }), { ajoute: "parade" });
    const written = request("g2")?.[0];
    assert.deepEqual([written?.depot, written?.base, written?.cooks], ["benomite/parade", "v2", 9]);
  });

  test("une valeur que la première station ne dit pas est nommée, champ par champ, au lieu du refus générique", { skip: WITHOUT_POSIX }, async (t) => {
    const { projets: projects, demande: request, suivre: follow } = oneGitHub(t, [{ ...BOX, projets: ["parade"] }, MAC]);
    follow("g1", [{ ...SERVED, base: "v2", cooks: 3 }]);
    const without = await projects.confier(WITHOUT_NOTHING);
    assert.deepEqual(without, { signales: { depot: "box does not say which GitHub repository it serves for parade, and neither does its folder on this computer." }, manque: ["depot"] });
    follow("g1", [{ ...SERVED, depot: "benomite/parade", cooks: 3 }]);
    assert.deepEqual(await projects.confier(WITHOUT_NOTHING), { signales: { base: "box does not say which integration branch it delivers to for parade, and neither does its folder on this computer." }, manque: ["base"] });
    follow("g1", [{ ...SERVED, depot: "benomite/parade", base: "v2" }]);
    assert.deepEqual(await projects.confier(WITHOUT_NOTHING), { signales: { cooks: "box does not say how many cooks it may run at once for parade: give the cook cap." }, manque: ["cooks"] });
    assert.equal(request("g2"), undefined);
    // Donnée par le chef, la valeur manquante suffit.
    assert.deepEqual(await projects.confier({ ...WITHOUT_NOTHING, cooks: "2" }), { ajoute: "parade" });
    assert.equal(request("g2")?.[0]?.cooks, 2);
  });

  // Ajouter une station ne demande que ce qui est à sa machine (#1307) : le dépôt et la branche que la première ne dit
  // pas, le clone du projet sur cet ordinateur les dit — lu par `git`, comme le process principal le lit (addition.ts, #1306).
  test("une station de plus prend au clone du projet sur cet ordinateur le dépôt et la branche que la première ne dit pas", { skip: WITHOUT_POSIX }, async (t) => {
    const clone = mkdtempSync(join(tmpdir(), "brigade-app-clone-"));
    t.after(() => rmSync(clone, { recursive: true, force: true }));
    execFileSync("git", ["init", "--quiet", clone]);
    execFileSync("git", ["-C", clone, "remote", "add", "origin", "https://github.com/benomite/parade.git"]);
    // La branche que son origine désigne : `origin/v2`.
    execFileSync("git", ["-C", clone, "-c", "user.name=chef", "-c", "user.email=chef@example.com", "-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", "v2"]);
    execFileSync("git", ["-C", clone, "update-ref", "refs/remotes/origin/v2", "HEAD"]);
    execFileSync("git", ["-C", clone, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/v2"]);
    const readOnes: string[] = [];
    const { projets: projects, demande: request } = oneGitHub(t, [{ ...BOX, projets: ["parade"] }, MAC], {
      leClone: async (name) => {
        readOnes.push(name);
        const { depot: repository, base } = await readClone("git", clone);
        return { depot: repository ?? null, base: base ?? null };
      },
    });
    assert.deepEqual(await projects.confier({ ...WITHOUT_NOTHING, cooks: "4" }), { ajoute: "parade" });
    const written = request("g2")?.[0];
    assert.deepEqual([written?.depot, written?.base, written?.cooks, written?.principale], ["benomite/parade", "v2", 4, false]);
    assert.deepEqual(readOnes, ["parade"]);
    // Rien ne s'écrit dans le clone : il n'est que lu.
    assert.equal(execFileSync("git", ["-C", clone, "status", "--porcelain"], { encoding: "utf8" }), "");
  });

  test("ce que la première dit, ou ce que l'app a déjà demandé, dispense de lire le clone ; un clone illisible se tait", { skip: WITHOUT_POSIX }, async (t) => {
    const readOnes: string[] = [];
    const { projets: projects, suivre: follow } = oneGitHub(t, [{ ...BOX, projets: ["parade"] }, MAC], {
      leClone: async (name) => {
        readOnes.push(name);
        throw new Error("not a git repository");
      },
    });
    follow("g1", [{ ...SERVED, base: "v2", cooks: 3 }]);
    assert.deepEqual(await projects.confier(WITHOUT_NOTHING), { signales: { depot: "box does not say which GitHub repository it serves for parade, and neither does its folder on this computer." }, manque: ["depot"] });
    assert.deepEqual(readOnes, ["parade"]);
    follow("g1", [{ ...SERVED, depot: "benomite/parade", base: "v2", cooks: 3 }]);
    assert.deepEqual(await projects.confier(WITHOUT_NOTHING), { ajoute: "parade" });
    assert.deepEqual(readOnes, ["parade"]);
  });

  test("les capacités cochées partent dans la demande de la station ajoutée, et seulement la sienne ; une autre écriture les garde", { skip: WITHOUT_POSIX }, async (t) => {
    const { projets: projects, demande: request } = oneGitHub(t, [BOX, MAC]);
    await projects.confier(TRUST);
    const addition = { ...WITHOUT_NOTHING, depot: "benomite/parade", base: "main", cooks: "5", capacites: ["navigateur-headless", "android", "navigateur-headless", "pas une capacité", 7] };
    assert.deepEqual(await projects.confier(addition), { ajoute: "parade" });
    assert.deepEqual(request("g2")?.[0]?.fournit, ["navigateur-headless", "android"]);
    assert.equal(request("g2")?.[0]?.cooks, 5);
    assert.equal("fournit" in (request("g1")?.[0] ?? {}), false);
    // Un autre projet confié à la même station réécrit sa demande : ce que parade y déclare reste.
    assert.deepEqual(await projects.confier({ ...TRUST, nom: "cantine", depot: "benomite/cantine", stations: ["g2"] }), { ajoute: "cantine" });
    assert.deepEqual(request("g2")?.find(({ nom: name }) => name === "parade")?.fournit, ["navigateur-headless", "android"]);
  });

  test("ce que l'appairage d'un Mac dit qu'il fournit part dans sa demande quand il est ajouté au projet, avec ce que le chef a coché (#1757)", { skip: WITHOUT_POSIX }, async (t) => {
    const { projets: projects, demande: request } = oneGitHub(t, [BOX, { ...MAC, fournit: ["macos", "docker"] }]);
    await projects.confier(TRUST);
    assert.equal("fournit" in (request("g1")?.[0] ?? {}), false, "la box n'en dit rien : sa demande non plus");
    assert.deepEqual(await projects.confier({ ...WITHOUT_NOTHING, depot: "benomite/parade", base: "main", cooks: "3", capacites: ["navigateur-headless", "docker"] }), { ajoute: "parade" });
    const written = request("g2")?.[0];
    assert.deepEqual([written?.principale, written?.fournit], [false, ["navigateur-headless", "docker", "macos"]]);
  });

  test("un Mac ajouté avant que son appairage ne dise ce qu'il fournit : sa demande le reprend à la lecture suivante, sans geste du chef (#1757)", { skip: WITHOUT_POSIX }, async (t) => {
    const mac: StationVue = { ...MAC };
    const { projets: projects, demande: request } = oneGitHub(t, [BOX, mac]);
    await projects.confier(TRUST);
    await projects.confier({ ...WITHOUT_NOTHING, depot: "benomite/parade", base: "main", cooks: "3", capacites: ["docker"] });
    assert.deepEqual(request("g2")?.[0]?.fournit, ["docker"]);
    await projects.relire();
    assert.deepEqual(request("g2")?.[0]?.fournit, ["docker"], "rien à reprendre : rien n'est réécrit");
    mac.fournit = ["macos"];
    await projects.relire();
    // La reprise passe à la suite des gestes du chef : un retrait qui ne trouve rien la suit, et n'écrit rien.
    assert.deepEqual(await projects.retirer("absent"), { refus: "absent is on none of your stations" });
    assert.deepEqual(request("g2")?.[0]?.fournit, ["docker", "macos"]);
    assert.equal("fournit" in (request("g1")?.[0] ?? {}), false);
  });

  test("rien de choisi, rien d'écrit ; GitHub muet, le refus le dit en une ligne", { skip: WITHOUT_POSIX }, async (t) => {
    const { projets: projects, demande: request, panne: outage } = oneGitHub(t, [BOX]);
    assert.deepEqual(await projects.confier({ ...TRUST, stations: [] }), {
      signales: { stations: "Choose at least one station to cook parade." },
    });
    assert.equal(request("g1"), undefined);
    outage();
    const refuses = await projects.confier(TRUST);
    assert.ok("refus" in refuses && /^parade was not entrusted to a station: GitHub could not be read — error connecting to api\.github\.com$/.test(refuses.refus), JSON.stringify(refuses));
  });
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
