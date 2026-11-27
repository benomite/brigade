// L'onglet Know-how dans la vue jouée telle qu'elle est (#4241), par le vrai pont (la source passe au faux pont de
// false-vue.ts) : chaque ouverture relit les entrées, même changées ailleurs ; le rail se nomme « The know-how » ;
// l'onglet est retenu d'un lancement à l'autre comme Rail et Stations, et un onglet retenu inconnu rouvre Rail.
import assert from "node:assert/strict";
import { test } from "node:test";
import { POWER_UP } from "../../../src/power-up.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNER } from "../../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../../src/actions.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { FakeStorage, playTheVue, repos, type Fake, type Played } from "../../helpers/false-vue.ts";

// Les tests partagent les modules de la vue, et ce que l'onglet garde par projet : chacun a ses projets.
const startup = (names: string[]) => () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: names.map((name) => ({ nom: name, dossier: `/tmp/${name}` })) }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
type Entry = { id: string; text: string; ticket: number };

// La vue, et le savoir-faire que le runtime rendrait : `entrees` se change entre deux lectures.
async function play(names: string[], storage?: FakeStorage) {
  const state = { entrees: [{ id: "L1", text: "Run the typecheck before pushing.", ticket: 4001 }] as Entry[] };
  const vue = await playTheVue({ demarrage: startup(names), espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }], lireLeSavoirFaire: () => ({ entries: structuredClone(state.entrees) }) } as never, { stockage: storage });
  return { vue, etat: state };
}
async function openTheProject(vue: Played, rank = 1) {
  (vue.element("projets").children.at(rank) ?? assert.fail("pas d'entrée")).click();
  await repos();
}
const tabs = (vue: Played): Fake[] => vue.element("onglets-du-projet").children;
const tab = (vue: Played, title: string): Fake => tabs(vue).find((o) => o.textContent.trim() === title) ?? assert.fail(`pas d'onglet « ${title} »`);
const chosen = (vue: Played) => tabs(vue).filter((o) => o.ariaSelected === "true").map((o) => o.textContent);
const readOne = (vue: Played) => [...vue.element("rail").descendants()].filter((n) => n.className === "entree").map((n) => n.textContent);
async function click(vue: Played, title: string) {
  tab(vue, title).click();
  await repos();
}

test("each opening of Know-how reads the entries again through the bridge, even changed elsewhere; the rail is named for it", async () => {
  const { vue, etat: state } = await play(["parade"]);
  await openTheProject(vue);
  assert.equal(vue.element("rail").ariaLabel, "The rail");
  await click(vue, "Know-how");
  assert.deepEqual(chosen(vue), ["Know-how"]);
  assert.equal(vue.element("rail").ariaLabel, "The know-how");
  assert.deepEqual(readOne(vue), ["Run the typecheck before pushing.from #4001editremove"]);
  await click(vue, "Rail");
  state.entrees = [{ id: "L1", text: "Typecheck, then push.", ticket: 4001 }, { id: "L3", text: "Fakes live in test/aides.", ticket: 4003 }];
  await click(vue, "Know-how");
  assert.deepEqual(readOne(vue), ["Typecheck, then push.from #4001editremove", "Fakes live in test/aides.from #4003editremove"]);
  assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "lireLeSavoirFaire").map(({ args }) => args), [["parade"], ["parade"]]);
});

test("Know-how is remembered from one launch to the next like Rail and Stations; an unknown remembered tab opens on Rail", async () => {
  const storage = new FakeStorage();
  storage.setItem("brigade.onglets-des-projets", JSON.stringify({ relance: "savoir-faire", autre: "cooks" }));
  const { vue } = await play(["relance", "autre"], storage);
  await openTheProject(vue);
  assert.deepEqual(chosen(vue), ["Know-how"]);
  assert.deepEqual(readOne(vue), ["Run the typecheck before pushing.from #4001editremove"]);
  await openTheProject(vue, 2);
  assert.deepEqual(chosen(vue), ["Rail"]);
});
