// Test d'acceptation gelé (#4224). Contrat que ces tests fixent, parce que le ticket le laisse ouvert : la vue lit le runtime par `fetch`
// sur les chemins du ticket (GET /api/agents, GET|PUT /api/agents/:id/settings, GET /api/agents/:id/gestures) ; les tests posent un faux
// `fetch` (globalThis) qui répond selon le contrat, d'où que la vue prenne sa base. L'onglet Agents est un titre du menu `onglets-du-projet` ;
// une carte est le plus petit élément qui porte le nom, le rôle, la prochaine passe et les chiffres de l'agent ; un réglage modifiable est
// un champ (input ou select) dans une rangée qui porte son libellé.
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
import { playTheVue, repos, type Fake, type Played, type Answers } from "../helpers/false-vue.ts";

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

type Field = { key: string; label: string; kind: string; value: unknown; source: string; editable: boolean; livesIn: string | null; changedAt: string | null; changedBy: string | null };
type Agent = { id: string; name: string; role: string; state: "idle" | "working" | "broken"; workingOn: number | null; nextRun: string; figures: { label: string; value: string; meaning: string }[]; settings: unknown };
type Action = { at: string; summary: string; reason: string; issue: number | null };
type Call = { methode: string; chemin: string; corps: unknown };

const field = (key: string, more: Partial<Field> = {}): Field => ({ key, label: `label of ${key}`, kind: "text", value: "v", source: "runtime", editable: true, livesIn: null, changedAt: null, changedBy: null, ...more });
const agent = (id: string, more: Partial<Agent> = {}): Agent => ({
  id,
  name: `agent-${id}`,
  role: `Role sentence of ${id}.`,
  state: "idle",
  workingOn: null,
  nextRun: `next run of ${id} in 3 h`,
  figures: [
    { label: `figure one of ${id}`, value: "12", meaning: `meaning one of ${id}` },
    { label: `figure two of ${id}`, value: "34 %", meaning: `meaning two of ${id}` },
  ],
  settings: {},
  ...more,
});

// Le faux du contrat du runtime (GET /api/agents, GET|PUT /api/agents/:id/settings, GET /api/agents/:id/gestures), posé en
// `fetch` : l'URL est lue par son chemin, d'où que la vue prenne sa base. Chaque appel est gardé.
function fakeRuntime(agents: Agent[], { reglages: settings = {}, gestes: actions = {}, put }: { reglages?: Record<string, Field[]>; gestes?: Record<string, Action[]>; put?: (id: string, body: { key: string; value: unknown }) => { status: number; corps: unknown } } = {}): Call[] {
  const calls: Call[] = [];
  const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  Object.assign(globalThis, {
    fetch: async (entry: unknown, options: { method?: string; body?: string } = {}) => {
      const url = new URL(typeof entry === "string" ? entry : entry instanceof URL ? entry.href : (entry as { url: string }).url, "http://runtime.test");
      const methode = (options.method ?? "GET").toUpperCase();
      const body = options.body === undefined ? undefined : JSON.parse(options.body);
      calls.push({ methode, chemin: url.pathname, corps: body });
      if (url.pathname === "/api/agents" && methode === "GET") return answer(200, agents);
      const [, id, what] = /^\/api\/agents\/([^/]+)\/(settings|gestures)$/.exec(url.pathname) ?? [];
      if (id === undefined) return answer(404, { error: "unknown" });
      if (what === "gestures") return answer(200, actions[id] ?? []);
      if (methode === "PUT") {
        const rendered = put?.(id, body) ?? { status: 400, corps: { reason: "no" } };
        return answer(rendered.status, rendered.corps);
      }
      return answer(200, { fields: settings[id] ?? [] });
    },
  });
  return calls;
}

async function open(answers: Partial<Answers> = {}): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }], ...answers } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const tabAgents = (vue: Played): Fake => vue.element("onglets-du-projet").children.find((pose) => pose.textContent.trim() === "Agents") ?? assert.fail("pas d'onglet Agents");
async function openAgents(vue: Played): Promise<void> {
  tabAgents(vue).click();
  for (let i = 0; i < 4; i++) await repos();
}

