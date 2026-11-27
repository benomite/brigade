// Le premier ticket du premier projet du chef, raconté pas à pas (#3302). D'abord ses morceaux : les lignes que chaque
// lecture du rail ajoute — pris, PR ouverte, en pass, renvoyé et pourquoi, repris, servi —, le récit gardé dans le
// stockage de la vue — seulement pour le premier projet, rangé pour de bon, jamais écrit par-dessus une trace illisible —,
// et ce que la page en dit. Puis la vue jouée entière (vue.js tel qu'il est, un faux pont) : un projet ajouté par « Add a
// project » sur un ordinateur sans projet, les lectures de son rail qui arrivent l'une après l'autre, le geste qui range ;
// et un chef qui avait déjà un projet, à qui rien n'est raconté.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, understand, stepsOfTickets, holdFacts, type StepOfTicket, type Facts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminals.ts";
import {
  advance,
  KEY_OF_FIRST_TICKET,
  IN_PASS,
  WORDS,
  OPEN_THE_PR,
  setStoryOfFirstTicket,
  firstTaken,
  PR_OPEN,
  TAKEN,
  TIDY,
  SENT_BACK,
  RESUMED,
  SERVED,
  holdTheStoryOfFirstTicket,
  TITLE,
  type Line,
} from "../../src/vue/story-first-ticket/story-first-ticket.js";
import { REPOSITORY_OF_THE_VISIT } from "../../src/vue/visit/visit.js";
import { Fake, FakeStorage, playTheVue, type Played, type Answers, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const A = "2026-11-11T10:04:12.000Z";
const PR = { numero: 6, url: "https://github.com/chef/cantine/pull/6" };
const REASON = "the review requested changes on `3f2a9c1` (PR #6):\n\nThe price of a dish shows `NaN €`.";
const step = (state: string, more: Partial<StepOfTicket> = {}): StepOfTicket => ({ ticket: 5, etat: state, pr: null, renvoi: null, ...more });
const TAKEN_READ = step("pris");
const IN_PASS_READ = step("en pass", { pr: PR });
const SENT_BACK_READ = step("pris", { pr: PR, renvoi: { n: 1, raison: REASON } });
const OF_NEW = step("en pass", { pr: PR, renvoi: { n: 1, raison: REASON } });
const SERVED_READ = step("servi", { pr: PR });
const follow = (readings: StepOfTicket[], departure: Line[] = []) => readings.reduce<Line[]>((lines, readEntry) => advance(lines, readEntry, A), departure);
const keys = (lines: readonly Line[]) => lines.map(({ cle: key }) => key);

describe("les lignes que chaque lecture du rail ajoute", () => {
  test("pris, PR ouverte, en pass, renvoyé et pourquoi, repris, de nouveau en pass, servi avec sa PR", () => {
    const lines = follow([TAKEN_READ, IN_PASS_READ, SENT_BACK_READ, OF_NEW, SERVED_READ]);
    assert.deepEqual(keys(lines), ["pris", "pr", "pass", "renvoi", "repris", "pass", "servi"]);
    assert.deepEqual(lines[1]?.pr, PR);
    assert.deepEqual([lines[3]?.n, lines[3]?.raison], [1, REASON]);
    assert.deepEqual(lines[6]?.pr, PR);
  });

  test("une lecture qui ne change rien n'ajoute rien ; servi, le récit est fini", () => {
    const lines = follow([TAKEN_READ, TAKEN_READ, IN_PASS_READ, IN_PASS_READ]);
    assert.deepEqual(keys(lines), ["pris", "pr", "pass"]);
    const served = follow([SERVED_READ, TAKEN_READ, SENT_BACK_READ], lines);
    assert.deepEqual(keys(served), ["pris", "pr", "pass", "servi"]);
  });

  test("vu d'abord en pass, déjà renvoyé une fois : la prise, le renvoi et sa raison, la PR, la pass", () => {
    assert.deepEqual(keys(follow([OF_NEW])), ["pris", "renvoi", "pr", "pass"]);
  });

  test("un renvoi vu seulement à la pass suivante se dit quand même, une seule fois par rang ; un second renvoi se dit aussi", () => {
    const lines = follow([TAKEN_READ, IN_PASS_READ, OF_NEW, OF_NEW, step("pris", { pr: PR, renvoi: { n: 2, raison: "the CI is red" } })]);
    assert.deepEqual(keys(lines), ["pris", "pr", "pass", "renvoi", "pass", "renvoi", "repris"]);
    assert.equal(lines[5]?.raison, "the CI is red");
  });

  test("une autre PR après un renvoi se dit ; la même ne se redit pas", () => {
    const other = { numero: 9, url: "https://github.com/chef/cantine/pull/9" };
    const lines = follow([TAKEN_READ, IN_PASS_READ, SENT_BACK_READ, step("en pass", { pr: other, renvoi: { n: 1, raison: REASON } })]);
    assert.deepEqual(keys(lines), ["pris", "pr", "pass", "renvoi", "repris", "pr", "pass"]);
    assert.deepEqual(lines[5]?.pr, other);
  });

  test("un ticket en attente, WAITING ou mis de côté n'ajoute rien", () => {
    assert.deepEqual(follow([step("en attente"), step("WAITING"), step("86")]), []);
  });

  test("le premier ticket : le plus petit qu'une lecture montre pris ou en pass — jamais un ticket en attente ni un servi", () => {
    assert.equal(firstTaken([step("en attente", { ticket: 2 }), step("servi", { ticket: 1 }), step("en pass", { ticket: 7 }), step("pris", { ticket: 4 })]), 4);
    assert.equal(firstTaken([step("en attente"), step("servi")]), undefined);
  });
});

describe("le récit gardé dans le stockage de la vue", () => {
  test("le premier projet ajouté est raconté, ligne à ligne ; un autre projet ne l'est pas ; un second ajout ne décide plus rien", () => {
    const storage = new FakeStorage();
    let renderedOnes = 0;
    const story = holdTheStoryOfFirstTicket({ stockage: storage, rendre: () => void renderedOnes++, maintenant: () => A });
    story.projetAjoute("cantine", false);
    story.projetAjoute("parade", false);
    // Rien n'est encore pris : rien à montrer.
    story.observer("cantine", [step("en attente")]);
    assert.equal(story.de("cantine"), undefined);
    story.observer("parade", [TAKEN_READ]);
    assert.equal(story.de("parade"), undefined);
    story.observer("cantine", [TAKEN_READ]);
    story.observer("cantine", [IN_PASS_READ]);
    assert.deepEqual(keys(story.de("cantine")?.lignes ?? []), ["pris", "pr", "pass"]);
    assert.equal(story.de("cantine")?.ticket, 5);
    // Un ticket pris plus tard n'est pas le premier : le récit reste sur #5.
    story.observer("cantine", [step("pris", { ticket: 3 }), IN_PASS_READ]);
    assert.equal(story.de("cantine")?.ticket, 5);
    // Gardé : l'app rouverte reprend le récit là où il en était.
    const reopened = holdTheStoryOfFirstTicket({ stockage: storage, rendre: () => {}, maintenant: () => A });
    assert.deepEqual(reopened.de("cantine"), story.de("cantine"));
    assert.ok(renderedOnes >= 3);
  });

  test("un chef qui avait déjà un projet : rien n'est raconté, même au projet suivant", () => {
    const storage = new FakeStorage();
    const story = holdTheStoryOfFirstTicket({ stockage: storage, rendre: () => {}, maintenant: () => A });
    story.projetAjoute("cantine", true);
    story.observer("cantine", [TAKEN_READ]);
    story.projetAjoute("escale", false);
    story.observer("escale", [TAKEN_READ]);
    assert.equal(story.de("cantine"), undefined);
    assert.equal(story.de("escale"), undefined);
  });

  test("rangé : il ne revient plus, ni à la lecture suivante, ni l'app rouverte", () => {
    const storage = new FakeStorage();
    const story = holdTheStoryOfFirstTicket({ stockage: storage, rendre: () => {}, maintenant: () => A });
    story.projetAjoute("cantine", false);
    story.observer("cantine", [TAKEN_READ]);
    story.ranger();
    story.observer("cantine", [IN_PASS_READ]);
    assert.equal(story.de("cantine"), undefined);
    assert.equal(holdTheStoryOfFirstTicket({ stockage: storage, rendre: () => {}, maintenant: () => A }).de("cantine"), undefined);
    assert.equal(JSON.parse(storage.getItem(KEY_OF_FIRST_TICKET) ?? "{}").range, true);
  });

  test("une trace illisible ne décide rien : rien n'est raconté, et rien n'est écrit par-dessus", () => {
    for (const unreadable of ["{pas du json", JSON.stringify({ projet: 3, lignes: [] }), JSON.stringify({ projet: "cantine", lignes: [{ cle: "autre", le: A }] })]) {
      const storage = new FakeStorage();
      storage.setItem(KEY_OF_FIRST_TICKET, unreadable);
      const story = holdTheStoryOfFirstTicket({ stockage: storage, rendre: () => assert.fail("rien ne se redessine"), maintenant: () => A });
      story.projetAjoute("cantine", false);
      story.observer("cantine", [TAKEN_READ]);
      story.ranger();
      assert.equal(story.de("cantine"), undefined);
      assert.equal(storage.getItem(KEY_OF_FIRST_TICKET), unreadable);
    }
  });

  test("un stockage qui refuse la lecture ne décide rien ; un stockage plein garde le récit le temps que l'app tourne", () => {
    const refuses = { getItem: () => { throw new Error("denied"); }, setItem: () => assert.fail("rien ne s'écrit") };
    const silent = holdTheStoryOfFirstTicket({ stockage: refuses, rendre: () => {}, maintenant: () => A });
    silent.projetAjoute("cantine", false);
    silent.observer("cantine", [TAKEN_READ]);
    assert.equal(silent.de("cantine"), undefined);

    const full = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    const held = holdTheStoryOfFirstTicket({ stockage: full, rendre: () => {}, maintenant: () => A });
    held.projetAjoute("cantine", false);
    held.observer("cantine", [TAKEN_READ]);
    assert.deepEqual(keys(held.de("cantine")?.lignes ?? []), ["pris"]);
  });
});

describe("ce que la page en dit", () => {
  test("son titre et « dismiss » ; une ligne par étape, son mot puis ce qu'il veut dire ; la raison d'un renvoi ; le lien de la PR", () => {
    const facts: string[] = [];
    const lines = follow([TAKEN_READ, IN_PASS_READ, SENT_BACK_READ, OF_NEW, SERVED_READ]);
    const pose = setStoryOfFirstTicket(doc, { ticket: 5, lignes: lines }, { ouvrir: () => void facts.push("ouvrir"), ranger: () => void facts.push("ranger") }) as unknown as Fake;
    assert.equal(pose.dessous("strong")[0]?.textContent, TITLE(5));
    const steps = pose.dessous("li");
    assert.deepEqual(steps.map(({ dataset }) => dataset.etape), ["pris", "pr", "pass", "renvoi", "repris", "pass", "servi"]);
    assert.deepEqual(
      steps.map((li) => [li.dessous("strong")[0]?.textContent, li.dessous("span").find(({ className }) => className === "dit")?.textContent]),
      [
        [WORDS.pris, TAKEN(5)],
        [WORDS.pr, PR_OPEN(5, 6)],
        [WORDS.pass, IN_PASS],
        [WORDS.renvoi, SENT_BACK],
        [WORDS.repris, RESUMED(5)],
        [WORDS.pass, IN_PASS],
        [WORDS.servi, SERVED(5, 6)],
      ],
    );
    assert.equal(steps[3]?.dessous("p").find(({ className }) => className === "raison")?.textContent, REASON.replace("PR #6", "the PR of #5"));
    // Le mot de la cuisine, et ce qu'il veut dire en clair : une copie à lui, les gates, la CI, la relecture.
    assert.match(TAKEN(5), /its own copy of the repository/);
    assert.match(IN_PASS, /gates.*CI.*review/);
    // Le lien de la PR : sur sa ligne ouverte et sur le service — pas ailleurs.
    assert.deepEqual(
      steps.map((li) => li.dessous("button").map(({ textContent }) => textContent)),
      [[], [OPEN_THE_PR(5, 6)], [], [], [], [], [OPEN_THE_PR(5, 6)]],
    );
    steps[6]?.dessous("button")[0]?.click();
    (pose.dessous("button").find(({ textContent }) => textContent === TIDY) ?? assert.fail("pas de « dismiss »")).click();
    assert.deepEqual(facts, ["ouvrir", "ranger"]);
  });
});

describe("ce que les faits en donnent", () => {
  test("le rail avec sa PR et son dernier renvoi, puis les servis et leur PR mergée — rien d'illisible, aucune adresse qui ne s'ouvre pas", () => {
    const raw = {
      etat: "ouverte",
      lu: A,
      dernierTick: A,
      compteurs: { rail: 2, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 2 },
      dernierEvenement: null,
      rail: [
        { ticket: 5, etat: "pris", titre: "La carte", url: "https://github.com/chef/cantine/issues/5", pr: PR, renvoi: { n: 1, raison: REASON } },
        { ticket: 7, etat: "en attente", titre: "Le menu", url: "https://github.com/chef/cantine/issues/7" },
      ],
      livres: [
        { ticket: 3, titre: "Les allergènes", url: null, livre: A, station: null, pr: "https://github.com/chef/cantine/pull/4" },
        { ticket: 2, titre: "Le pain", url: null, livre: A, station: null, pr: "file:///etc/passwd" },
      ],
    };
    const readOnes = understand(JSON.stringify(raw));
    assert.ok(!("informe" in readOnes), "informe" in readOnes ? readOnes.informe : "");
    assert.deepEqual(stepsOfTickets(readOnes as Facts), [
      { ticket: 5, etat: "pris", pr: PR, renvoi: { n: 1, raison: REASON } },
      { ticket: 7, etat: "en attente", pr: null, renvoi: null },
      { ticket: 3, etat: "servi", pr: { numero: 4, url: "https://github.com/chef/cantine/pull/4" }, renvoi: null },
      { ticket: 2, etat: "servi", pr: null, renvoi: null },
    ]);
    // Une PR qui n'a pas la forme rend sa carte illisible, comme tout champ du rail : rien n'y est deviné.
    const informs = understand(JSON.stringify({ ...raw, rail: [{ ...raw.rail[0], pr: { numero: "six", url: PR.url } }] }));
    assert.ok(!("informe" in informs));
    assert.deepEqual(stepsOfTickets(informs as Facts).filter(({ etat: state }) => state !== "servi"), []);
  });
});

// La vue jouée entière.
const PATH = "/home/chef/.config/brigade/app.json";
const REPOSITORY = "chef/cantine";
const SECOND: Terminal = { id: 1, projet: "cantine", genre: "second", titre: "second · claude", note: "", arrete: false };
const startup = (projects: Project[]) => () => ({
  configuration: forTheBar({ chemin: PATH, projets: projects }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
const PARADE: Project = { nom: "parade", dossier: "/home/chef/Brigade/parade", depot: "chef/parade", base: "main" };
const VISIT: Project = { nom: "brigade", dossier: "/home/chef/Brigade/brigade", depot: REPOSITORY_OF_THE_VISIT, base: "main" };
type Entry = Facts["rail"][number];
const entry = (state: string, more: Partial<Entry> = {}): Entry => ({ ticket: 5, etat: state, titre: "La carte du midi", url: `https://github.com/${REPOSITORY}/issues/5`, ...more });
const reading = (rail: Entry[], delivered: NonNullable<Facts["livres"]> = []): Facts => ({
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: rail.length, auTravail: 0, aLaPass: 0, attend: 0, livres24h: delivered.length },
  dernierEvenement: null,
  rail,
  cooks: [],
  attend: [],
  livres: delivered,
});

// « Add a project », puis le dépôt chef/cantine : la page de cantine s'ouvre, déjà prête pour Brigade.
async function addCantine(storage: FakeStorage, projects: Project[] = [], answers: Answers = {}) {
  let vue: Played | undefined;
  vue = await playTheVue(
    {
      demarrage: startup(projects),
      stationsDuChef: () => ({ state: "listed", stations: [], unreadable: [] }),
      compteGitHub: () => ({ login: "octo-chef" }),
      stationsDuCompte: () => ({ state: "listed", stations: [], unreadable: [] }),
      depotsDuChef: () => ({ depots: [{ depot: REPOSITORY, base: "main" }] }),
      ouvrirDUneStation: (name, repository, base) => {
        vue?.dire("surConfiguration", forTheBar({ chemin: PATH, projets: [...projects, { nom: name, dossier: `/home/chef/Brigade/${name}`, depot: repository, base: base ?? "main" } satisfies Project] }), []);
        return { state: "open", project: name, repository: repository, folder: `/home/chef/Brigade/${name}`, cloned: true };
      },
      projetsServis: () => ({ depots: [REPOSITORY] }),
      checkRepoSetup: () => ({ ready: true, missingBindings: [], missingLabels: [] }),
      espace: () => [SECOND],
      departDuProjet: () => ({ aucune: true }),
      ...answers,
    },
    { stockage: storage },
  );
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
  (vue.element("ajout").dessous("button").find(({ textContent }) => textContent === REPOSITORY) ?? assert.fail("pas de dépôt")).click();
  await repos();
  assert.equal(vue.element("espace").textContent, "cantine");
  return vue;
}
async function read(vue: Played, facts: Facts) {
  vue.dire("surFaits", { ...holdFacts(() => new Map()).recevoir({ projet: "cantine", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] }), demande: vue.dernier("faits")[0] as number });
  await repos();
}
const section = (vue: Played) => vue.element("recit-premier-ticket");
const stepsSaid = (vue: Played) => section(vue).dessous("li").map(({ dataset }) => dataset.etape);

describe("la vue jouée : le premier ticket du premier projet, raconté à mesure qu'il se passe", () => {
  test("ajouté sur un ordinateur sans projet : chaque lecture de son rail ajoute sa ligne ; servi, le lien ouvre sa PR ; rangé, il ne revient plus", async () => {
    const storage = new FakeStorage();
    const openEntries: string[] = [];
    const vue = await addCantine(storage, [VISIT], {
      ouvrirPrDuCook: (project, ticket) => (openEntries.push(`cook ${project}#${ticket}`), false),
      ouvrirPr: (project, ticket) => (openEntries.push(`servi ${project}#${ticket}`), true),
    });
    await read(vue, reading([entry("en attente")]));
    assert.equal(section(vue).hidden, true);
    await read(vue, reading([entry("pris", { station: "box/claude" })]));
    assert.equal(section(vue).hidden, false);
    assert.deepEqual(stepsSaid(vue), ["pris"]);
    await read(vue, reading([entry("en pass", { pr: PR })]));
    await read(vue, reading([entry("pris", { pr: PR, renvoi: { n: 1, raison: REASON } })]));
    await read(vue, reading([entry("en pass", { pr: PR, renvoi: { n: 1, raison: REASON } })]));
    await read(vue, reading([], [{ ticket: 5, titre: "La carte du midi", url: null, livre: A, station: "box/claude", pr: PR.url }]));
    assert.deepEqual(stepsSaid(vue), ["pris", "pr", "pass", "renvoi", "repris", "pass", "servi"]);
    assert.ok(section(vue).dessous("p").some(({ textContent }) => textContent === REASON.replace("PR #6", "the PR of #5")));
    const served = section(vue).dessous("li").at(-1) ?? assert.fail("pas de ligne servie");
    (served.dessous("button")[0] ?? assert.fail("pas de lien")).click();
    await repos();
    assert.deepEqual(openEntries, ["cook cantine#5", "servi cantine#5"]);
    (section(vue).dessous("button").find(({ textContent }) => textContent === TIDY) ?? assert.fail("pas de « dismiss »")).click();
    await repos();
    assert.equal(section(vue).hidden, true);
    await read(vue, reading([entry("pris", { ticket: 8 })]));
    assert.equal(section(vue).hidden, true);
    // L'app rouverte : rien ne revient.
    const reopened = await playTheVue({ demarrage: startup([VISIT, { nom: "cantine", dossier: "/home/chef/Brigade/cantine", depot: REPOSITORY, base: "main" }]) }, { stockage: storage });
    await repos();
    assert.equal(reopened.element("recit-premier-ticket").hidden, true);
  });

  test("un chef qui avait déjà un projet : son nouveau projet n'a rien de raconté", async () => {
    const storage = new FakeStorage();
    const vue = await addCantine(storage, [PARADE]);
    await read(vue, reading([entry("pris")]));
    await read(vue, reading([entry("en pass", { pr: PR })]));
    assert.equal(section(vue).hidden, true);
    assert.deepEqual(JSON.parse(storage.getItem(KEY_OF_FIRST_TICKET) ?? "{}"), { projet: null, lignes: [] });
  });
});
