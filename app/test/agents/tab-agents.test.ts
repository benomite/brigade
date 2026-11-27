// L'onglet Agents (#4224) au-delà de ses tests d'acceptation : le bloc seul devant un faux document, pour ce qu'une lecture
// illisible ou ratée y laisse, chaque sorte de contrôle d'un réglage, ce qu'un changement envoie et ce qu'il rend, et le fil
// des gestes ; puis la vue entière, pour ce que l'onglet fait du centre, quand il relit, et le projet qui s'y rouvre.
// Le module des données (agents/source.js) est remplacé par un faux, comme la vue l'appelle : par l'objet `source`.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { holdTheAgents } from "../../src/vue/agents/agents.js";
import { source, type Agent, type Field, type Action } from "../../src/vue/agents/source.js";
import { Fake, FakeStorage, playTheVue, repos, type Played } from "../helpers/false-vue.ts";

const THE_REAL = { ...source };
afterEach(() => void Object.assign(source, THE_REAL));
const doc = { createElement: (balise: string) => new Fake(balise) };

const agent = (id: string, more: Partial<Agent> = {}): Agent => ({
  id,
  name: `agent-${id}`,
  role: `Role sentence of ${id}.`,
  state: "idle",
  workingOn: null,
  nextRun: "in 3 h",
  figures: [{ label: "passes", value: "9", meaning: "passes run in the last 7 days" }],
  ...more,
});
const field = (key: string, more: Partial<Field> = {}): Field => ({ key, label: `label of ${key}`, kind: "text", value: "v", source: "runtime", editable: true, livesIn: null, changedAt: null, changedBy: null, ...more });

// La source remplacée : ce que chaque lecture rend (une fonction, pour un rejet), et chaque appel reçu.
function fake({
  lire: read = async () => [agent("a1")],
  reglages: settings = async () => ({ fields: [] }),
  changer: change = async () => ({}),
  gestes: actions = async () => [],
}: { lire?: () => Promise<unknown>; reglages?: (id: string) => Promise<unknown>; changer?: (id: string, key: string, value: unknown) => Promise<unknown>; gestes?: (id: string) => Promise<unknown> } = {}) {
  const calls: unknown[][] = [];
  Object.assign(source, {
    lire: (project: string) => (calls.push(["lire", project]), read()),
    reglages: (project: string, id: string) => (calls.push(["reglages", project, id]), settings(id)),
    changer: (project: string, id: string, key: string, value: unknown) => (calls.push(["changer", project, id, key, value]), change(id, key, value)),
    gestes: (project: string, id: string) => (calls.push(["gestes", project, id]), actions(id)),
  });
  return calls;
}

async function block(project = "parade") {
  const tab = holdTheAgents(doc, { valeurs: () => ({ modeles: MODELS, efforts: EFFORTS }) });
  tab.lire(project);
  for (let i = 0; i < 3; i++) await repos();
  return { onglet: tab, element: tab.element as unknown as Fake };
}
// Ce qu'un élément dit au survol, et à un lecteur d'écran : le détail d'une ligne d'erreur.
const atHover = (element: Fake): string => [element, ...element.descendants()].map(({ title, ariaLabel }) => `${title} ${ariaLabel}`).join(" ");
const cardOf = (element: Fake, name: string): Fake => element.dessous("article").find(({ ariaLabel }) => ariaLabel === name) ?? assert.fail(`pas de carte « ${name} »`);
const rowOf = (element: Fake, key: string): Fake => [element, ...element.descendants()].find(({ dataset }) => dataset.cle === key) ?? assert.fail(`pas de rangée « ${key} »`);
const fieldOf = (row: Fake): Fake => [...row.dessous("input"), ...row.dessous("select")][0] ?? assert.fail("pas de champ");
async function change(entry: Fake, value: string): Promise<void> {
  entry.value = value;
  entry.declencher("change");
  for (let i = 0; i < 3; i++) await repos();
}

