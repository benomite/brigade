// Le bandeau de santé (#2490, #2921, ex-Kitchen > Health), une section de Settings (#3014) : les plafonds de durée, réglés là et
// nulle part ailleurs dans la page du projet, le closer et les lignes de tous les projets. Les chiffres — le temps des
// tickets, le premier coup — ne sont plus sur le rail (#3013, #3523). Les blocs sont joués avec le faux élément
// de l'app (helpers/false-vue.ts), puis la vue entière, telle qu'elle est.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { BANNER } from "../../../src/facts.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import type { ReadOfCloser, RenderedOfVerifications, RenderedOfSetting } from "../../../src/closer-health.ts";
import { CAPS, type ReadOfCaps, type RenderedOfCap } from "../../../src/caps-duration.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { KEYS as KEYS_OF_SETTINGS, PROPOSES } from "../../../src/settings-of-project.ts";
import { setBlockCloser } from "../../../src/vue/project/banner-health/Closer.js";
import { IN_PROGRESS, setBlockCapsDuration } from "../../../src/vue/project/banner-health/DurationCaps.js";
import { BY_PR } from "../../../src/vue/components/setting/setting.js";
import { Fake, playTheVue, openRead, openTab, repos, type Played } from "../../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

const text = (root: Fake) => root.textContent;
const byClasse = (root: Fake, classe: string) => [...root.descendants()].filter((pose) => pose.className.split(" ").includes(classe));

const READING: ReadOfCaps = {
  branche: "main",
  plafonds: CAPS.map((cap) => ({ cle: cap.cle, nom: cap.nom, unite: cap.unite, entier: cap.entier, duree: cap.duree, defaut: "defaut" in cap ? cap.defaut : null, valeur: cap.cle === "gatesSeconds" ? 120 : null })),
};
// Une rangée de réglage (components/setting, #2920), par sa clé.
const lineOf = (root: Fake, key: string) => [...root.descendants()].find((pose) => pose.className === "reglage" && pose.dataset.cle === key) ?? assert.fail(`pas de ligne ${key}`);
const fieldOf = (line: Fake) => line.dessous("input")[0] ?? assert.fail("pas de champ");
const PR = "https://github.com/chef/parade/pull/41";
// Aucun « save » sur un écran de réglages (#2920) : un bouton qui enregistre, ou une classe qui le nomme.
const withoutRecord = (root: Fake) => {
  assert.deepEqual(root.dessous("button").map(({ textContent }) => textContent).filter((wording) => /^(save|saving…)$/i.test(wording)), []);
  assert.deepEqual([...root.descendants()].filter(({ className }) => /enregistrer/.test(className)), []);
};

