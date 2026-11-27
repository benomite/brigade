// Les explications des mots de la cuisine (#3308) : la première fois que le chef rencontre rail, pass, cook, second, TODO ou
// WAITING, une ligne l'explique à côté du mot — la ligne même de docs/glossary.md. Vue, ou écartée, elle ne revient pas
// quand l'app se recharge, ni sur un autre appareil du chef : le registre est celui du runtime, par chef. Settings les
// remontre toutes. D'abord les textes contre le glossaire, puis la vue jouée entière (vue.js tel qu'il est, un faux pont
// devant un faux registre du runtime, partagé par deux sessions comme par deux appareils).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { putAside } from "../../src/awaiting.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminals.ts";
import type { WordExplained } from "../../src/vue/explanations/explanations-box.ts";
import { EXPLANATIONS, WORD_AT_THE_SCREEN, WORDS, WORDS_EXPLAINED } from "../../src/vue/explanations/explanations.js";
import { type Fake, playTheVue, type Played, openRead, openTab, repos } from "../helpers/false-vue.ts";

// Le glossaire : la ligne de chaque mot, prise dans sa section — la cellule de son entrée, ou sa première phrase quand
// l'entrée en a plusieurs (cook, TODO : le PR le dit).
const GLOSSARY = readFileSync(join(import.meta.dirname, "..", "..", "..", "docs", "glossary.md"), "utf8");
/** La troisième cellule de la rangée de la section `section` dont la première cellule est `francais`. */
function entry(section: string, french: string): string {
  const start = GLOSSARY.indexOf(`\n## ${section}`);
  assert.ok(start >= 0, section);
  const end = GLOSSARY.indexOf("\n## ", start + 1);
  const row = GLOSSARY.slice(start, end === -1 ? undefined : end)
    .split("\n")
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .find((cellules) => cellules[1] === french);
  return row?.[3] ?? assert.fail(`pas d'entrée ${french} en ${section}`);
}
const firstSentence = (text: string) => /^.*?\.(?=\s|$)/.exec(text)?.[0] ?? assert.fail(text);
const OF_GLOSSARY: Record<WordExplained, string> = {
  rail: entry("3.", "`rail`"),
  pass: entry("2.", "`en pass` / `Pass`"),
  cook: firstSentence(entry("1.", "`cuisiner` / `cuisiné par`")),
  second: entry("2.", "`second`"),
  TODO: firstSentence(entry("2.", "`attend` (bloc, ligne, pilule)")),
  WAITING: entry("2.", "`WAITING`"),
};

describe("les textes : la ligne du glossaire, mot pour mot", () => {
  test("chacun des six mots a son explication, identique à sa ligne de docs/glossary.md", () => {
    assert.deepEqual(Object.keys(EXPLANATIONS), [...WORDS_EXPLAINED]);
    assert.deepEqual(WORDS_EXPLAINED, ["rail", "pass", "cook", "second", "TODO", "WAITING"]);
    for (const word of WORDS_EXPLAINED) assert.equal(EXPLANATIONS[word], OF_GLOSSARY[word], word);
  });
});

// La vue jouée entière.
const PARADE = "parade";
const A = "2026-11-11T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "", arrete: false };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
const entryOfRail = (ticket: number, state: string) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: `https://github.com/o/parade/issues/${ticket}`, activite: null, attente: null });
const FACTS: Facts = {
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 1, auTravail: 1, aLaPass: 1, attend: 0, livres24h: 1 },
  dernierEvenement: null,
  // #30, pris, est parked : il attend un tiers (#4238).
  rail: [entryOfRail(21, "en attente"), { ...entryOfRail(30, "pris"), tiers: { quoi: "the keys", qui: "the client", depuis: A, relance: "2026-12-01T09:00:00.000Z", aLArrivee: "goes on" } }, entryOfRail(31, "en pass"), entryOfRail(12, "servi")],
  cooks: [],
  attend: [],
};
function drawable() {
  const heldOnes = holdFacts();
  const receivedOne = heldOnes.recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
  return heldOnes.attendre(putAside({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "status", texte: "projet     parade\ncuisine    ouverte\n" }] })) ?? receivedOne;
}

