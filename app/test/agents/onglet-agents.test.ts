// L'onglet Agents (#4224) au-delà de ses tests d'acceptation : le bloc seul devant un faux document, pour ce qu'une lecture
// illisible ou ratée y laisse, chaque sorte de contrôle d'un réglage, ce qu'un changement envoie et ce qu'il rend, et le fil
// des gestes ; puis la vue entière, pour ce que l'onglet fait du centre, quand il relit, et le projet qui s'y rouvre.
// Le module des données (agents/source.js) est remplacé par un faux, comme la vue l'appelle : par l'objet `source`.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { holdLesAgents } from "../../src/vue/agents/agents.js";
import { source, type Agent, type Champ, type Action } from "../../src/vue/agents/source.js";
import { Faux, FauxStockage, jouerLaVue, repos, type Jouee } from "../aides/fausse-vue.ts";

const LA_VRAIE = { ...source };
afterEach(() => void Object.assign(source, LA_VRAIE));
const doc = { createElement: (balise: string) => new Faux(balise) };

const agent = (id: string, plus: Partial<Agent> = {}): Agent => ({
  id,
  name: `agent-${id}`,
  role: `Role sentence of ${id}.`,
  state: "idle",
  workingOn: null,
  nextRun: "in 3 h",
  figures: [{ label: "passes", value: "9", meaning: "passes run in the last 7 days" }],
  ...plus,
});
const champ = (key: string, plus: Partial<Champ> = {}): Champ => ({ key, label: `label of ${key}`, kind: "text", value: "v", source: "runtime", editable: true, livesIn: null, changedAt: null, changedBy: null, ...plus });

// La source remplacée : ce que chaque lecture rend (une fonction, pour un rejet), et chaque appel reçu.
function faux({
  lire = async () => [agent("a1")],
  reglages: settings = async () => ({ fields: [] }),
  changer = async () => ({}),
  gestes: actions = async () => [],
}: { lire?: () => Promise<unknown>; reglages?: (id: string) => Promise<unknown>; changer?: (id: string, key: string, value: unknown) => Promise<unknown>; gestes?: (id: string) => Promise<unknown> } = {}) {
  const calls: unknown[][] = [];
  Object.assign(source, {
    lire: (project: string) => (calls.push(["lire", project]), lire()),
    reglages: (project: string, id: string) => (calls.push(["reglages", project, id]), settings(id)),
    changer: (project: string, id: string, key: string, value: unknown) => (calls.push(["changer", project, id, key, value]), changer(id, key, value)),
    gestes: (project: string, id: string) => (calls.push(["gestes", project, id]), actions(id)),
  });
  return calls;
}

async function bloc(project = "parade") {
  const onglet = holdLesAgents(doc, { valeurs: () => ({ modeles: MODELES, efforts: EFFORTS }) });
  onglet.lire(project);
  for (let i = 0; i < 3; i++) await repos();
  return { onglet, element: onglet.element as unknown as Faux };
}
// Ce qu'un élément dit au survol, et à un lecteur d'écran : le détail d'une ligne d'erreur.
const auSurvol = (element: Faux): string => [element, ...element.descendants()].map(({ title, ariaLabel }) => `${title} ${ariaLabel}`).join(" ");
const cardDe = (element: Faux, name: string): Faux => element.dessous("article").find(({ ariaLabel }) => ariaLabel === name) ?? assert.fail(`pas de carte « ${name} »`);
const rangeeDe = (element: Faux, cle: string): Faux => [element, ...element.descendants()].find(({ dataset }) => dataset.cle === cle) ?? assert.fail(`pas de rangée « ${cle} »`);
const champDe = (rangee: Faux): Faux => [...rangee.dessous("input"), ...rangee.dessous("select")][0] ?? assert.fail("pas de champ");
async function changer(entree: Faux, valeur: string): Promise<void> {
  entree.value = valeur;
  entree.declencher("change");
  for (let i = 0; i < 3; i++) await repos();
}