describe("les plafonds de durée, sur Health", () => {
  test("le seuil du temps perdu par ticket tel que la station le publie, sans champ ; les durées du dépôt ; les autres repliés", () => {
    const block = setBlockCapsDuration(doc, { lecture: READING, lostTimeMaxMin: 2 });
    const lostMax = lineOf(block, "lostTimeMaxMin");
    assert.match(text(lostMax), /^Lost time per ticket2 minmedian of recent tickets, published by the stationnot editable here yet/);
    assert.equal(lostMax.dessous("input").length, 0);
    assert.equal(lostMax.dataset.depot, undefined, "il ne se change pas d'ici : pas de PR à annoncer");
    assert.match(text(lineOf(block, "gatesSeconds")), /^Gates duration120 sin the repository/);
    // Gardé dans le dépôt : chaque rangée d'un seuil dit qu'un changement ouvre une PR.
    for (const { cle: key } of CAPS) {
      const line = lineOf(block, key);
      assert.equal(line.dataset.depot, "", key);
      assert.deepEqual(byClasse(line, "par-pr").map(text), [BY_PR], key);
    }
    withoutRecord(block);
    const folded = block.dessous("details")[0] ?? assert.fail("pas de repli");
    assert.match(text(folded), /Other drift thresholdsnone set in the repository/);
    assert.equal(folded.dessous("input").length, CAPS.filter(({ duree: duration }) => !duration).length);
  });

  test("le champ s'applique à son `change`, sans « save », quand il change la valeur du dépôt ; ce qui est tapé est gardé", () => {
    const changes: [string, string][] = [];
    const chosen: [string, string][] = [];
    const block = setBlockCapsDuration(doc, { lecture: READING, changer: (key, input) => changes.push([key, input]), choisir: (key, picked) => chosen.push([key, picked]) });
    withoutRecord(block);
    const line = lineOf(block, "gatesSeconds");
    const field = fieldOf(line);
    field.value = " 150 ";
    field.declencher("input");
    assert.deepEqual(changes, [], "taper n'applique rien");
    assert.deepEqual(chosen, [["gatesSeconds", " 150 "]]);
    field.declencher("change");
    // La valeur déjà en vigueur n'applique rien.
    field.value = "120";
    field.declencher("change");
    // Vide, le retrait d'un seuil posé s'applique ; celui d'un seuil qui n'est pas posé, non.
    field.value = "";
    field.declencher("change");
    const notPose = fieldOf(lineOf(block, "ticketTokens"));
    notPose.value = " ";
    notPose.declencher("change");
    assert.deepEqual(changes, [
      ["gatesSeconds", "150"],
      ["gatesSeconds", ""],
    ]);
  });

  test("en cours, la rangée le dit et son champ attend ; la PR ouverte se dit avec la valeur proposée et s'ouvre ; un refus garde son détail au survol", () => {
    const openEntries: string[] = [];
    const block = setBlockCapsDuration(doc, {
      lecture: READING,
      ouvrir: (url) => openEntries.push(url),
      etats: new Map([
        ["gatesSeconds", { dit: { pr: PR, numero: 41, valeur: 150 } }],
        ["lostTokens", { choisi: "abc", dit: { refus: "nothing was changed: tokens lost must be a whole number greater than zero", detail: "" } }],
        ["ticketTokens", { choisi: "800", enCours: true }],
      ]),
    });
    const proposed = lineOf(block, "gatesSeconds");
    assert.match(text(proposed), /^Gates duration120 sin the repository/, "la valeur montrée reste celle en vigueur, jusqu'au merge");
    assert.equal(fieldOf(proposed).value, "120");
    assert.deepEqual(byClasse(proposed, "propose").map(text), ["150 s proposed inpull request #41"]);
    (proposed.dessous("button").find(({ textContent }) => textContent === "pull request #41") ?? assert.fail("pas de lien vers la PR")).click();
    assert.deepEqual(openEntries, [PR]);

    const removal = setBlockCapsDuration(doc, { lecture: READING, etats: new Map([["ticketTokens", { dit: { pr: PR, numero: 42, valeur: null } }]]) });
    assert.match(text(lineOf(removal, "ticketTokens")), /removal proposed inpull request #42/);

    const refused = lineOf(block, "lostTokens");
    assert.match(text(refused), /nothing was changed/);
    assert.equal(fieldOf(refused).value, "abc", "ce que le chef a tapé reste dans le champ");

    const inProgress = lineOf(block, "ticketTokens");
    assert.deepEqual(byClasse(inProgress, "en-cours").map(text), [IN_PROGRESS]);
    assert.equal(fieldOf(inProgress).disabled, true);
  });

  test("tant que rien n'est lu, une ligne le dit ; une lecture ratée tient en une ligne", () => {
    assert.match(text(setBlockCapsDuration(doc, {})), /Reading the caps of the repository…/);
    const rate = setBlockCapsDuration(doc, { lecture: { sans: "duration caps unavailable", detail: "GitHub refused (HTTP 401)" } });
    assert.match(text(rate), /duration caps unavailable/);
    assert.doesNotMatch(text(rate), /HTTP 401/, "le détail est au survol, pas à l'écran");
  });
});

// Le closer (#2491) : trois passes — une en cours, une mergée, une fermée sans merge —, deux vérifications en plus, et ses
// réglages, le calibrage et le plafond de tokens posés dans le dépôt.
const pass = (number: number, others: Partial<Extract<ReadOfCloser["passes"], { liste: unknown }>["liste"][number]>) => ({
  numero: number,
  url: `https://github.com/chef/parade/issues/${number}`,
  ouverteLe: "2026-10-10T08:00:00.000Z",
  ouverte: false,
  sha: "9f3c2a17b4e0",
  candidats: [],
  restants: 0,
  derive: [],
  temps: [],
  pr: null,
  ...others,
});
const CLOSER: ReadOfCloser = {
  passes: {
    liste: [
      pass(2531, {
        ouverte: true,
        candidats: [
          { id: "D1", quoi: "24 identical lines of code: `a.js:1-24` = `b.js:40-63`" },
          { id: "M1", quoi: "export `vieux` of `c.ts:12` — referenced nowhere" },
          { id: "M2", quoi: "export `ancien` of `d.ts:3` — referenced only by tests (`d.test.ts`)" },
        ],
        derive: ["last 20 merges: +3,120 / −840 (3.7:1)", "last 100 merges: +18,340 / −7,336 (2.5:1)"],
        temps: ["Times stable: 4 tickets measured since the last pass, and no drift. No correction ticket is opened or changed."],
        pr: { numero: 2533, url: "https://github.com/chef/parade/pull/2533", mergee: false, retirees: 0, ajoutees: 0 },
      }),
      pass(2477, { ouverteLe: "2026-10-08T08:00:00.000Z", candidats: [{ id: "M1", quoi: "x" }], pr: { numero: 2480, url: "https://github.com/chef/parade/pull/2480", mergee: true, retirees: 1234, ajoutees: 56 } }),
      pass(2410, { ouverteLe: "2026-10-06T08:00:00.000Z", pr: { numero: 2412, url: "https://github.com/chef/parade/pull/2412", mergee: false, retirees: 0, ajoutees: 0 } }),
    ],
  },
  verifications: { liste: ["Unused CSS classes"] },
  reglages: {
    liste: [
      { cle: "calibration", nom: "Calibration", unite: "", defaut: null, surGithub: true, valeur: { model: "sonnet", effort: "medium" } },
      { cle: "cooksBelow", nom: "Start condition", unite: "cooks in flight", defaut: 1, surGithub: false, valeur: null },
      { cle: "maxTokens", nom: "Tokens cap", unite: "tokens", defaut: 500_000, surGithub: false, valeur: 300_000 },
      { cle: "maxRemovedLines", nom: "Removed lines cap", unite: "lines", defaut: 500, surGithub: true, valeur: null },
    ],
  },
};
const VALUES = { modeles: MODELS, efforts: EFFORTS };
const partOf = (root: Fake, part: string) => [...root.descendants()].find(({ dataset }) => dataset.partie === part) ?? assert.fail(`pas de partie ${part}`);
const buttonNamed = (root: Fake, wording: string) => root.dessous("button").find((button) => button.textContent === wording) ?? assert.fail(`pas de bouton ${wording}`);

describe("le closer, sur Health", () => {
  test("ses passes, chacune avec ce qu'elle a retiré — ou pourquoi rien —, et sa PR", () => {
    const openOnes: string[] = [];
    const block = setBlockCloser(doc, { lecture: CLOSER, ouvrir: (url) => openOnes.push(url) });
    assert.equal(block.dataset.bloc, "closer");
    const passes = partOf(block, "passes").children.filter(({ className }) => className === "passe");
    assert.deepEqual(passes.map(text), [
      "#2531Oct 10in progress — its PR is in the pass3 candidatesPR of #2531",
      "#2477Oct 8its PR merged1 candidatePR of #2477",
      "#2410Oct 6nothing removedits PR was closed without a mergeno candidatePR of #2410",
    ]);
    buttonNamed(block, "PR of #2477").click();
    buttonNamed(block, "#2531").click();
    assert.deepEqual(openOnes, ["https://github.com/chef/parade/pull/2480", "https://github.com/chef/parade/issues/2531"]);
  });

  test("ce qu'il vérifie en premier : ce que la dernière passe lui a remis sur ce projet, ses candidats repliés", () => {
    const within = partOf(setBlockCloser(doc, { lecture: CLOSER }), "en-premier");
    assert.deepEqual(within.children.filter(({ className }) => className === "verification").map(text), [
      "Dead code2 exports referenced nowhere, or by tests only",
      "Duplicates1 passage of identical lines",
      "Driftlast 100 merges: +18,340 / −7,336 (2.5:1)?",
      "Ticket timesstable since the previous pass?",
    ]);
    const folded = within.dessous("details")[0] ?? assert.fail("pas de candidats");
    assert.match(text(folded), /^Candidates3 handed to pass #2531 on 9f3c2a1/);
    assert.match(text(folded), /M1export vieux of c\.ts:12 — referenced nowhere/);
    // Sans passe, il dit ce qu'il vérifiera.
    const without = setBlockCloser(doc, { lecture: { ...CLOSER, passes: { liste: [] } } });
    assert.match(text(partOf(without, "passes")), /No closing pass yet\./);
    assert.match(text(partOf(without, "en-premier")), /its own checks — dead code, duplicates, drift, ticket times — once a pass is opened/);
  });

  test("une vérification en plus s'ajoute d'ici : « add » n'agit qu'avec un texte, et donne ce qui est tapé", () => {
    const actions: [string, string][] = [];
    const block = setBlockCloser(doc, { lecture: CLOSER, changerVerification: (action, input) => actions.push([action, input]) });
    const within = partOf(block, "en-plus");
    assert.match(text(within), /Unused CSS classesremove/);
    const addition = buttonNamed(within, "add");
    assert.equal(addition.disabled, true);
    assert.equal(addition.className, "recommande");
    const field = within.dessous("input")[0] ?? assert.fail("pas de champ");
    field.value = " Doc sentences naming removed code ";
    field.declencher("input");
    assert.equal(addition.disabled, false);
    addition.click();
    buttonNamed(within, "remove").click();
    assert.deepEqual(actions, [
      ["ajouter", "Doc sentences naming removed code"],
      ["retirer", "Unused CSS classes"],
    ]);
    // Gardées dans le dépôt : la partie dit qu'un geste ouvre une PR.
    assert.deepEqual(byClasse(within, "par-pr").map(text), [BY_PR]);
  });

  test("une vérification proposée : en route, la partie le dit ; la PR ouverte se dit et s'ouvre ; un retrait se dit retrait", () => {
    const inRoute = partOf(setBlockCloser(doc, { lecture: CLOSER, verifications: { enCours: "ajouter" } }), "en-plus");
    assert.deepEqual(byClasse(inRoute, "en-cours").map(text), [IN_PROGRESS]);
    const openEntries: string[] = [];
    const block = setBlockCloser(doc, { lecture: CLOSER, ouvrirLaPr: (url) => openEntries.push(url), verifications: { dit: { pr: PR, numero: 43, geste: "ajouter", verification: "Doc sentences" } } });
    const within = partOf(block, "en-plus");
    assert.match(text(within), /^Extra checks\?Unused CSS classesremove/, "la liste en vigueur, jusqu'au merge");
    assert.deepEqual(byClasse(within, "propose").map(text), ["the check “Doc sentences” proposed inpull request #43"]);
    (within.dessous("button").find(({ textContent }) => textContent === "pull request #43") ?? assert.fail("pas de lien")).click();
    assert.deepEqual(openEntries, [PR]);
    const removal = partOf(setBlockCloser(doc, { lecture: CLOSER, verifications: { dit: { pr: PR, numero: 44, geste: "retirer", verification: "Unused CSS classes" } } }), "en-plus");
    assert.deepEqual(byClasse(removal, "propose").map(text), ["the removal of “Unused CSS classes” proposed inpull request #44"]);
  });

  test("ses réglages : le calibrage, la condition de départ, les plafonds — chacun sa valeur, d'où elle vient, et un contrôle qui s'applique à son `change`", () => {
    const changes: [string, unknown][] = [];
    const block = setBlockCloser(doc, { lecture: CLOSER, valeurs: VALUES, changer: (key, input) => changes.push([key, input]) });
    assert.match(text(lineOf(block, "calibration")), /^Calibrationsonnet \/ mediumin the repository/);
    assert.match(text(lineOf(block, "cooksBelow")), /^Start condition\?not setthe station's, or none in flightnot read on GitHub yet/);
    assert.match(text(lineOf(block, "maxTokens")), /^Tokens cap300,000 tokensin the repositorynot read on GitHub yet/);
    assert.match(text(lineOf(block, "maxRemovedLines")), /^Removed lines capnot setthe station's, or 500 lines/);
    assert.doesNotMatch(text(lineOf(block, "maxRemovedLines")), /not read on GitHub/);
    withoutRecord(partOf(block, "reglages"));
    for (const key of ["calibration", "cooksBelow", "maxTokens", "maxRemovedLines"]) assert.deepEqual(byClasse(lineOf(block, key), "par-pr").map(text), [BY_PR], key);

    const lines = lineOf(block, "maxRemovedLines");
    const field = fieldOf(lines);
    field.value = "800";
    field.declencher("input");
    field.declencher("change");

    const calibration = lineOf(block, "calibration");
    const [model = assert.fail("pas de modèle"), effort = assert.fail("pas d'effort")] = calibration.dessous("select");
    // L'un sans l'autre ne s'applique pas ; les deux choisis, si.
    model.value = "opus";
    effort.value = "";
    model.declencher("change");
    effort.value = "high";
    effort.declencher("change");

    assert.deepEqual(changes, [
      ["maxRemovedLines", "800"],
      ["calibration", { model: "opus", effort: "high" }],
    ]);
  });

  test("un réglage proposé : sa PR se dit sous sa rangée et s'ouvre par `ouvrirLaPr`, la valeur en vigueur reste", () => {
    const openEntries: string[] = [];
    const block = setBlockCloser(doc, {
      lecture: CLOSER,
      valeurs: VALUES,
      ouvrirLaPr: (url) => openEntries.push(url),
      etats: new Map([
        ["calibration", { dit: { pr: PR, numero: 41, valeur: { model: "opus", effort: "high" } } }],
        ["maxRemovedLines", { dit: { pr: PR, numero: 42, valeur: 800 } }],
      ]),
    });
    const calibration = lineOf(block, "calibration");
    assert.match(text(calibration), /^Calibrationsonnet \/ mediumin the repository/);
    assert.deepEqual(byClasse(calibration, "propose").map(text), ["opus / high proposed inpull request #41"]);
    const removed = lineOf(block, "maxRemovedLines");
    assert.match(text(removed), /^Removed lines capnot set/);
    assert.deepEqual(byClasse(removed, "propose").map(text), ["800 lines proposed inpull request #42"]);
    (removed.dessous("button").find(({ textContent }) => textContent === "pull request #42") ?? assert.fail("pas de lien")).click();
    assert.deepEqual(openEntries, [PR]);
  });

  test("tant que rien n'est lu, chaque partie le dit ; une lecture ratée tient en une ligne, le détail au survol", () => {
    assert.match(text(setBlockCloser(doc)), /Reading the closer's passes…/);
    const without = { sans: "the closer's settings unavailable", detail: "GitHub refused (HTTP 401)" };
    const rate = setBlockCloser(doc, { lecture: { ...CLOSER, reglages: without } });
    assert.match(text(partOf(rate, "reglages")), /the closer's settings unavailable/);
    assert.doesNotMatch(text(rate), /HTTP 401/);
    assert.match(text(partOf(rate, "passes")), /#2531/, "les autres parties restent");
  });
});

// La vue entière : parade, ouvert sur Settings, sous le bandeau de santé (#2921, #3014), devant un GitHub qui garde ce qu'on lui écrit.
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

async function play(): Promise<{ vue: Played; ecrits: [string, string, string][]; closer: unknown[][] }> {
  const reading = READING;
  const writtenOnes: [string, string, string][] = [];
  const closer: unknown[][] = [];
  const vue = await playTheVue({
    demarrage: startup,
    espace: () => [],
    machines: () => [],
    plafondsDuree: async () => reading,
    changerPlafondDuree: async (project, key, input): Promise<RenderedOfCap> => {
      writtenOnes.push([project, key, input]);
      // Proposé par une PR : la branche d'intégration — ce que la lecture rend — ne change pas tant qu'elle n'est pas mergée.
      return { propose: PROPOSES, pr: PR, numero: 41, cle: key as "gatesSeconds", valeur: Number(input) };
    },
    closerDeSante: async () => CLOSER,
    changerReglageDuCloser: async (project, key, input): Promise<RenderedOfSetting> => {
      closer.push([project, key, input]);
      return { propose: PROPOSES, pr: PR, numero: 42, cle: key as "maxRemovedLines", valeur: Number(input) };
    },
    changerVerificationDuCloser: async (project, action, input): Promise<RenderedOfVerifications> => {
      closer.push([project, action, input]);
      // Proposée par une PR : la liste en vigueur reste celle de la branche d'intégration jusqu'au merge.
      return { propose: PROPOSES, pr: PR, numero: 43, geste: action, verification: input, liste: ["Unused CSS classes"] };
    },
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  // Le bandeau est une section de Settings (#3014).
  await openRead(vue, "Settings");
  return { vue, ecrits: writtenOnes, closer };
}
const block = (vue: Played) => vue.element("bandeau-sante").dessous("section").find(({ dataset }) => dataset.bloc === "plafonds-duree") ?? assert.fail("pas de plafonds");

describe("le bandeau de santé, dans la vue", () => {
  test("ni chiffre : une section de Settings, sous son titre, montre les plafonds, le closer et les lignes de tous les projets, sans rien à déplier", async () => {
    const { vue } = await play();
    await repos();
    // Les chiffres sont dans la bande du rail (#3013) : la section n'a que son titre et ses quatre blocs (#3014) —
    // les chiffres d'autonomie du projet compris (#3222).
    // La fausse vue ne rejoue pas la place des éléments de index.html : la section se lit dans le fichier, groupe de Settings.
    const html = readFileSync(join(import.meta.dirname, "../../../src/vue/index.html"), "utf8");
    const settings = html.slice(html.indexOf('<section id="etat"'), html.indexOf('<div id="reglages-machine"'));
    assert.match(settings, /<section id="reglages-sante" class="groupe"[^>]*>\s*<h2 [^>]*class="niveau-du-groupe">Caps, closer and all projects<\/h2>\s*<div id="bandeau-sante"><\/div>/);
    assert.equal(vue.element("etat").hidden, false);
    const section = vue.element("bandeau-sante");
    assert.deepEqual(section.children.map(({ dataset }) => dataset.bloc), ["plafonds-duree", "closer", "temps-de-la-passe", "chiffres-autonomie", "post-mortems", "de-tous-les-projets"]);
    assert.deepEqual(section.children.filter(({ balise }) => balise === "details"), [], "rien à déplier pour les voir");
  });

  test("tout ce que la ligne repliée montrait est dans Settings : chaque plafond, les parties du closer, Autonomy de tous les projets", async () => {
    const { vue } = await play();
    await repos();
    for (const { cle: key } of CAPS) assert.ok(lineOf(block(vue), key), key);
    const ofCloser = vue.element("bandeau-sante").dessous("section").find(({ dataset }) => dataset.bloc === "closer") ?? assert.fail("pas de closer");
    assert.match(text(partOf(ofCloser, "passes")), /#2477Oct 8its PR merged/);
    assert.ok(partOf(ofCloser, "en-plus"));
    assert.ok(lineOf(ofCloser, "maxRemovedLines"));
    assert.deepEqual(vue.element("de-tous-les-projets").dessous("button").map(({ ariaLabel }) => ariaLabel), ["the autonomy of all projects"]);
  });

  test("ni sur Rail, ni sur Stations : la section n'est posée que Settings ouvert, et se repose à sa réouverture", async () => {
    const { vue } = await play();
    for (const tab of ["Rail", "Stations"] as const) {
      await openTab(vue, tab);
      assert.equal(vue.element("etat").hidden, true, tab);
      assert.deepEqual(vue.element("bandeau-sante").children, [], tab);
      assert.doesNotMatch(vue.element("rail").textContent, /Caps, closer and all projects/, tab);
    }
    await openRead(vue, "Settings");
    assert.equal(vue.element("etat").hidden, false);
    assert.deepEqual(vue.element("bandeau-sante").children.map(({ dataset }) => dataset.bloc), ["plafonds-duree", "closer", "temps-de-la-passe", "chiffres-autonomie", "post-mortems", "de-tous-les-projets"]);
  });

  test("un plafond changé dans le bandeau part au process principal à son `change`, et la rangée dit la PR ouverte, qui s'ouvre", async () => {
    const { vue, ecrits: writtenOnes } = await play();
    await repos();
    assert.deepEqual(vue.dernier("plafondsDuree"), ["parade"]);
    withoutRecord(block(vue));
    const line = lineOf(block(vue), "gatesSeconds");
    assert.deepEqual(byClasse(line, "par-pr").map(text), [BY_PR]);
    const field = fieldOf(line);
    field.value = "150";
    field.declencher("input");
    field.declencher("change");
    await repos();
    await repos();

    assert.deepEqual(writtenOnes, [["parade", "gatesSeconds", "150"]]);
    const after = lineOf(block(vue), "gatesSeconds");
    assert.match(text(after), /^Gates duration120 sin the repository/, "la valeur en vigueur reste, jusqu'au merge");
    assert.deepEqual(byClasse(after, "propose").map(text), ["150 s proposed inpull request #41"]);
    (after.dessous("button").find(({ textContent }) => textContent === "pull request #41") ?? assert.fail("pas de lien vers la PR")).click();
    assert.deepEqual(vue.dernier("ouvrirLaProposition"), [PR]);
  });

  test("le closer du bandeau : une vérification ajoutée et un réglage changé partent au process principal ; la liste reprise, la PR du réglage dite", async () => {
    const { vue, closer } = await play();
    await repos();
    assert.deepEqual(vue.dernier("closerDeSante"), ["parade"]);
    const ofCloser = () => vue.element("bandeau-sante").dessous("section").find(({ dataset }) => dataset.bloc === "closer") ?? assert.fail("pas de closer");
    assert.match(text(partOf(ofCloser(), "passes")), /#2477Oct 8its PR merged/);

    const field = partOf(ofCloser(), "en-plus").dessous("input")[0] ?? assert.fail("pas de champ");
    field.value = "Doc sentences naming removed code";
    field.declencher("input");
    buttonNamed(partOf(ofCloser(), "en-plus"), "add").click();
    await repos();
    await repos();
    assert.doesNotMatch(text(partOf(ofCloser(), "en-plus")), /Doc sentences naming removed coderemove/, "la liste en vigueur, jusqu'au merge");
    assert.deepEqual(byClasse(partOf(ofCloser(), "en-plus"), "propose").map(text), ["the check “Doc sentences naming removed code” proposed inpull request #43"]);
    assert.equal((partOf(ofCloser(), "en-plus").dessous("input")[0] ?? assert.fail("pas de champ")).value, "", "ajoutée, le champ se vide");

    const line = lineOf(ofCloser(), "maxRemovedLines");
    const count = fieldOf(line);
    count.value = "800";
    count.declencher("input");
    count.declencher("change");
    await repos();
    await repos();
    assert.match(text(lineOf(ofCloser(), "maxRemovedLines")), /^Removed lines capnot set/, "la valeur en vigueur reste, jusqu'au merge");
    assert.deepEqual(byClasse(lineOf(ofCloser(), "maxRemovedLines"), "propose").map(text), ["800 lines proposed inpull request #42"]);
    assert.deepEqual(closer, [
      ["parade", "ajouter", "Doc sentences naming removed code"],
      ["parade", "maxRemovedLines", "800"],
    ]);
  });

  test("les plafonds ne se règlent nulle part ailleurs que dans le bandeau de la page du projet", async () => {
    const { vue } = await play();
    for (const tab of ["Rail", "Stations"] as const) {
      await openTab(vue, tab);
      const caps = [...vue.element("rail").descendants()].filter(({ dataset }) => dataset.bloc === "plafonds-duree" || (dataset.cle !== undefined && CAPS.some(({ cle: key }) => key === dataset.cle)));
      assert.deepEqual(caps, [], tab);
    }
    // Settings : ses réglages du projet n'en portent aucun.
    assert.deepEqual(KEYS_OF_SETTINGS.filter((key) => /drift|temps|duration|tests|gates/i.test(key)), []);
  });
});