// Le registre du runtime, tel que `explanations` le tient pour ce chef : partagé par les sessions qui le lisent.
function registry(seenOnes: WordExplained[] = []) {
  const seen = new Set<WordExplained>(seenOnes);
  const such = () => WORDS_EXPLAINED.filter((word) => seen.has(word));
  return {
    seen,
    reponses: {
      lireLesExplications: () => ({ vus: such() }),
      marquerUneExplication: (_: string, word: WordExplained) => (seen.add(word), { vus: such() }),
      remontrerLesExplications: () => (seen.clear(), { vus: [] }),
    },
  };
}

// Une session de l'app : elle s'ouvre, le chef clique sur parade, son rail est lu.
async function session(answers: Record<string, unknown>) {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  vue.dire("surFaits", { ...drawable(), demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}

// Les explications à l'écran : celles du rail, et celle du second sous son onglet.
const shown = (vue: Played): Fake[] => [...vue.element("rail").descendants(), ...vue.element("explication-second").descendants()].filter(({ className }) => className === "explication");
const words = (vue: Played) => shown(vue).map(({ dataset }) => dataset.mot).sort();
const explanation = (vue: Played, word: string) => shown(vue).find(({ dataset }) => dataset.mot === word) ?? assert.fail(`pas d'explication de ${word} : ${words(vue).join(", ")}`);
const marks = (vue: Played) => vue.appels.filter(({ geste: action }) => action === "marquerUneExplication").map(({ args }) => args[1]);
const ALL = [...WORDS_EXPLAINED].sort();

describe("la vue : chaque mot expliqué la première fois que le chef le rencontre", () => {
  test("un registre vide : à côté de chacun des six mots, sa ligne du glossaire, et chacun marqué vu, une fois", async () => {
    const runtime = registry();
    const vue = await session(runtime.reponses);
    assert.deepEqual(words(vue), ALL);
    for (const word of WORDS_EXPLAINED) {
      const line = explanation(vue, word);
      assert.equal(line.children.find(({ className }) => className === "dit")?.textContent, OF_GLOSSARY[word], word);
      assert.equal(line.children.find(({ className }) => className === "mot")?.textContent, WORD_AT_THE_SCREEN[word], word);
    }
    // Pass : sous le titre de sa colonne ; WAITING, sous celui de la première colonne où une carte est parked (#4238).
    for (const [column, word] of [["Pass", "pass"], ["Cooks", "WAITING"]] as const) {
      const pose = vue.element("rail").dessous("section").find(({ dataset }) => dataset.colonne === column) ?? assert.fail(column);
      assert.equal(pose.children[0]?.balise, "h4");
      assert.equal(pose.children[1]?.dataset.mot, word, column);
    }
    // Rail, Cook et TODO n'ont plus de place au-dessus des colonnes (#3523) : leurs explications sont dessous, dans l'ordre.
    const children = vue.element("rail").children;
    const under = children.slice(children.findIndex(({ className }) => className === "colonnes") + 1).filter(({ dataset }) => dataset.mot !== undefined).map(({ dataset }) => dataset.mot);
    assert.deepEqual(under, ["rail", "cook", "TODO"]);
    assert.equal(children.slice(0, children.findIndex(({ className }) => className === "colonnes")).some(({ dataset }) => dataset.mot !== undefined), false, "une explication au-dessus des colonnes");
    assert.ok(!vue.element("rail").dessous("section").some(({ dataset }) => dataset.colonne === "Awaiting you"));
    assert.deepEqual([...marks(vue)].sort(), ALL);
    assert.deepEqual([...runtime.seen].sort(), ALL);
    // La lecture suivante repose le rail : les explications restent à l'écran, sans être marquées de nouveau.
    vue.dire("surFaits", { ...drawable(), demande: vue.dernier("faits")[0] as number });
    await repos();
    assert.deepEqual(words(vue), ALL);
    assert.equal(marks(vue).length, WORDS_EXPLAINED.length);
  });

  test("écartée, une explication part de l'écran ; rechargée, l'app ne remontre aucune explication vue — un mot pas encore rencontré garde la sienne", async () => {
    // Le chef n'a encore rencontré que rail, pass et cook, sur un autre écran ou un autre appareil.
    const runtime = registry(["rail", "pass", "cook"]);
    const first = await session(runtime.reponses);
    assert.deepEqual(words(first), ["TODO", "WAITING", "second"]);
    const setAside = explanation(first, "WAITING").dessous("button").find(({ textContent }) => textContent === WORDS.ecarter) ?? assert.fail("pas de « got it »");
    setAside.click();
    await repos();
    assert.deepEqual(words(first), ["TODO", "second"]);
    assert.deepEqual([...runtime.seen].sort(), ALL);
    // L'app rechargée — ou la même chef sur son PC : le même registre, rien ne se remontre, rien ne se remarque.
    const second = await session(runtime.reponses);
    assert.deepEqual(words(second), []);
    assert.deepEqual(marks(second), []);
  });

  test("Settings remontre toutes les explications : le registre du chef effacé, chaque mot se réexplique ici et dans une autre session", async () => {
    const runtime = registry([...WORDS_EXPLAINED]);
    const vue = await session(runtime.reponses);
    assert.deepEqual(words(vue), []);
    await openRead(vue, "Settings");
    const row = vue.element("explications-du-chef");
    assert.equal(row.hidden, false);
    assert.match(row.textContent, /6 of 6 seen/);
    // Le rail, sous Settings, n'est pas rencontré : rien ne s'y explique, rien ne s'y marque.
    const showAgain = row.dessous("button").find(({ textContent }) => textContent === WORDS.remontrer) ?? assert.fail("pas de geste");
    showAgain.click();
    await repos();
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "remontrerLesExplications").map(({ args }) => args), [[PARADE]]);
    assert.match(row.textContent, new RegExp(WORDS.fait));
    assert.deepEqual([...runtime.seen], ["second"], "seul le second, à l'écran à côté de Settings, est rencontré");
    assert.deepEqual(words(vue), ["second"]);
    // De retour sur le rail : chaque mot s'y réexplique.
    await openTab(vue, "Rail");
    vue.dire("surFaits", { ...drawable(), demande: vue.dernier("faits")[0] as number });
    await repos();
    assert.deepEqual(words(vue), ALL);
    // Sur un autre appareil du chef, après l'effacement mais avant qu'ici le rail soit revu, tout s'explique de nouveau.
    runtime.reponses.remontrerLesExplications();
    const elsewhere = await session(runtime.reponses);
    assert.deepEqual(words(elsewhere), ALL);
  });

  test("un registre qui ne se lit pas : aucune explication montrée ni marquée, et Settings dit pourquoi, son geste éteint", async () => {
    const vue = await session({ lireLesExplications: () => ({ sans: "explanations unavailable", detail: "explanations.json is not JSON" }), marquerUneExplication: () => assert.fail("rien ne se marque") });
    assert.deepEqual(words(vue), []);
    await openRead(vue, "Settings");
    const row = vue.element("explications-du-chef");
    assert.equal(row.hidden, false);
    assert.match(row.textContent, /explanations unavailable/);
    assert.equal(row.dessous("button").find(({ textContent }) => textContent === WORDS.remontrer)?.disabled, true);
  });

  test("un mot vu que le runtime ne garde pas : l'explication reste, et Settings dit qu'elle n'est pas gardée", async () => {
    const vue = await session({ lireLesExplications: () => ({ vus: ["rail", "pass", "cook", "TODO", "WAITING"] }), marquerUneExplication: () => ({ refus: "explanations.json cannot be read" }) });
    assert.deepEqual(words(vue), ["second"]);
    await openRead(vue, "Settings");
    assert.match(vue.element("explications-du-chef").textContent, /an explanation seen was not kept — explanations\.json cannot be read/);
  });

  test("un pont sans explications — le téléphone : rien ne se montre, et Settings n'en a pas de rangée", async () => {
    const vue = await session({});
    assert.deepEqual(words(vue), []);
    await openRead(vue, "Settings");
    assert.equal(vue.element("explications-du-chef").hidden, true);
  });
});