test("a reading that is not a list, or an agent whose figure has no meaning, says the reading is not readable: no card is made up", async () => {
  for (const lu of [{ error: "boom" }, [agent("a1", { figures: [{ label: "passes", value: "9" } as never] })]]) {
    const calls = faux({ lire: async () => lu });
    const { element } = await bloc();
    assert.match(element.textContent, /^The agents' reading is not readable/, JSON.stringify(lu));
    assert.deepEqual(element.dessous("article"), []);
    assert.deepEqual(calls, [["lire", "parade"]], "aucun réglage n'est lu pour une lecture illisible");
  }
});

test("a reading that fails says the agents were not reached, its detail on hover", async () => {
  faux({ lire: () => Promise.reject(new Error("connect ECONNREFUSED")) });
  const { element } = await bloc();
  assert.match(element.textContent, /^The agents not reached\./);
  assert.match(auSurvol(element), /connect ECONNREFUSED/);
});

test("montrer reads the agents once per project: the same project shown again reads nothing more", async () => {
  const calls = faux();
  const onglet = holdLesAgents(doc);
  onglet.montrer("parade");
  onglet.montrer("parade");
  await repos();
  assert.equal(calls.filter(([quoi]) => quoi === "lire").length, 1);
  onglet.montrer("cantine");
  await repos();
  assert.equal(calls.filter(([quoi]) => quoi === "lire").length, 2);
});

test("each setting has its control: a number field for a limit, a list for the model and the autonomy, a switch for a yes / no; an unchanged one says no change", async () => {
  const champs = [
    champ("maxTurns", { kind: "number", value: 10 }),
    champ("model", { value: "sonnet" }),
    champ("autonomy", { value: "propose" }),
    champ("paused", { kind: "boolean", value: false }),
    champ("note", { value: "hello" }),
  ];
  faux({ reglages: async () => ({ fields: champs }) });
  const { element } = await bloc();
  const limit = champDe(rangeeDe(element, "maxTurns"));
  assert.deepEqual([limit.balise, limit.type, limit.value], ["input", "number", "10"]);
  const modele = champDe(rangeeDe(element, "model"));
  assert.equal(modele.balise, "select");
  assert.deepEqual(modele.children.map(({ value }) => value), [...MODELES]);
  assert.equal(modele.value, "sonnet");
  const niveau = champDe(rangeeDe(element, "autonomy"));
  assert.deepEqual(niveau.children.map(({ value }) => value), ["observe", "propose", "act"]);
  const note = champDe(rangeeDe(element, "note"));
  assert.deepEqual([note.balise, note.type], ["input", "text"]);
  const pause = rangeeDe(element, "paused");
  assert.deepEqual([...pause.dessous("input"), ...pause.dessous("select")], []);
  assert.equal(pause.dessous("button")[0]?.role, "switch");
  for (const { key } of champs) assert.doesNotMatch(rangeeDe(element, key).textContent, /changed/, `${key} n'a jamais changé`);
  assert.equal(cardDe(element, "agent-a1").dessous("span").find(({ textContent }) => textContent === "idle")?.className, "etat");
});

test("a change sends the value in its kind — a number for a limit, the text for a text, true for a switch turned on; a limit that is not a number is refused before any PUT", async () => {
  const champs = [champ("maxTurns", { kind: "number", value: 10 }), champ("note", { value: "hello" }), champ("paused", { kind: "boolean", value: false })];
  const calls = faux({ reglages: async () => ({ fields: champs }), changer: async (_, key, value) => ({ ...champs.find((un) => un.key === key), value }) });
  const { element } = await bloc();
  await changer(champDe(rangeeDe(element, "maxTurns")), "25");
  await changer(champDe(rangeeDe(element, "note")), "bye");
  (rangeeDe(element, "paused").dessous("button")[0] ?? assert.fail("pas d'interrupteur")).click();
  for (let i = 0; i < 3; i++) await repos();
  assert.deepEqual(
    calls.filter(([quoi]) => quoi === "changer"),
    [
      ["changer", "parade", "a1", "maxTurns", 25],
      ["changer", "parade", "a1", "note", "bye"],
      ["changer", "parade", "a1", "paused", true],
    ],
  );
  for (const saisie of ["", "twelve"]) {
    await changer(champDe(rangeeDe(element, "maxTurns")), saisie);
    assert.match(rangeeDe(element, "maxTurns").textContent, /a number is expected/, JSON.stringify(saisie));
  }
  assert.equal(calls.filter(([quoi]) => quoi === "changer").length, 3, "rien n'est parti pour une saisie qui n'est pas un nombre");
  assert.equal(champDe(rangeeDe(element, "maxTurns")).value, "25", "la valeur en vigueur reste");
});

test("while a change is on its way, its field shows the value sent, waits, and says it is saving", async () => {
  faux({ reglages: async () => ({ fields: [champ("maxTurns", { kind: "number", value: 10 })] }), changer: () => new Promise(() => undefined) });
  const { element } = await bloc();
  await changer(champDe(rangeeDe(element, "maxTurns")), "25");
  const entree = champDe(rangeeDe(element, "maxTurns"));
  assert.deepEqual([entree.value, entree.disabled], ["25", true]);
  assert.match(rangeeDe(element, "maxTurns").textContent, /Saving…/);
});

test("after a change, the other settings of the card stay as they were", async () => {
  const champs = [champ("maxTurns", { kind: "number", value: 10 }), champ("note", { value: "hello" })];
  faux({ reglages: async () => ({ fields: champs }), changer: async () => ({ ...champs[0], value: 25, changedAt: "2026-11-24T10:15:00.000Z", changedBy: "benoit" }) });
  const { element } = await bloc();
  await changer(champDe(rangeeDe(element, "maxTurns")), "25");
  assert.equal(champDe(rangeeDe(element, "note")).value, "hello");
  assert.match(rangeeDe(element, "maxTurns").textContent, /changed Nov 24, 10:15 UTC by benoit/);
});

test("a change the runtime answers with something that is not a field reads the settings again: the value shown is the runtime's", async () => {
  let lus = 0;
  const calls = faux({ reglages: async () => ({ fields: [champ("maxTurns", { kind: "number", value: lus++ === 0 ? 10 : 30 })] }), changer: async () => ({ ok: true }) });
  const { element } = await bloc();
  await changer(champDe(rangeeDe(element, "maxTurns")), "25");
  assert.equal(calls.filter(([quoi]) => quoi === "reglages").length, 2);
  assert.equal(champDe(rangeeDe(element, "maxTurns")).value, "30");
});

test("the gestures: the name says whether they are open, only its own card shows them, an issue is named, and a failed reading says so", async () => {
  const actions: Action[] = [
    { at: "2026-11-24T09:30:00.000Z", summary: "tidied the base", reason: "twenty merges since the last pass", issue: 4005 },
    { at: "2026-11-23T09:30:00.000Z", summary: "looked around", reason: "nothing asked", issue: null },
  ];
  faux({ lire: async () => [agent("a1"), agent("a2")], gestes: (id) => (id === "a1" ? Promise.resolve(actions) : Promise.reject(new Error("timeout"))) });
  const { element } = await bloc();
  const name = (qui: string) => cardDe(element, qui).dessous("button").find(({ textContent }) => textContent === qui) ?? assert.fail(`pas de nom « ${qui} »`);
  assert.equal(name("agent-a1").ariaExpanded, "false");
  name("agent-a1").click();
  for (let i = 0; i < 3; i++) await repos();
  assert.equal(name("agent-a1").ariaExpanded, "true");
  assert.equal(name("agent-a2").ariaExpanded, "false");
  assert.doesNotMatch(cardDe(element, "agent-a2").textContent, /tidied the base/);
  const lines = cardDe(element, "agent-a1").dessous("li").filter(({ textContent }) => /tidied|looked/.test(textContent));
  assert.deepEqual(
    lines.map(({ textContent }) => textContent),
    ["tidied the base — why: twenty merges since the last passNov 24, 09:30 UTC · #4005", "looked around — why: nothing askedNov 23, 09:30 UTC"],
  );
  name("agent-a2").click();
  for (let i = 0; i < 3; i++) await repos();
  assert.match(cardDe(element, "agent-a2").textContent, /Its gestures not reached\./);
  assert.match(auSurvol(cardDe(element, "agent-a2")), /timeout/);
  assert.doesNotMatch(element.textContent, /tidied the base/, "un seul fil ouvert");
});

// La vue entière : l'onglet Agents au centre.
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
async function ouvrir(stockage?: FauxStockage): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never, stockage === undefined ? {} : { stockage });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  for (let i = 0; i < 4; i++) await repos();
  return vue;
}
async function onglet(vue: Jouee, titre: string): Promise<void> {
  (vue.element("onglets-du-projet").children.find(({ textContent }) => textContent === titre) ?? assert.fail(`pas d'onglet « ${titre} »`)).click();
  for (let i = 0; i < 4; i++) await repos();
}

