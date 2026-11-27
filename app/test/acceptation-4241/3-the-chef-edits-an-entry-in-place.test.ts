// Test d'acceptation gelé (#4241), critère 3. La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : le savoir-faire du projet passe par UN petit module,
// `app/src/vue/know-how-tab/source.js`, qui exporte l'objet `source` — `source.lire()` rend les entrées `{ id, text, ticket }`
// (le ticket d'où l'entrée est née), `source.modifier(id, texte)` en change le texte, `source.retirer(id)` la retire. La vue les appelle
// par l'objet, à chaque usage : le test les remplace par un faux qui tient son état. L'entrée du menu est un bouton « Know-how » de
// `onglets-du-projet`, voisin de Stations ; l'écran se rouvre en montrant un autre onglet puis celui-là. Une entrée se modifie dans un
// champ (`textarea` ou `input`) qui porte son texte, un bouton « save » l'enregistre ; elle se retire d'un bouton « remove » (ou « delete »).
import assert from "node:assert/strict";
import { test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { source } from "../../src/vue/know-how-tab/source.js";
import { playTheVue, repos, type Fake, type Played } from "../helpers/false-vue.ts";

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
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
const ENTRIES: Entry[] = [
  { id: "L1", text: "Run the typecheck before pushing", ticket: 4001 },
  { id: "L2", text: "Never kill a process by name", ticket: 4002 },
  { id: "L3", text: "Fakes live in test/aides", ticket: 4003 },
];

// Le faux tient son état : une relecture rend ce que l'écran rouvert doit montrer.
function fakeModule(departure: Entry[]) {
  const state = structuredClone(departure);
  Object.assign(source, {
    lire: async () => structuredClone(state),
    modifier: async (id: string, text: string) => {
      const target = state.find((entry) => entry.id === id);
      if (target !== undefined) target.text = text;
    },
    retirer: async (id: string) => {
      const i = state.findIndex((entry) => entry.id === id);
      if (i >= 0) state.splice(i, 1);
    },
  });
}
async function openTheProject(): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const tabs = (vue: Played): Fake[] => vue.element("onglets-du-projet").children;
const tab = (vue: Played, title: string): Fake => tabs(vue).find((o) => o.textContent.trim() === title) ?? assert.fail(`pas d'onglet « ${title} »`);
const visible = (node: Fake): boolean => {
  for (let pose: Fake | null = node; pose !== null; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const all = (vue: Played): Fake[] => vue.poses().filter(visible);
const shows = (vue: Played): string => all(vue).map((p) => p.textContent).join("\n");
async function openTheKnowHow(vue: Played): Promise<void> {
  tab(vue, "Know-how").click();
  await repos();
}
async function reopen(vue: Played): Promise<void> {
  tab(vue, "Rail").click();
  await repos();
  await openTheKnowHow(vue);
}
const buttons = (vue: Played, word: RegExp): Fake[] => all(vue).filter((p) => p.balise === "button" && word.test(p.textContent.trim()));
const field = (vue: Played, value: string): Fake | undefined => all(vue).find((p) => (p.balise === "textarea" || p.balise === "input") && p.value === value);
// Le bouton « mot » de l'entrée : celui du plus bas ancêtre du texte de l'entrée qui n'en porte qu'un.
function buttonOfTheEntry(vue: Played, text: string, word: RegExp): Fake {
  const anchor = all(vue).find((p) => p.children.length === 0 && p.textContent.includes(text)) ?? field(vue, text) ?? assert.fail(`pas d'entrée « ${text} »`);
  for (let r: Fake | null = anchor; r !== null; r = r.parentElement) {
    const found = r.descendants().filter((d) => d.balise === "button" && !d.hidden && word.test(d.textContent.trim()));
    if (found.length === 1) return found[0] as Fake;
    if (found.length > 1) break;
  }
  return assert.fail(`pas de bouton ${word} pour « ${text} »`);
}

// #4241, critère 3 : modifier une entrée sur place, l'enregistrer, la retrouver à la réouverture de l'écran.
test("the chef edits an entry in place, saves it, and the new text shows after reopening the screen", async () => {
  fakeModule(ENTRIES);
  const vue = await openTheProject();
  await openTheKnowHow(vue);
  const target = ENTRIES[1] as Entry;
  buttonOfTheEntry(vue, target.text, /^edit/i).click();
  await repos();
  const zone = field(vue, target.text) ?? assert.fail("un champ porte le texte de l'entrée");
  zone.value = "Never kill a process by name, use its pid";
  zone.declencher("input");
  buttonOfTheEntry(vue, target.text, /^save/i).click();
  await repos();
  await reopen(vue);
  const text = shows(vue);
  assert.ok(text.includes("use its pid"), "le nouveau texte se montre à la réouverture");
  assert.ok(text.includes((ENTRIES[0] as Entry).text), "les autres entrées sont intactes");
});