const visible = (node: Fake): boolean => {
  for (let pose: Fake | null = node; pose !== null; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const all = (vue: Played): Fake[] => vue.poses().filter(visible);
const shows = (node: Fake): string => (node.hidden ? "" : [...node.descendants()].some((threads) => threads.hidden) ? node.children.map(shows).join(" ") : node.textContent);
const textShows = (vue: Played): string =>
  vue
    .poses()
    .filter((pose) => pose.parentElement === null && !pose.hidden)
    .map(shows)
    .join("\n");
// Le plus petit élément montré dont le texte contient tout ce qui est dit.
const moreSmall = (vue: Played, ...texts: string[]): Fake => {
  const found = all(vue).filter((pose) => texts.every((text) => pose.textContent.includes(text)));
  assert.ok(found.length > 0, `rien de montré ne porte ${JSON.stringify(texts)}`);
  return found.reduce((small, pose) => (pose.textContent.length < small.textContent.length ? pose : small));
};
const card = (vue: Played, a: Agent): Fake => moreSmall(vue, a.name, a.role);
// Un clic sur un agent : sur son nom, puis sur ce qui le porte, jusqu'à ce que ses gestes aient été demandés.
async function clickOnTheAgent(vue: Played, calls: Call[], a: Agent): Promise<void> {
  const path: Fake[] = [];
  for (let pose: Fake | null = moreSmall(vue, a.name); pose !== null && !pose.hidden; pose = pose.parentElement) path.push(pose);
  for (const pose of path) {
    pose.click();
    for (let i = 0; i < 3; i++) await repos();
    if (calls.some(({ chemin: request }) => request === `/api/agents/${a.id}/gestures`)) return;
  }
}
const atTheRow = (vue: Played, a: Agent, key: Field): Fake => {
  const inside = card(vue, a);
  const found = [inside, ...inside.descendants()].filter((pose) => pose.textContent.includes(key.label) && (key.editable ? pose.dessous("input").length + pose.dessous("select").length > 0 : true));
  assert.ok(found.length > 0, `pas de rangée « ${key.label} » sur la carte`);
  return found.reduce((small, pose) => (pose.textContent.length < small.textContent.length ? pose : small));
};

const ENTRY = (vue: Played, a: Agent, key: Field) => {
  const row = atTheRow(vue, a, key);
  return { rangee: row, entree: [...row.dessous("input"), ...row.dessous("select")][0] ?? assert.fail("pas de champ") };
};
// Le chef change la valeur et la valide : l'événement `change`, et un bouton qui applique s'il y en a un.
async function change(vue: Played, a: Agent, key: Field, value: string): Promise<void> {
  const { rangee: row, entree: entry } = ENTRY(vue, a, key);
  entry.value = value;
  entry.declencher("input");
  entry.declencher("change");
  for (let i = 0; i < 3; i++) await repos();
  const button = row.dessous("button").find(({ textContent }) => /^(save|apply|ok|set)$/i.test(textContent.trim()));
  if (button !== undefined) {
    button.click();
    for (let i = 0; i < 3; i++) await repos();
  }
}
const DAY = /2026-11-24|Nov(ember)? 24|24 Nov|24\/11\/2026|11\/24\/2026/;

// #4224, critère 5 : un réglage modifiable se change depuis la carte ; un changement valide appelle PUT et montre la nouvelle valeur, avec changedAt et changedBy.
test("each editable setting can be changed from the card: a valid change calls PUT and shows the new value with its changedAt and changedBy", async () => {
  const a = agent("a1");
  const limit = field("maxTurns", { label: "turn limit", kind: "number", value: 10 });
  const other = field("model", { label: "model", value: "sonnet" });
  const rendered = { ...limit, value: 25, changedAt: "2026-11-24T10:15:00.000Z", changedBy: "benoit" };
  const calls = fakeRuntime([a], { reglages: { a1: [limit, other] }, put: () => ({ status: 200, corps: rendered }) });
  const vue = await open();
  await openAgents(vue);
  assert.equal(ENTRY(vue, a, limit).entree.value, "10", "la valeur en vigueur est dans le champ");
  assert.ok(ENTRY(vue, a, other).entree, "chaque réglage modifiable a son champ");
  await change(vue, a, limit, "25");
  const puts = calls.filter(({ methode }) => methode === "PUT");
  assert.equal(puts.length, 1, "un seul PUT");
  assert.equal(puts[0]?.chemin, "/api/agents/a1/settings");
  const body = puts[0]?.corps as { key: string; value: unknown };
  assert.equal(body.key, "maxTurns");
  assert.equal(String(body.value), "25");
  const after = atTheRow(vue, a, limit);
  assert.ok(ENTRY(vue, a, limit).entree.value === "25" || after.textContent.includes("25"), "la nouvelle valeur est montrée");
  assert.ok(after.textContent.includes("benoit"), "qui l'a changée");
  assert.match(after.textContent, DAY, "quand elle a été changée");
});