test("a reading that is not a list, or an agent whose figure has no meaning, says the reading is not readable: no card is made up", async () => {
  for (const readOne of [{ error: "boom" }, [agent("a1", { figures: [{ label: "passes", value: "9" } as never] })]]) {
    const calls = fake({ lire: async () => readOne });
    const { element } = await block();
    assert.match(element.textContent, /^The agents' reading is not readable/, JSON.stringify(readOne));
    assert.deepEqual(element.dessous("article"), []);
    assert.deepEqual(calls, [["lire", "parade"]], "aucun réglage n'est lu pour une lecture illisible");
  }
});

test("a reading that fails says the agents were not reached, its detail on hover", async () => {
  fake({ lire: () => Promise.reject(new Error("connect ECONNREFUSED")) });
  const { element } = await block();
  assert.match(element.textContent, /^The agents not reached\./);
  assert.match(atHover(element), /connect ECONNREFUSED/);
});

test("montrer reads the agents once per project: the same project shown again reads nothing more", async () => {
  const calls = fake();
  const tab = holdTheAgents(doc);
  tab.montrer("parade");
  tab.montrer("parade");
  await repos();
  assert.equal(calls.filter(([what]) => what === "lire").length, 1);
  tab.montrer("cantine");
  await repos();
  assert.equal(calls.filter(([what]) => what === "lire").length, 2);
});

test("each setting has its control: a number field for a limit, a list for the model and the autonomy, a switch for a yes / no; an unchanged one says no change", async () => {
  const fields = [
    field("maxTurns", { kind: "number", value: 10 }),
    field("model", { value: "sonnet" }),
    field("autonomy", { value: "propose" }),
    field("paused", { kind: "boolean", value: false }),
    field("note", { value: "hello" }),
  ];
  fake({ reglages: async () => ({ fields: fields }) });
  const { element } = await block();
  const limit = fieldOf(rowOf(element, "maxTurns"));
  assert.deepEqual([limit.balise, limit.type, limit.value], ["input", "number", "10"]);
  const model = fieldOf(rowOf(element, "model"));
  assert.equal(model.balise, "select");
  assert.deepEqual(model.children.map(({ value }) => value), [...MODELS]);
  assert.equal(model.value, "sonnet");
  const level = fieldOf(rowOf(element, "autonomy"));
  assert.deepEqual(level.children.map(({ value }) => value), ["observe", "propose", "act"]);
  const note = fieldOf(rowOf(element, "note"));
  assert.deepEqual([note.balise, note.type], ["input", "text"]);
  const pause = rowOf(element, "paused");
  assert.deepEqual([...pause.dessous("input"), ...pause.dessous("select")], []);
  assert.equal(pause.dessous("button")[0]?.role, "switch");
  for (const { key } of fields) assert.doesNotMatch(rowOf(element, key).textContent, /changed/, `${key} n'a jamais changé`);
  assert.equal(cardOf(element, "agent-a1").dessous("span").find(({ textContent }) => textContent === "idle")?.className, "etat");
});

test("a change sends the value in its kind — a number for a limit, the text for a text, true for a switch turned on; a limit that is not a number is refused before any PUT", async () => {
  const fields = [field("maxTurns", { kind: "number", value: 10 }), field("note", { value: "hello" }), field("paused", { kind: "boolean", value: false })];
  const calls = fake({ reglages: async () => ({ fields: fields }), changer: async (_, key, value) => ({ ...fields.find((oneOf) => oneOf.key === key), value }) });
  const { element } = await block();
  await change(fieldOf(rowOf(element, "maxTurns")), "25");
  await change(fieldOf(rowOf(element, "note")), "bye");
  (rowOf(element, "paused").dessous("button")[0] ?? assert.fail("pas d'interrupteur")).click();
  for (let i = 0; i < 3; i++) await repos();
  assert.deepEqual(
    calls.filter(([what]) => what === "changer"),
    [
      ["changer", "parade", "a1", "maxTurns", 25],
      ["changer", "parade", "a1", "note", "bye"],
      ["changer", "parade", "a1", "paused", true],
    ],
  );
  for (const input of ["", "twelve"]) {
    await change(fieldOf(rowOf(element, "maxTurns")), input);
    assert.match(rowOf(element, "maxTurns").textContent, /a number is expected/, JSON.stringify(input));
  }
  assert.equal(calls.filter(([what]) => what === "changer").length, 3, "rien n'est parti pour une saisie qui n'est pas un nombre");
  assert.equal(fieldOf(rowOf(element, "maxTurns")).value, "25", "la valeur en vigueur reste");
});

test("while a change is on its way, its field shows the value sent, waits, and says it is saving", async () => {
  fake({ reglages: async () => ({ fields: [field("maxTurns", { kind: "number", value: 10 })] }), changer: () => new Promise(() => undefined) });
  const { element } = await block();
  await change(fieldOf(rowOf(element, "maxTurns")), "25");
  const entry = fieldOf(rowOf(element, "maxTurns"));
  assert.deepEqual([entry.value, entry.disabled], ["25", true]);
  assert.match(rowOf(element, "maxTurns").textContent, /Saving…/);
});

test("after a change, the other settings of the card stay as they were", async () => {
  const fields = [field("maxTurns", { kind: "number", value: 10 }), field("note", { value: "hello" })];
  fake({ reglages: async () => ({ fields: fields }), changer: async () => ({ ...fields[0], value: 25, changedAt: "2026-11-24T10:15:00.000Z", changedBy: "benoit" }) });
  const { element } = await block();
  await change(fieldOf(rowOf(element, "maxTurns")), "25");
  assert.equal(fieldOf(rowOf(element, "note")).value, "hello");
  assert.match(rowOf(element, "maxTurns").textContent, /changed Nov 24, 10:15 UTC by benoit/);
});

test("a change the runtime answers with something that is not a field reads the settings again: the value shown is the runtime's", async () => {
  let readOnes = 0;
  const calls = fake({ reglages: async () => ({ fields: [field("maxTurns", { kind: "number", value: readOnes++ === 0 ? 10 : 30 })] }), changer: async () => ({ ok: true }) });
  const { element } = await block();
  await change(fieldOf(rowOf(element, "maxTurns")), "25");
  assert.equal(calls.filter(([what]) => what === "reglages").length, 2);
  assert.equal(fieldOf(rowOf(element, "maxTurns")).value, "30");
});

test("the gestures: the name says whether they are open, only its own card shows them, an issue is named, and a failed reading says so", async () => {
  const actions: Action[] = [
    { at: "2026-11-24T09:30:00.000Z", summary: "tidied the base", reason: "twenty merges since the last pass", issue: 4005 },
    { at: "2026-11-23T09:30:00.000Z", summary: "looked around", reason: "nothing asked", issue: null },
  ];
  fake({ lire: async () => [agent("a1"), agent("a2")], gestes: (id) => (id === "a1" ? Promise.resolve(actions) : Promise.reject(new Error("timeout"))) });
  const { element } = await block();
  const name = (who: string) => cardOf(element, who).dessous("button").find(({ textContent }) => textContent === who) ?? assert.fail(`pas de nom « ${who} »`);
  assert.equal(name("agent-a1").ariaExpanded, "false");
  name("agent-a1").click();
  for (let i = 0; i < 3; i++) await repos();
  assert.equal(name("agent-a1").ariaExpanded, "true");
  assert.equal(name("agent-a2").ariaExpanded, "false");
  assert.doesNotMatch(cardOf(element, "agent-a2").textContent, /tidied the base/);
  const lines = cardOf(element, "agent-a1").dessous("li").filter(({ textContent }) => /tidied|looked/.test(textContent));
  assert.deepEqual(
    lines.map(({ textContent }) => textContent),
    ["tidied the base — why: twenty merges since the last passNov 24, 09:30 UTC · #4005", "looked around — why: nothing askedNov 23, 09:30 UTC"],
  );
  name("agent-a2").click();
  for (let i = 0; i < 3; i++) await repos();
  assert.match(cardOf(element, "agent-a2").textContent, /Its gestures not reached\./);
  assert.match(atHover(cardOf(element, "agent-a2")), /timeout/);
  assert.doesNotMatch(element.textContent, /tidied the base/, "un seul fil ouvert");
});

// La vue entière : l'onglet Agents au centre.
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
async function open(storage?: FakeStorage): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never, storage === undefined ? {} : { stockage: storage });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  for (let i = 0; i < 4; i++) await repos();
  return vue;
}
async function tab(vue: Played, title: string): Promise<void> {
  (vue.element("onglets-du-projet").children.find(({ textContent }) => textContent === title) ?? assert.fail(`pas d'onglet « ${title} »`)).click();
  for (let i = 0; i < 4; i++) await repos();
}

