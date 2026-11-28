// Ce qui bloque un projet, sur sa page (#1399, épique 1393) : chaque blocage que sa principale publie (#1394) en
// une ligne — ce qui est bloqué en une phrase, et pourquoi ; le geste en bouton quand l'app sait le faire, la page
// de GitHub où le faire en lien qui la nomme ; ce qu'une commande a dit, replié derrière « details », jamais en
// message. Aucun blocage, aucune section. Les blocages sont écrits dans la forme même du runtime
// (runtime/src/installation/blocages/), assainis par lui, et relus par `lireSuivi` comme l'app relit le suivi
// d'une station ; la vue est jouée contre le faux pont (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Home } from "../../../src/home.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE, type Project } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { BANNER } from "../../../src/facts.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import type { Outage } from "../../../src/outages/outages.ts";
import { type Blockage, readTracking } from "../../../src/projects/request.ts";
import { calibrationRecommended, EFFORTS, machineProposed, MODELS, type ProjectSeen, type SeenOfProjects } from "../../../src/projects/projects.ts";
import type { SeenOfStations } from "../../../src/stations/stations.ts";
import { HELP_OF_SETUP, DETAILS, placeOf, setBlockages, WITHOUT_ACTION, titleOfBlockages } from "../../../src/vue/project/blockages.js";
import { Fake, playTheVue, repos } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const TOKENS = "https://github.com/settings/personal-access-tokens";
const OUTPUT = "GraphQL: Could not resolve to a Repository with the name 'benomite/parade'.\nfailed to run git: exit status 128";

// A blockage as the station writes it (formerly runtime/src/installation/blocages/blocages.ts, `blocage`): the
// sanitising is replayed here for what these tests feed it, a raw command output given as message or cause
// being replaced by the station's fallback sentences and kept in `detail`.
const FALLBACK_MESSAGE = "Something blocks this project, and the station could not say it in one sentence: the details hold what it saw.";
const FALLBACK_CAUSE = "The station did not recognise what went wrong.";
const isRawOutput = (text: string) => /[\r\n]|\bexit (?:status|code) -?\d+|^\s*(?:fatal|error)\s*:/i.test(text);
function ofRuntime(entry: { id: string; message: string; cause: string; action?: string; link?: string; detail?: string }): Blockage {
  const rawMessage = isRawOutput(entry.message);
  const rawCause = isRawOutput(entry.cause);
  const detail = [rawMessage ? entry.message : null, rawCause ? entry.cause : null, entry.detail ?? null].filter((part): part is string => part !== null).join("\n\n");
  return {
    id: entry.id,
    message: rawMessage ? FALLBACK_MESSAGE : entry.message,
    cause: rawCause ? FALLBACK_CAUSE : entry.cause,
    ...(entry.action === undefined ? {} : { action: entry.action }),
    ...(entry.link === undefined ? {} : { link: entry.link }),
    ...(detail === "" ? {} : { detail }),
  };
}

// Tels que le runtime les écrit : l'un avec la page où le lever, l'autre avec le geste de l'app ; et un troisième
// dont le producteur n'a donné que la sortie de git pour message — le runtime l'a assaini.
const TOKEN = ofRuntime({ id: "clone", message: "box cannot clone benomite/parade: the GitHub account brigade-cook does not see this repository.", cause: "A fine-grained token only covers the repositories chosen for it.", link: TOKENS, detail: OUTPUT });
const POSTGRES = ofRuntime({ id: "need:postgres", message: "The tests of parade need a Postgres that box does not have.", cause: "The worktree setup runs psql against a local database.", action: "choose-station" });
const RAW = ofRuntime({ id: "setup", message: "fatal: could not read Username for 'https://github.com'", cause: "exit status 128" });

// Ce que l'app relit du suivi d'une station qui les publie.
const rereadOnes = (blockages: object[] | undefined): Blockage[] => readTracking(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "en-preparation", ...(blockages === undefined ? {} : { blocages: blockages }) }] }))[0]?.blocages ?? [];

