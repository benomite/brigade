// Ce qui manque à la station pour les tests d'un projet, sur sa page (#1400, épique 1393) : une carte par besoin
// que sa principale publie en attente — ce qui manque, pourquoi, et ses quatre issues, chacune un bouton avec ce qui
// en suit sous lui. Un clic écrit l'issue dans la demande de la principale, que la station relit (#1398) ; la carte
// part. Les choix sont écrits par le runtime lui-même (runtime/src/installation/besoins/), relus par `lireSuivi`
// comme l'app relit le suivi d'une station ; la demande écrite est relue par le runtime ; la vue est jouée contre
// le faux pont (helpers/false-vue.ts), l'écriture contre un faux GitHub qui tient les gists en mémoire.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Home } from "../../../src/home.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { BANNER } from "../../../src/facts.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import type { Outage } from "../../../src/outages/outages.ts";
import { type Choice, documentOfRequest, FILE_PROJECTS, FILE_TRACKING, readRequest, readTracking, type ProjectRequest } from "../../../src/projects/request.ts";
import { calibrationRecommended, type Chosen, EFFORTS, machineProposed, MODELS, type ProjectSeen, holdProjects, type SeenOfProjects } from "../../../src/projects/projects.ts";
import type { Files } from "../../../src/stations/github.ts";
import type { StationVue, SeenOfStations } from "../../../src/stations/stations.ts";
import { choiceQueued, IN_PROGRESS, setChoice, RECOMMENDED, withoutTheChoice, titleOfChoice } from "../../../src/vue/project/choice.js";
import { ACTION_OF_CHOICE as ACTION_DU_CHOIX, CHOICES_OF_NEEDS } from "../../helpers/choices-of-needs.ts";
import { Fake, playTheVue, repos } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

// Tels que le runtime les écrit : un Postgres et Docker qui manquent à la box, en attente du chef.
const queued = (id: keyof typeof CHOICES_OF_NEEDS) => ({ ...CHOICES_OF_NEEDS[id], status: "pending" as const });
const POSTGRES = queued("postgres");
const DOCKER = queued("docker");
// Le blocage qui attend chacun, sous la même clé, et un autre blocage, sans choix.
const blockageOf = ({ id, message, cause }: typeof POSTGRES) => ({ id, message, cause, action: ACTION_DU_CHOIX });
const CLONE = { id: "clone", message: "box cannot clone benomite/parade.", cause: "The token does not cover benomite/parade.", link: "https://github.com/settings/personal-access-tokens" };