test("the Agents tab takes the middle, named as such, and reads the agents again each time it opens — not when another tab does", async () => {
  const calls = faux();
  const vue = await ouvrir();
  await onglet(vue, "Agents");
  const centre = vue.element("rail");
  assert.equal(centre.dataset.onglet, "agents");
  assert.equal(centre.ariaLabel, "The agents");
  assert.match(centre.textContent, /agent-a1/);
  const lectures = () => calls.filter(([quoi]) => quoi === "lire").length;
  assert.equal(lectures(), 1);
  await onglet(vue, "Rail");
  assert.equal(lectures(), 1, "Rail ne relit pas les agents");
  await onglet(vue, "Agents");
  assert.equal(lectures(), 2, "rouvert, l'onglet les relit");
});

test("the project remembers the Agents tab: reopened, it opens on it and reads its agents", async () => {
  const calls = faux();
  const stockage = new FauxStockage();
  stockage.setItem("brigade.onglets-des-projets", JSON.stringify({ parade: "agents" }));
  const vue = await ouvrir(stockage);
  assert.equal(vue.element("rail").dataset.onglet, "agents");
  assert.deepEqual(calls.slice(0, 1), [["lire", "parade"]]);
  assert.equal(vue.element("onglets-du-projet").children.find(({ textContent }) => textContent === "Agents")?.ariaSelected, "true");
});
