// Les chiffres d'autonomie (#3222) : trois chiffres et le choix de la période, un état vide dit en clair, une lecture qui
// échoue en une ligne, et « served with a human » qui déplie les tickets, chacun avec sa question et son lien. La vue est
// jouée devant un faux document ; ses lectures sont celles du vrai calcul du runtime sur des données de GitHub figées. Puis
// la vue entière : le bloc de tous les projets sur la page de leur coût, celui du projet dans sa section de Settings.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PERIODES as PERIODS_OF_RUNTIME, chiffresDAutonomie, type DonneesDuDepot } from "../../src/vue/autonomy/compute.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { nameTheProjects, WITHOUT_READ as WITHOUT_READ_OF_PROCESS, type ReadOfAutonomy } from "../../src/vue/autonomy/autonomy-github.ts";
import { NO, WITH_HUMAN, PERIODS, periodSaid, WITHOUT_READ, WITHOUT_QUESTION, holdTheFiguresOfAutonomy } from "../../src/vue/autonomy/figures.js";
import { Fake, playTheVue, openRead, openTheCosts, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const NOW = new Date("2026-11-11T12:00:00.000Z");
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const it = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const pose = (label: string, the: string) => ({ event: "labeled", label: { name: label }, created_at: the });
const said = (body: string, the: string) => ({ body, created_at: the, author_association: "OWNER" });

// Trois tickets de « parade » : #1 servi seul il y a deux jours ; #2 renvoyé puis servi il y a trois jours ; #3 bloqué sur le
// chef, servi il y a vingt jours.
const PARADE: DonneesDuDepot = {
  depot: "chef/parade",
  servis: [
    { ticket: 1, titre: "Badge colours", url: "https://github.com/chef/parade/issues/1", livre: it(2 * DAY) },
    { ticket: 2, titre: "Faster rail", url: "https://github.com/chef/parade/issues/2", livre: it(3 * DAY) },
    { ticket: 3, titre: "New route", url: "https://github.com/chef/parade/issues/3", livre: it(20 * DAY) },
  ],
  issues: {
    1: { evenements: [pose("fire", it(2 * DAY + 2 * HOUR))], commentaires: [] },
    2: { evenements: [pose("fire", it(3 * DAY + 4 * HOUR))], commentaires: [said("<!-- brigade:renvoi n=1 sha=a -->\nsent back", it(3 * DAY + 2 * HOUR))] },
    3: {
      evenements: [pose("fire", it(21 * DAY)), pose("blocked-on-human", it(20 * DAY + 6 * HOUR))],
      commentaires: [said("**Question for the chef (product):** keep the old route?", it(20 * DAY + 6 * HOUR + 1))],
    },
  },
};
const readOne = (days: number, data = [PARADE]): ReadOfAutonomy => {
  const figures = chiffresDAutonomie(data, days, NOW);
  return { jours: days, chiffres: nameTheProjects(figures, () => "parade"), manquants: [], partiels: [] };
};

// Les valeurs des trois chiffres d'autonomie ; celles des défauts échappés (#3515), à part.
const valuesOf = (block: Fake, classe: string) =>
  block
    .dessous("div")
    .filter(({ className }) => className === classe)
    .flatMap((frame) => frame.dessous("p").filter(({ className }) => className === "valeur").map(({ textContent }) => textContent));
const values = (block: Fake) => valuesOf(block, "figure");
const buttonNamed = (block: Fake, start: string) => block.dessous("button").find(({ textContent }) => textContent.startsWith(start));

describe("les chiffres d'autonomie (#3222)", () => {
  test("ses périodes et sa ligne d'échec sont celles du runtime et du process principal", () => {
    assert.deepEqual([...PERIODS], [...PERIODS_OF_RUNTIME]);
    assert.equal(WITHOUT_READ, WITHOUT_READ_OF_PROCESS);
  });

  test("trois chiffres sur la période choisie ; une autre période se lit, et les change", async () => {
    const requests: number[] = [];
    const { poser: set } = holdTheFiguresOfAutonomy(doc, { lire: (days) => (requests.push(days), Promise.resolve(readOne(days))), ouvrir: () => undefined, maintenant: () => NOW.getTime() });
    const block = set() as Fake;
    assert.match(block.textContent, /Reading GitHub/);
    await repos();
    assert.deepEqual(values(block), ["100 %", "3 h", "50 %"]);
    assert.match(block.textContent, /2 of 2 merged tickets/);
    assert.equal(buttonNamed(block, periodSaid(7))?.ariaPressed, "true");
    buttonNamed(block, periodSaid(30))?.click();
    await repos();
    assert.deepEqual(requests, [7, 30]);
    assert.equal(buttonNamed(block, periodSaid(30))?.ariaPressed, "true");
    assert.deepEqual(values(block), ["67 %", "4 h", "33 %"]);
    // Revenue à 7 jours, la période déjà lue ne se relit pas.
    buttonNamed(block, periodSaid(7))?.click();
    await repos();
    assert.deepEqual(requests, [7, 30]);
  });

  test("un clic sur « served with a human » déplie les tickets, chacun avec sa question et son lien", async () => {
    const openOnes: string[] = [];
    const withoutText = readOne(30);
    if ("chiffres" in withoutText) withoutText.chiffres.avecHumain[0]?.questions.push(null);
    const { poser: set } = holdTheFiguresOfAutonomy(doc, { lire: () => Promise.resolve(withoutText), ouvrir: (url) => openOnes.push(url), maintenant: () => NOW.getTime() });
    const block = set() as Fake;
    await repos();
    const unfold = buttonNamed(block, WITH_HUMAN);
    assert.equal(unfold?.textContent, `${WITH_HUMAN} · 1`);
    assert.equal(block.dessous("ul").length, 0);
    unfold?.click();
    const [list] = block.dessous("ul");
    assert.ok(list !== undefined);
    assert.deepEqual(list.dessous("p").map(({ textContent }) => textContent), ["Question for the chef (product): keep the old route?", WITHOUT_QUESTION]);
    buttonNamed(list, "#3 New route")?.click();
    assert.deepEqual(openOnes, ["https://github.com/chef/parade/issues/3"]);
  });

  test("une période sans ticket mergé le dit en une ligne, sans aucun chiffre", async () => {
    const { poser: set } = holdTheFiguresOfAutonomy(doc, { lire: (days) => Promise.resolve(readOne(days, [])), ouvrir: () => undefined });
    const block = set() as Fake;
    await repos();
    assert.deepEqual(values(block), []);
    assert.match(block.textContent, new RegExp(NO(7)));
    assert.doesNotMatch(block.textContent, /NaN|Infinity/);
  });

  test("une lecture qui échoue, ou qui ne rend rien, se dit en une ligne, le détail au survol ; un projet non lu est nommé", async () => {
    for (const read of [() => Promise.reject(new Error("GitHub answered HTTP 502")), () => Promise.resolve(undefined as unknown as ReadOfAutonomy)]) {
      const block = holdTheFiguresOfAutonomy(doc, { lire: read, ouvrir: () => undefined }).poser() as Fake;
      await repos();
      const line = block.dessous("p").find(({ dataset }) => dataset.ligne === "erreur");
      assert.equal(line?.dessous("span")[0]?.textContent, WITHOUT_READ);
      assert.deepEqual(values(block), []);
    }
    const partial = readOne(7);
    if ("chiffres" in partial) partial.manquants.push({ projet: "cantine", raison: "GitHub answered HTTP 404" });
    const block = holdTheFiguresOfAutonomy(doc, { lire: () => Promise.resolve(partial), ouvrir: () => undefined }).poser() as Fake;
    await repos();
    assert.match(block.textContent, /not read: cantine/);
    assert.equal(values(block).length, 3);
  });

  test("une période lue en partie le dit avant les chiffres, avec le projet et l'instant depuis lequel il est compté", async () => {
    const partial = readOne(7);
    if ("chiffres" in partial) partial.partiels.push({ projet: "parade", depuis: "2026-11-01T10:30:00.000Z", raison: "GitHub answered HTTP 403" });
    const block = holdTheFiguresOfAutonomy(doc, { lire: () => Promise.resolve(partial), ouvrir: () => undefined }).poser() as Fake;
    await repos();
    assert.match(block.textContent, /not read over the whole last 7 days: parade counted only from 2026-11-01 10:30 UTC/);
    assert.equal(values(block).length, 3);
  });

  // Les défauts échappés de « parade » (#3515) : le bug #9 cite #1 après son merge, le commit abcdef1… revert un commit de #2.
  const WITH_DEFAULTS: DonneesDuDepot = {
    ...PARADE,
    defauts: {
      bugs: [{ number: 9, title: "Badge grey", body: "Since #1.", created_at: it(DAY), labels: [{ name: "bug" }], html_url: "https://github.com/chef/parade/issues/9" }],
      reverts: [{ sha: "abcdef1".padEnd(40, "0"), commit: { message: `Revert "x"\n\nThis reverts commit ${"c".repeat(40)}.`, committer: { date: it(HOUR) } } }],
      ticketsDesCommits: { ["c".repeat(40)]: [2] },
    },
  };
  // Les mots de la vue, tels que le ticket les nomme.
  const BUGS_ESCAPED = "escaped bugs";
  const REVERTS = "reverts";
  const DEFAULTS_NOT_READ = "not read";
  const textsOf = (block: Fake, name: string) => {
    const frame = block.dessous("div").find(({ className, textContent }) => className === "figure defauts" && textContent.startsWith(name));
    return frame?.dessous("p").map(({ textContent }) => textContent);
  };

  test("les bugs échappés et les reverts suivent les trois chiffres, chacun avec les tickets et les commits qui font son nombre (#3515)", async () => {
    const block = holdTheFiguresOfAutonomy(doc, { lire: (days) => Promise.resolve(readOne(days, [WITH_DEFAULTS])), ouvrir: () => undefined }).poser() as Fake;
    await repos();
    assert.deepEqual(values(block), ["100 %", "3 h", "50 %"]);
    assert.deepEqual(textsOf(block, BUGS_ESCAPED), ["1", "#1 (bug #9)"]);
    assert.deepEqual(textsOf(block, REVERTS), ["1", "abcdef1 (#2)"]);
    // Ceux de tous les projets nomment le projet de chacun.
    const all = holdTheFiguresOfAutonomy(doc, { lire: (days) => Promise.resolve(readOne(days, [WITH_DEFAULTS])), ouvrir: () => undefined, tous: true }).poser() as Fake;
    await repos();
    assert.deepEqual(textsOf(all, BUGS_ESCAPED), ["1", "parade #1 (bug #9)"]);
    assert.deepEqual(textsOf(all, REVERTS), ["1", "parade abcdef1 (#2)"]);
  });

  test("aucun défaut échappé se dit 0 ; des défauts non lus ne se disent pas 0, mais non lus et pourquoi (#3515)", async () => {
    const without = holdTheFiguresOfAutonomy(doc, { lire: (days) => Promise.resolve(readOne(days, [{ ...PARADE, defauts: { bugs: [], reverts: [], ticketsDesCommits: {} } }])), ouvrir: () => undefined }).poser() as Fake;
    await repos();
    assert.deepEqual(textsOf(without, BUGS_ESCAPED), ["0", "none"]);
    assert.deepEqual(textsOf(without, REVERTS), ["0", "none"]);
    const notRead = holdTheFiguresOfAutonomy(doc, { lire: (days) => Promise.resolve(readOne(days, [{ ...PARADE, defauts: { illisible: "GitHub answered HTTP 403 on /search/commits" } }])), ouvrir: () => undefined }).poser() as Fake;
    await repos();
    assert.deepEqual(textsOf(notRead, BUGS_ESCAPED), [DEFAULTS_NOT_READ, "parade: GitHub answered HTTP 403 on /search/commits"]);
    assert.deepEqual(textsOf(notRead, REVERTS), [DEFAULTS_NOT_READ, "parade: GitHub answered HTTP 403 on /search/commits"]);
  });

  test("dix minutes après sa lecture, la période se relit à la pose suivante", async () => {
    let instant = NOW.getTime();
    const requests: number[] = [];
    const { poser: set } = holdTheFiguresOfAutonomy(doc, { lire: (days) => (requests.push(days), Promise.resolve(readOne(days))), ouvrir: () => undefined, maintenant: () => instant });
    set();
    await repos();
    set();
    await repos();
    assert.deepEqual(requests, [7]);
    instant += 10 * 60_000;
    set();
    await repos();
    assert.deepEqual(requests, [7, 7]);
  });
});

describe("les chiffres d'autonomie dans la vue (#3222)", () => {
  const PROJECT: Project = { nom: "parade", dossier: "/tmp/parade" };
  const play = (requests: unknown[][]) =>
    playTheVue({
      demarrage: () => ({
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PROJECT] }, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS,
        rubriques: HEADINGS,
        gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
      lireAutonomie: (projects, days) => (requests.push([projects, days]), readOne(days)),
    });

  test("ceux de tous les projets sont sur la page de leur coût, juste après les tokens", async () => {
    const requests: unknown[][] = [];
    const vue = await play(requests);
    const page = await openTheCosts(vue);
    await repos();
    const body = page.children[1];
    assert.deepEqual(body?.children.slice(0, 2).map(({ className }) => className), ["tete-cout", "chiffres-autonomie"]);
    assert.equal(body?.children[1]?.ariaLabel, "Autonomy of all projects");
    assert.deepEqual(values(body?.children[1] as Fake), ["100 %", "3 h", "50 %"]);
    assert.deepEqual(requests.at(-1), [["parade"], 7]);
  });

  test("ceux d'un projet sont dans sa section de Settings, lus pour lui seul", async () => {
    const requests: unknown[][] = [];
    const vue = await play(requests);
    vue.element("projets").children[1]?.click();
    await repos();
    await openRead(vue, "Settings");
    await repos();
    const block = vue.element("bandeau-sante").children.find(({ dataset }) => dataset.bloc === "chiffres-autonomie");
    assert.ok(block !== undefined);
    assert.equal(block.ariaLabel, "Autonomy");
    assert.deepEqual(values(block), ["100 %", "3 h", "50 %"]);
    assert.deepEqual(requests, [[["parade"], 7]]);
  });
});