// Ce que l'app relit du suivi d'une station qui les publie.
const rereadOnes = (choice: object[] | undefined, blockages: object[] = []) => readTracking(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", ...(choice === undefined ? {} : { choix: choice }), ...(blockages.length === 0 ? {} : { blocages: blockages }) }] }))[0];
const choiceReread = (choice: object[] | undefined): Choice[] => rereadOnes(choice)?.choix ?? [];

const cards = (or: Fake) => or.dessous("section").filter((s) => s.className === "choix");
const buttons = (or: Fake) => or.dessous("button").filter((b) => b.className !== "aide");
const textOf = (or: Fake, classe: string) => or.dessous("p").find((p) => p.className === classe)?.textContent;
const set = (readOne: Parameters<typeof setChoice>[1]): Fake => setChoice(doc, readOne) ?? assert.fail("aucune section");

describe("les cartes, posées par le module", () => {
  test("un choix de base de données en attente : une carte, le besoin nommé, quatre issues et ce qui suit de chacune sous elle", () => {
    const pose = set({ projet: "parade", choix: choiceReread([POSTGRES]) });
    assert.equal(pose.dessous("h3")[0]?.textContent, titleOfChoice("parade", 1));
    assert.equal(titleOfChoice("parade", 1), "One choice waits for you on parade");
    const [card, ...others] = cards(pose);
    assert.equal(others.length, 0);
    assert.ok(card !== undefined);
    assert.equal(card.dataset.choix, "need:postgres");
    assert.equal(card.dessous("h4")[0]?.textContent, "The tests of parade need a Postgres database, which box does not have.");
    assert.equal(textOf(card, "cause"), POSTGRES.cause);
    const issues = card.dessous("li").filter((li) => li.className === "issue");
    assert.deepEqual(
      issues.map((li) => [li.dataset.issue, li.children[0]?.balise, li.children[0]?.textContent, li.children[1]?.className]),
      [
        ["cook-elsewhere", "button", "Cook it on a station that has it", "consequence"],
        ["provide-here", "button", "Provide it on box", "consequence"],
        ["adapt-tests", "button", "Adapt the tests", "consequence"],
        ["setup-brings-it", "button", "The project's setup brings it itself", "consequence"],
      ],
    );
    assert.deepEqual(
      issues.map((li) => li.children[1]?.textContent),
      POSTGRES.options.map(({ consequence }) => consequence),
    );
    assert.match(issues[1]?.children[1]?.textContent ?? "", /PostgreSQL server .* is installed on box/);
  });

  test("un clic sur une issue la donne, avec la clé de son choix", () => {
    const chosen: string[][] = [];
    const pose = set({ projet: "parade", choix: choiceReread([POSTGRES]), choisir: (id, issue) => chosen.push([id, issue]) });
    buttons(pose).find((b) => b.textContent === "Adapt the tests")?.click();
    assert.deepEqual(chosen, [["need:postgres", "adapt-tests"]]);
  });

  test("l'issue côté projet porte « recommended » quand la station la recommande, et seulement alors", () => {
    const recommended = (choice: typeof POSTGRES) => ({ ...choice, options: choice.options.map((o) => (o.id === "setup-brings-it" ? { ...o, recommended: true as const } : o)) });
    const marks = (pose: Fake) => pose.dessous("span").filter((s) => s.className === "marque-recommande");
    const withIt = set({ projet: "parade", choix: choiceReread([recommended(POSTGRES)]) });
    assert.deepEqual(marks(withIt).map((m) => m.textContent), [RECOMMENDED]);
    assert.deepEqual(buttons(withIt).filter((b) => b.className === "recommande").map((b) => b.textContent), ["The project's setup brings it itself"]);
    const without = set({ projet: "parade", choix: choiceReread([POSTGRES]) });
    assert.equal(marks(without).length, 0);
    assert.equal(buttons(without).filter((b) => b.className === "recommande").length, 0);
  });

  test("un clic sur l'issue côté projet donne « setup-brings-it » avec la clé du choix ; la carte du navigateur garde ses issues", () => {
    const chosen: string[][] = [];
    const browser = queued("browser");
    const pose = set({ projet: "parade", choix: choiceReread([browser]), choisir: (id, issue) => chosen.push([id, issue]) });
    assert.deepEqual(buttons(pose).map((b) => b.textContent).slice(0, 3), ["Cook it on a station that has it", "Provide it on box", "Adapt the tests"]);
    buttons(pose).find((b) => b.textContent === "The project's setup brings it itself")?.click();
    assert.deepEqual(chosen, [["need:browser", "setup-brings-it"]]);
  });

  test("deux besoins qui manquent : deux cartes, pas une liste fondue", () => {
    const pose = set({ projet: "parade", choix: choiceReread([POSTGRES, DOCKER]) });
    assert.equal(pose.dessous("h3")[0]?.textContent, "2 choices wait for you on parade");
    assert.deepEqual(cards(pose).map((c) => c.dataset.choix), ["need:postgres", "need:docker"]);
    for (const card of cards(pose)) assert.equal(buttons(card).length, 4);
  });

  test("aucun choix en attente : aucune section — un choix tranché, ou dont l'app a déjà écrit l'issue, n'en a pas", () => {
    assert.equal(setChoice(doc, { projet: "parade", choix: [] }), null);
    const slice = choiceReread([{ ...POSTGRES, status: "chosen", selected: "provide-here", selectedAt: "2026-10-22T12:00:00.000Z" }]);
    assert.equal(slice[0]?.status, "chosen", "relu tel quel");
    assert.equal(setChoice(doc, { projet: "parade", choix: slice }), null);
    assert.equal(setChoice(doc, { projet: "parade", choix: choiceReread([POSTGRES]), choisis: { "need:postgres": "provide-here" } }), null);
    assert.equal(setChoice(doc, { projet: "parade", choix: choiceReread([POSTGRES]), retenus: new Set(["need:postgres"]) }), null);
    // Une issue écrite que la station n'offre pas ne tranche rien : la carte reste.
    assert.equal(choiceQueued(choiceReread([POSTGRES]), { "need:postgres": "pray" }).length, 1);
  });

  test("pendant l'écriture, ses boutons attendent et une ligne le dit ; refusée, une ligne dit pourquoi, le détail au survol", () => {
    const busy = set({ projet: "parade", choix: choiceReread([POSTGRES]), enCours: new Set(["need:postgres"]) });
    assert.ok(buttons(busy).every((b) => b.disabled === true));
    assert.equal(textOf(busy, "etat-du-choix"), IN_PROGRESS);
    const refused = set({ projet: "parade", choix: choiceReread([POSTGRES]), refus: new Map([["need:postgres", { refus: "the choice could not be recorded: GitHub could not be read or written", detail: "HTTP 502" }]]) });
    assert.ok(buttons(refused).every((b) => b.disabled !== true));
    const line = refused.dessous("p").find((p) => p.className === "refus-du-choix") ?? assert.fail("pas de ligne de refus");
    assert.equal(line.dessous("span")[0]?.textContent, "the choice could not be recorded: GitHub could not be read or written");
    assert.equal(refused.dessous("button").find((b) => b.className === "aide")?.ariaLabel, "HTTP 502");
  });

  test("le blocage d'un besoin qui a sa carte ne se répète pas en ligne ; les autres restent", () => {
    const blockages = rereadOnes([POSTGRES], [blockageOf(POSTGRES), CLONE])?.blocages ?? [];
    assert.equal(blockages.length, 2);
    assert.deepEqual(withoutTheChoice(blockages, choiceReread([POSTGRES])).map(({ id }) => id), ["clone"]);
    assert.deepEqual(withoutTheChoice(blockages, [], { "need:postgres": "provide-here" }).map(({ id }) => id), ["clone"], "écrit, son blocage attend que la station le lève");
  });
});

describe("le suivi relu par l'app", () => {
  test("chaque choix publié, tel quel ; un illisible, ou une issue illisible, n'est pas montré", () => {
    assert.deepEqual(choiceReread([POSTGRES, DOCKER]), [POSTGRES, DOCKER]);
    const withoutKey = { ...POSTGRES, id: "" };
    const withoutIssue = { ...DOCKER, options: [{ id: "x", label: "" }] };
    const unknown = { ...POSTGRES, id: "need:redis", status: "maybe" };
    const oneUnreadable = { ...POSTGRES, options: [...POSTGRES.options, { id: "y" }] };
    assert.deepEqual(choiceReread([withoutKey, withoutIssue, unknown, oneUnreadable]), [POSTGRES]);
    assert.equal(rereadOnes(undefined)?.choix, undefined, "rien ne manque, rien de publié");
  });
});

describe("l'issue retenue, écrite dans la demande de la principale", () => {
  const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: ["parade"], max: null };
  const MAC: StationVue = { ...BOX, id: "g2", nom: "macbook", machine: "macOS 25.0.0" };
  const request = (main: boolean): ProjectRequest => ({ nom: "parade", depot: "benomite/parade", base: "main", principale: main, cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: "2026-10-22T11:00:00.000Z" });

  // GitHub, ses gists en mémoire : la box est la principale de parade et publie ses choix, le Mac la seconde.
  function oneGitHub(choice: object[]) {
    const gists = new Map<string, Files>([
      ["g1", { [FILE_PROJECTS]: documentOfRequest([request(true)]), [FILE_TRACKING]: JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", choix: choice }] }) }],
      ["g2", { [FILE_PROJECTS]: documentOfRequest([request(false)]) }],
    ]);
    const writtenOnes: string[] = [];
    let outage = false;
    const projects = holdProjects({
      github: {
        lister: async () => [],
        lire: async (id) => gists.get(id) ?? null,
        ecrire: async (id, files) => {
          if (outage) throw new Error("HTTP 502");
          writtenOnes.push(id);
          gists.set(id, { ...gists.get(id), ...files });
        },
        supprimer: async () => {},
      },
      stations: () => [BOX, MAC],
      depots: async () => [],
      surLecture: () => {},
    });
    const rereadOne = (id: string) => readRequest(gists.get(id)?.[FILE_PROJECTS]);
    return { projets: projects, ecrits: writtenOnes, relue: rereadOne, gists, enPanne: () => (outage = true) };
  }

  test("l'issue part dans la demande de la principale seule, sous la clé du choix, telle que le runtime la lit ; la page la sait écrite", async () => {
    const { projets: projects, ecrits: writtenOnes, relue: rereadOne, gists } = oneGitHub([POSTGRES, DOCKER]);
    await projects.relire();
    assert.deepEqual(await projects.choisir("parade", "need:postgres", "provide-here"), { fait: "“Provide it on box” is recorded: box applies it at its next read" });
    assert.deepEqual(writtenOnes, ["g1"]);
    assert.deepEqual(rereadOne("g1")?.[0]?.choix, { "need:postgres": "provide-here" });
    assert.equal(rereadOne("g2")?.[0]?.choix, undefined);
    // The written document itself (the old runtime's `lireDemande`, deleted, used to read it back): well-formed JSON carrying the choice.
    const written = JSON.parse(gists.get("g1")?.[FILE_PROJECTS] ?? "null") as { projets?: Array<{ choix?: unknown }> } | null;
    assert.deepEqual(written?.projets?.[0]?.choix, { "need:postgres": "provide-here" });
    // Relue, la page sait l'issue écrite : la carte du Postgres ne revient pas, celle de Docker reste.
    const seenOne = projects.vu()?.projets[0];
    assert.deepEqual(seenOne?.choisis, { "need:postgres": "provide-here" });
    assert.deepEqual(choiceQueued(seenOne?.choix ?? [], seenOne?.choisis).map(({ id }) => id), ["need:docker"]);
    // Une seconde issue s'ajoute à la première, que tout autre geste réécrit telle quelle.
    await projects.choisir("parade", "need:docker", "adapt-tests");
    assert.deepEqual(rereadOne("g1")?.[0]?.choix, { "need:postgres": "provide-here", "need:docker": "adapt-tests" });
  });

  test("un choix que la page ne montre plus en attente, ou une issue qu'il n'offre pas : rien ne s'écrit ; GitHub muet, le refus le dit", async () => {
    const { projets: projects, ecrits: writtenOnes, enPanne: inOutage } = oneGitHub([POSTGRES, { ...DOCKER, status: "chosen", selected: "adapt-tests", selectedAt: "2026-10-22T11:30:00.000Z" }]);
    await projects.relire();
    assert.deepEqual(await projects.choisir("parade", "need:docker", "provide-here"), { refus: "box no longer waits for this choice: nothing was recorded" });
    assert.deepEqual(await projects.choisir("parade", "need:redis", "provide-here"), { refus: "box no longer waits for this choice: nothing was recorded" });
    assert.deepEqual(await projects.choisir("parade", "need:postgres", "pray"), { refus: "box no longer offers this option: nothing was recorded" });
    assert.deepEqual(await projects.choisir("cantine", "need:postgres", "provide-here"), { refus: "cantine cooks on none of your stations: nothing was recorded" });
    assert.deepEqual(writtenOnes, []);
    inOutage();
    assert.deepEqual(await projects.choisir("parade", "need:postgres", "provide-here"), { refus: "the choice could not be recorded: GitHub could not be read or written", detail: "HTTP 502" });
  });
});

describe("sur la page du projet", () => {
  const A = "2026-10-22T12:00:00.000Z";
  const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
  const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

  const vue = (choice: object[] | undefined, blockages: object[] = [], chosen?: Record<string, string>): SeenOfProjects => {
    const readOne = rereadOnes(choice, blockages);
    const project: ProjectSeen = {
      nom: "parade",
      depot: "benomite/parade",
      base: "main",
      suiviPar: { id: "g1", nom: "box" }, stations: [{ id: "g1", nom: "box", etat: "servi", dit: "", autoriser: [] }],
      servi: null,
      cuitSur: { id: "g1", nom: "box", ici: false },
      ...(readOne?.choix === undefined ? {} : { choix: readOne.choix }),
      ...(readOne?.blocages === undefined ? {} : { blocages: readOne.blocages }),
      ...(chosen === undefined ? {} : { choisis: chosen }),
    };
    return { a: A, projets: [project], recommandee: "g1", avertissements: {}, machines: { g1: machineProposed(BOX) }, calibrage: calibrationRecommended([]) };
  };
  const startup = (projectsOfStations: SeenOfProjects) => ({
    configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }),
    palette: PALETTE,
    exemple: EXAMPLE,
    onglets: TABS,
    rubriques: HEADINGS,
    gestes: {},
    banniere: BANNER,
    calibrage: { modeles: MODELS, efforts: EFFORTS },
    code: undefined,
    stations: { a: A, stations: [BOX] } satisfies SeenOfStations,
    accueil: HOME,
    projetsDesStations: projectsOfStations,
  });

  async function thePage(choice: object[] | undefined, blockages: object[] = [], chooseOneIssue: () => Chosen = () => ({ fait: "recorded" })) {
    const played = await playTheVue({ demarrage: () => startup(vue(choice, blockages)), espace: () => [], choisirUneIssue: chooseOneIssue });
    (played.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
    await repos();
    return { jouee: played, section: played.element("choix-du-projet"), blocages: played.element("blocages-du-projet") };
  }

  test("un choix en attente : sa carte ; le clic appelle le runtime avec le projet, le choix et l'issue — puis la carte n'est plus là", async () => {
    const { jouee: played, section } = await thePage([POSTGRES]);
    assert.equal(section.hidden, false);
    assert.equal(cards(section).length, 1);
    buttons(section).find((b) => b.textContent === "Provide it on box")?.click();
    await repos();
    assert.deepEqual(played.dernier("choisirUneIssue"), ["parade", "need:postgres", "provide-here"]);
    assert.equal(section.hidden, true);
    assert.equal(cards(section).length, 0);
    // La station ne l'a pas encore lue : relue en attente, la carte ne revient pas ; tranchée, rien non plus.
    played.dire("surProjetsDesStations", vue([POSTGRES], [], { "need:postgres": "provide-here" }));
    await repos();
    assert.equal(cards(section).length, 0);
    played.dire("surProjetsDesStations", vue([{ ...POSTGRES, status: "chosen", selected: "provide-here", selectedAt: A }]));
    await repos();
    assert.equal(section.hidden, true);
  });

  test("deux besoins : deux cartes ; l'une tranchée, l'autre reste", async () => {
    const { section } = await thePage([POSTGRES, DOCKER]);
    assert.deepEqual(cards(section).map((c) => c.dataset.choix), ["need:postgres", "need:docker"]);
    const docker = cards(section)[1] ?? assert.fail();
    buttons(docker).find((b) => b.textContent === "Adapt the tests")?.click();
    await repos();
    assert.deepEqual(cards(section).map((c) => c.dataset.choix), ["need:postgres"]);
  });

  test("une issue refusée : la carte reste, une ligne dit pourquoi", async () => {
    const { section } = await thePage([POSTGRES], [], () => ({ refus: "box no longer offers this option: nothing was recorded" }));
    buttons(section).find((b) => b.textContent === "Provide it on box")?.click();
    await repos();
    assert.equal(cards(section).length, 1);
    assert.equal(textOf(section, "refus-du-choix"), "box no longer offers this option: nothing was recorded");
  });

  test("la carte prend la place du blocage qui l'attend ; les autres blocages restent en lignes", async () => {
    const { section, blocages: blockages } = await thePage([POSTGRES], [blockageOf(POSTGRES), CLONE]);
    assert.equal(cards(section).length, 1);
    assert.deepEqual(
      blockages.dessous("li").filter((li) => li.className === "blocage").map((li) => li.dataset.blocage),
      ["clone"],
    );
  });

  test("aucun choix en attente : aucune carte", async () => {
    const { section, blocages: blockages } = await thePage(undefined);
    assert.equal(section.hidden, true);
    assert.equal(section.children.length, 0);
    assert.equal(blockages.hidden, true);
  });
});