const visible = (or: Fake, element: Fake) => {
  for (let pose: Fake | null = element; pose !== null && pose !== or; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const lines = (or: Fake) => or.dessous("li").filter((li) => li.className === "blocage" && visible(or, li));
const textOf = (or: Fake, classe: string) => or.dessous("p").find((p) => p.className === classe)?.textContent;
const opened = (details: Fake) => Reflect.get(details, "open") === true;
// La section que le module pose — il rend ce que la fabrique crée : ici, des faux.
const set = (readOne: Parameters<typeof setBlockages>[1]): Fake => setBlockages(doc, readOne) ?? assert.fail("aucune section");

describe("la section, posée par le module", () => {
  test("deux blocages : deux lignes, chacune sa phrase et sa cause, sous la phrase qui dit combien le bloquent", () => {
    const pose = set({ projet: "parade", blocages: rereadOnes([TOKEN, POSTGRES]) });
    assert.equal(pose.dessous("h3")[0]?.textContent, "2 things block parade");
    assert.equal(lines(pose).length, 2);
    const [first = assert.fail(), second = assert.fail()] = lines(pose);
    assert.equal(textOf(first, "message"), TOKEN.message);
    assert.equal(textOf(first, "cause"), TOKEN.cause);
    assert.equal(textOf(second, "message"), POSTGRES.message);
    assert.equal(textOf(second, "cause"), POSTGRES.cause);
    assert.equal(titleOfBlockages("parade", 1), "One thing blocks parade");
  });

  test("un blocage dont l'app sait le geste : un bouton, recommandé, qui le fait", () => {
    const facts: string[] = [];
    const pose = set({ projet: "parade", blocages: rereadOnes([POSTGRES]), gestes: { "choose-station": { libelle: "choose another station", faire: () => facts.push("choisir") } } });
    const [button, ...others] = pose.dessous("button").filter((b) => b.className !== "aide");
    assert.equal(others.length, 0);
    assert.equal(button?.textContent, "choose another station");
    assert.equal(button?.className, "recommande");
    button?.click();
    assert.deepEqual(facts, ["choisir"]);
    assert.equal(pose.dessous("a").length, 0, "sans lien publié, aucun lien");
  });

  test("un geste que l'app ne connaît pas : pas de bouton qui ne ferait rien — une ligne le dit, l'identifiant au survol", () => {
    const pose = set({ projet: "parade", blocages: rereadOnes([POSTGRES]) });
    assert.equal(pose.dessous("button").filter((b) => b.className !== "aide").length, 0);
    assert.ok(pose.dessous("span").some((s) => s.className === "sans-geste" && s.textContent === WITHOUT_ACTION));
    assert.match(pose.dessous("button").find((b) => b.className === "aide")?.ariaLabel ?? "", /“choose-station”/);
  });

  test("un blocage avec un lien : un lien qui nomme la page exacte et l'ouvre, sans naviguer dans l'app", () => {
    const openOnes: string[] = [];
    const pose = set({ projet: "parade", blocages: rereadOnes([TOKEN]), ouvrir: (url) => openOnes.push(url) });
    const [link, ...others] = pose.dessous("a");
    assert.equal(others.length, 0);
    assert.equal(link?.textContent, "open github.com/settings/personal-access-tokens");
    assert.equal(Reflect.get(link ?? assert.fail(), "href"), TOKENS);
    let prevents = false;
    link.declencher("click", { preventDefault: () => (prevents = true) });
    assert.ok(prevents, "le clic ne navigue pas dans la fenêtre de l'app");
    assert.deepEqual(openOnes, [TOKENS]);
    assert.equal(placeOf("https://github.com/organizations/BOBL-tech/settings/installations/?tab=all"), "github.com/organizations/BOBL-tech/settings/installations");
  });

  test("l'échec du setup, qu'aucun besoin connu n'explique, dit en une seule ligne ce que le chef peut faire — les autres blocages non", () => {
    const pose = set({ projet: "parade", blocages: rereadOnes([TOKEN, RAW]) });
    const [token, raw] = lines(pose);
    assert.match(textOf(raw ?? assert.fail(), "message") ?? "", /^Something blocks this project/);
    assert.match(raw?.dessous("pre")[0]?.textContent ?? "", /fatal: could not read Username/);
    assert.deepEqual((raw?.dessous("p") ?? []).filter((p) => p.className === "aide-du-blocage").map((p) => p.textContent), [HELP_OF_SETUP]);
    assert.equal(HELP_OF_SETUP, "You can open the details, or ask the second.");
    assert.equal((token?.dessous("p") ?? []).filter((p) => p.className === "aide-du-blocage").length, 0);
  });

  test("le détail brut est replié derrière « details », jamais le message — un message brut a été assaini par le runtime", () => {
    const pose = set({ projet: "parade", blocages: rereadOnes([TOKEN, RAW]) });
    const [token, raw] = lines(pose);
    for (const line of [token, raw]) {
      const details = line?.dessous("details")[0] ?? assert.fail("pas de détail replié");
      assert.equal(opened(details), false, "replié par défaut");
      assert.equal(details.dessous("summary")[0]?.textContent, DETAILS);
      const message = textOf(line ?? assert.fail(), "message") ?? "";
      assert.doesNotMatch(message, /exit status|fatal:|GraphQL/);
      assert.ok(!details.dessous("pre")[0]?.textContent.includes(message) || message === "", "le message n'est pas la sortie");
    }
    assert.equal(token?.dessous("pre")[0]?.textContent, OUTPUT);
    assert.match(raw?.dessous("pre")[0]?.textContent ?? "", /fatal: could not read Username/);
  });

  test("déplié par le chef, le détail le reste d'une pose à l'autre ; replié, il se replie", () => {
    const unfoldedOnes = new Set<string>();
    const unfold = (id: string, wanted: boolean) => void (wanted ? unfoldedOnes.add(id) : unfoldedOnes.delete(id));
    const first = set({ projet: "parade", blocages: rereadOnes([TOKEN]), deplies: unfoldedOnes, deplier: unfold });
    const details = first.dessous("details")[0] ?? assert.fail();
    Reflect.set(details, "open", true);
    details.declencher("toggle");
    assert.deepEqual([...unfoldedOnes], ["clone"]);
    const second = set({ projet: "parade", blocages: rereadOnes([TOKEN]), deplies: unfoldedOnes, deplier: unfold });
    assert.equal(opened(second.dessous("details")[0] ?? assert.fail()), true);
  });

  test("une phrase donnée pour message et cause ne se dit qu'une fois", () => {
    const same = ofRuntime({ id: "clone", message: "box cannot clone benomite/parade.", cause: "box cannot clone benomite/parade." });
    const pose = set({ projet: "parade", blocages: rereadOnes([same]) });
    assert.equal(pose.dessous("p").filter((p) => p.textContent === same.message).length, 1);
  });

  test("aucun blocage : aucune section", () => {
    assert.equal(setBlockages(doc, { projet: "parade", blocages: [] }), null);
  });
});

describe("le suivi relu par l'app", () => {
  test("chaque blocage publié, avec ce qu'il porte ; un illisible n'est pas montré ; une page hors de GitHub n'est pas un lien", () => {
    assert.deepEqual(rereadOnes([TOKEN, POSTGRES]), [TOKEN, POSTGRES]);
    assert.deepEqual(rereadOnes([{ id: "x", message: "", cause: "why" }, { message: "No id.", cause: "why" }, { ...POSTGRES, link: "https://ailleurs.example/piege" }]), [POSTGRES]);
    assert.deepEqual(rereadOnes(undefined), []);
    assert.equal(readTracking(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi" }] }))[0]?.blocages, undefined, "rien de bloqué, rien de publié");
  });
});

describe("sur la page du projet", () => {
  const A = "2026-10-22T12:00:00.000Z";
  const BOX = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online · version 1.4.0 · no project", pannes: [] as Outage[], dit: "online", version: "1.4.0", projets: [] as string[], max: null } as const;
  const MAC = { ...BOX, id: "g2", nom: "macbook", machine: "macOS 25.0.0" } as const;
  const HOME: Home = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

  // `seule` : la box est la seule station appairée — aucune autre ne peut le reprendre.
  let only = false;
  const vue = (blockages: object[] | undefined): SeenOfProjects => {
    const readOnes = rereadOnes(blockages);
    const project: ProjectSeen = {
      nom: "parade",
      depot: "benomite/parade",
      base: "main",
      suiviPar: { id: "g1", nom: "box" }, stations: [{ id: "g1", nom: "box", etat: "en-preparation", dit: "", autoriser: [] }],
      servi: null,
      cuitSur: { id: "g1", nom: "box", ici: false },
      ...(readOnes.length === 0 ? {} : { blocages: readOnes }),
    };
    return { a: A, projets: [project], recommandee: "g1", avertissements: {}, machines: { g1: machineProposed(BOX), g2: machineProposed(MAC) }, calibrage: calibrationRecommended([]) };
  };
  const startup = (projectsOfStations: SeenOfProjects) => ({
    configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
    palette: PALETTE,
    exemple: EXAMPLE,
    onglets: TABS,
    rubriques: HEADINGS,
    gestes: {},
    banniere: BANNER,
    calibrage: { modeles: MODELS, efforts: EFFORTS },
    code: undefined,
    stations: { a: A, stations: only ? [BOX] : [BOX, MAC] } satisfies SeenOfStations,
    accueil: HOME,
    projetsDesStations: projectsOfStations,
  });

  async function thePage(blockages: object[] | undefined, { seuleStation: onlyStation = false } = {}) {
    only = onlyStation;
    const played = await playTheVue({ demarrage: () => startup(vue(blockages)), espace: () => [], autoriserSurGitHub: () => true });
    (played.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
    await repos();
    return { jouee: played, section: played.element("blocages-du-projet") };
  }

  test("deux blocages : la section, deux lignes ; le lien part par le process principal, le bouton ouvre le choix de la machine", async () => {
    const { jouee: played, section } = await thePage([TOKEN, POSTGRES]);
    assert.equal(section.hidden, false);
    assert.equal(lines(section).length, 2);
    const link = section.dessous("a")[0] ?? assert.fail("pas de lien");
    link.click();
    await repos();
    assert.deepEqual(played.dernier("autoriserSurGitHub"), [TOKENS]);
    const button = section.dessous("button").find((b) => b.textContent === "choose another station") ?? assert.fail("pas de bouton");
    button.click();
    await repos();
    const stations = played.element("stations-du-projet");
    assert.equal(stations.hidden, false, "le choix de la machine est ouvert, en vue");
    assert.ok(stations.dessous("section").some((d) => d.className === "demenagement" && visible(stations, d)), "le choix de la machine pour le déménagement");
  });

  test("aucune autre station ne peut le reprendre : pas de bouton qui ne ferait rien, une ligne dit pourquoi", async () => {
    const { section } = await thePage([POSTGRES], { seuleStation: true });
    assert.equal(section.dessous("button").some((b) => b.textContent === "choose another station"), false);
    assert.ok(section.dessous("span").some((s) => s.className === "sans-geste" && s.textContent === "no other station can take it right now"));
  });

  test("le détail déplié le reste à la relecture ; un blocage levé quitte la page ; aucun, la section disparaît", async () => {
    const { jouee: played, section } = await thePage([TOKEN, POSTGRES]);
    const details = section.dessous("details")[0] ?? assert.fail();
    Reflect.set(details, "open", true);
    details.declencher("toggle");
    played.dire("surProjetsDesStations", vue([TOKEN, POSTGRES]));
    await repos();
    assert.equal(opened(section.dessous("details")[0] ?? assert.fail()), true);
    played.dire("surProjetsDesStations", vue([POSTGRES]));
    await repos();
    assert.deepEqual(lines(section).map((li) => li.dataset.blocage), ["need:postgres"]);
    played.dire("surProjetsDesStations", vue(undefined));
    await repos();
    assert.equal(section.hidden, true);
    assert.equal(section.children.length, 0);
  });

  test("un projet sans blocage : aucune section", async () => {
    const { section } = await thePage(undefined);
    assert.equal(section.hidden, true);
    assert.equal(section.children.length, 0);
  });
});