test("the Agents tab takes the middle, named as such, and reads the agents again each time it opens — not when another tab does", async () => {
  const calls = fake();
  const vue = await open();
  await tab(vue, "Agents");
  const center = vue.element("rail");
  assert.equal(center.dataset.onglet, "agents");
  assert.equal(center.ariaLabel, "The agents");
  assert.match(center.textContent, /agent-a1/);
  const readings = () => calls.filter(([what]) => what === "lire").length;
  assert.equal(readings(), 1);
  await tab(vue, "Rail");
  assert.equal(readings(), 1, "Rail ne relit pas les agents");
  await tab(vue, "Agents");
  assert.equal(readings(), 2, "rouvert, l'onglet les relit");
});

test("the project remembers the Agents tab: reopened, it opens on it and reads its agents", async () => {
  const calls = fake();
  const storage = new FakeStorage();
  storage.setItem("brigade.onglets-des-projets", JSON.stringify({ parade: "agents" }));
  const vue = await open(storage);
  assert.equal(vue.element("rail").dataset.onglet, "agents");
  assert.deepEqual(calls.slice(0, 1), [["lire", "parade"]]);
  assert.equal(vue.element("onglets-du-projet").children.find(({ textContent }) => textContent === "Agents")?.ariaSelected, "true");
});
