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
import { source } from "../../src/vue/autonomy/source.js";
import { playTheVue, openRead, repos, type Fake, type Played, type Answers } from "../helpers/false-vue.ts";

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
      const method = (options.method ?? "GET").toUpperCase();
      const body = options.body === undefined ? undefined : JSON.parse(options.body);
      calls.push({ methode: method, chemin: url.pathname, corps: body });
      if (url.pathname === "/api/agents" && method === "GET") return answer(200, agents);
      const [, id, what] = /^\/api\/agents\/([^/]+)\/(settings|gestures)$/.exec(url.pathname) ?? [];
      if (id === undefined) return answer(404, { error: "unknown" });
      if (what === "gestures") return answer(200, actions[id] ?? []);
      if (method === "PUT") {
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

// Le closer lu sur GitHub (#2491) : une passe mergée qui a retiré 1 234 lignes — le chiffre que Settings montre aujourd'hui.
const CLOSER = {
  passes: {
    liste: [
      { numero: 2477, url: "https://github.com/chef/parade/issues/2477", ouverteLe: "2026-10-08T08:00:00.000Z", ouverte: false, sha: "9f3c2a17b4e0", candidats: [], restants: 0, derive: [], temps: [], pr: { numero: 2480, url: "https://github.com/chef/parade/pull/2480", mergee: true, retirees: 1234, ajoutees: 56 } },
    ],
  },
  verifications: { liste: [] },
  reglages: { liste: [] },
};
const oneAgent4029 = (name: string) => ({
  agent: name,
  state: `state-of-${name}`,
  lastGesture: { line: `last gesture of ${name}`, at: "2026-11-23T09:30:00.000Z" },
  nextRun: { text: `${name}: next pass in 3 h`, at: "2026-11-23T15:00:00.000Z" },
  thread: `thread-${name}`,
  autonomy: "observe",
  counters: { fixedBySelf: 0, handedToChef: 0 },
  gestures: [],
  pending: [],
});

// #4224, critère 9 : les anciens chiffres du closer ne sont plus dans la vue du projet, et un clic sur un badge de #4029 ouvre l'onglet Agents.
test("the closer's old figures no longer show in the project view, and a click on a badge of #4029 opens this tab", async () => {
  const agents = [agent("a1"), agent("a2")];
  const calls = fakeRuntime(agents);
  Object.assign(source, {
    lire: async () => ["manager", "closer", "pass"].map(oneAgent4029),
    regler: async () => {},
    approuver: async () => {},
  });
  const vue = await open({ closerDeSante: async () => CLOSER } as never);
  // Settings, où le closer montrait ses chiffres : la passe est là, ce qu'elle a retiré n'y est plus.
  await openRead(vue, "Settings");
  for (let i = 0; i < 3; i++) await repos();
  assert.doesNotMatch(vue.element("bandeau-sante").textContent, /1,234/, "les lignes retirées par une passe du closer ne sont plus montrées");
  assert.doesNotMatch(vue.element("bandeau-sante").textContent, /\+56 added/, "ni ce qu'elle a ajouté");
  // Un badge de #4029 : un bouton dont le texte commence par le nom de l'agent. Son clic ouvre l'onglet Agents.
  const badge = all(vue).filter((pose) => pose.balise === "button" && pose.textContent.trim().toLowerCase().startsWith("closer"));
  assert.equal(badge.length, 1, "le badge du closer reste");
  badge[0]?.click();
  for (let i = 0; i < 4; i++) await repos();
  assert.ok(calls.some(({ methode: method, chemin: path }) => method === "GET" && path === "/api/agents"), "l'onglet Agents lit les agents");
  const text = textShows(vue);
  for (const a of agents) assert.ok(text.includes(a.name) && text.includes(a.role), `la carte de ${a.id} est montrée`);
});
