// Test d'acceptation gelé (#4224). Contrat que ces tests fixent, parce que le ticket le laisse ouvert : la vue lit le runtime par `fetch`
// sur les chemins du ticket (GET /api/agents, GET|PUT /api/agents/:id/settings, GET /api/agents/:id/gestures) ; les tests posent un faux
// `fetch` (globalThis) qui répond selon le contrat, d'où que la vue prenne sa base. L'onglet Agents est un titre du menu `onglets-du-projet` ;
// une carte est le plus petit élément qui porte le nom, le rôle, la prochaine passe et les chiffres de l'agent ; un réglage modifiable est
// un champ (input ou select) dans une rangée qui porte son libellé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { source } from "../../src/vue/autonomy/source.js";
import { jouerLaVue, ouvrirRead, repos, type Faux, type Jouee, type Answers } from "../aides/fausse-vue.ts";

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

type Champ = { key: string; label: string; kind: string; value: unknown; source: string; editable: boolean; livesIn: string | null; changedAt: string | null; changedBy: string | null };
type Agent = { id: string; name: string; role: string; state: "idle" | "working" | "broken"; workingOn: number | null; nextRun: string; figures: { label: string; value: string; meaning: string }[]; settings: unknown };
type Action = { at: string; summary: string; reason: string; issue: number | null };
type Call = { methode: string; chemin: string; corps: unknown };

const champ = (key: string, plus: Partial<Champ> = {}): Champ => ({ key, label: `label of ${key}`, kind: "text", value: "v", source: "runtime", editable: true, livesIn: null, changedAt: null, changedBy: null, ...plus });
const agent = (id: string, plus: Partial<Agent> = {}): Agent => ({
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
  ...plus,
});

// Le faux du contrat du runtime (GET /api/agents, GET|PUT /api/agents/:id/settings, GET /api/agents/:id/gestures), posé en
// `fetch` : l'URL est lue par son chemin, d'où que la vue prenne sa base. Chaque appel est gardé.
function fauxRuntime(agents: Agent[], { reglages: settings = {}, gestes: actions = {}, put }: { reglages?: Record<string, Champ[]>; gestes?: Record<string, Action[]>; put?: (id: string, corps: { key: string; value: unknown }) => { status: number; corps: unknown } } = {}): Call[] {
  const calls: Call[] = [];
  const answer = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });
  Object.assign(globalThis, {
    fetch: async (entree: unknown, options: { method?: string; body?: string } = {}) => {
      const url = new URL(typeof entree === "string" ? entree : entree instanceof URL ? entree.href : (entree as { url: string }).url, "http://runtime.test");
      const methode = (options.method ?? "GET").toUpperCase();
      const corps = options.body === undefined ? undefined : JSON.parse(options.body);
      calls.push({ methode, chemin: url.pathname, corps });
      if (url.pathname === "/api/agents" && methode === "GET") return answer(200, agents);
      const [, id, quoi] = /^\/api\/agents\/([^/]+)\/(settings|gestures)$/.exec(url.pathname) ?? [];
      if (id === undefined) return answer(404, { error: "unknown" });
      if (quoi === "gestures") return answer(200, actions[id] ?? []);
      if (methode === "PUT") {
        const rendu = put?.(id, corps) ?? { status: 400, corps: { reason: "no" } };
        return answer(rendu.status, rendu.corps);
      }
      return answer(200, { fields: settings[id] ?? [] });
    },
  });
  return calls;
}

async function ouvrir(answers: Partial<Answers> = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }], ...answers } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const ongletAgents = (vue: Jouee): Faux => vue.element("onglets-du-projet").children.find((pose) => pose.textContent.trim() === "Agents") ?? assert.fail("pas d'onglet Agents");
async function ouvrirAgents(vue: Jouee): Promise<void> {
  ongletAgents(vue).click();
  for (let i = 0; i < 4; i++) await repos();
}

const visible = (noeud: Faux): boolean => {
  for (let pose: Faux | null = noeud; pose !== null; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const tout = (vue: Jouee): Faux[] => vue.poses().filter(visible);
const montre = (noeud: Faux): string => (noeud.hidden ? "" : [...noeud.descendants()].some((fils) => fils.hidden) ? noeud.children.map(montre).join(" ") : noeud.textContent);
const texteMontre = (vue: Jouee): string =>
  vue
    .poses()
    .filter((pose) => pose.parentElement === null && !pose.hidden)
    .map(montre)
    .join("\n");
// Le plus petit élément montré dont le texte contient tout ce qui est dit.
const plusPetit = (vue: Jouee, ...textes: string[]): Faux => {
  const trouves = tout(vue).filter((pose) => textes.every((texte) => pose.textContent.includes(texte)));
  assert.ok(trouves.length > 0, `rien de montré ne porte ${JSON.stringify(textes)}`);
  return trouves.reduce((petit, pose) => (pose.textContent.length < petit.textContent.length ? pose : petit));
};
const card = (vue: Jouee, a: Agent): Faux => plusPetit(vue, a.name, a.role);
// Un clic sur un agent : sur son nom, puis sur ce qui le porte, jusqu'à ce que ses gestes aient été demandés.
async function cliquerSurLAgent(vue: Jouee, calls: Call[], a: Agent): Promise<void> {
  const chemin: Faux[] = [];
  for (let pose: Faux | null = plusPetit(vue, a.name); pose !== null && !pose.hidden; pose = pose.parentElement) chemin.push(pose);
  for (const pose of chemin) {
    pose.click();
    for (let i = 0; i < 3; i++) await repos();
    if (calls.some(({ chemin: request }) => request === `/api/agents/${a.id}/gestures`)) return;
  }
}
const aLaRangee = (vue: Jouee, a: Agent, cle: Champ): Faux => {
  const dans = card(vue, a);
  const trouvees = [dans, ...dans.descendants()].filter((pose) => pose.textContent.includes(cle.label) && (cle.editable ? pose.dessous("input").length + pose.dessous("select").length > 0 : true));
  assert.ok(trouvees.length > 0, `pas de rangée « ${cle.label} » sur la carte`);
  return trouvees.reduce((petit, pose) => (pose.textContent.length < petit.textContent.length ? pose : petit));
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
const unAgent4029 = (name: string) => ({
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
  const calls = fauxRuntime(agents);
  Object.assign(source, {
    lire: async () => ["manager", "closer", "pass"].map(unAgent4029),
    regler: async () => {},
    approuver: async () => {},
  });
  const vue = await ouvrir({ closerDeSante: async () => CLOSER } as never);
  // Settings, où le closer montrait ses chiffres : la passe est là, ce qu'elle a retiré n'y est plus.
  await ouvrirRead(vue, "Settings");
  for (let i = 0; i < 3; i++) await repos();
  assert.doesNotMatch(vue.element("bandeau-sante").textContent, /1,234/, "les lignes retirées par une passe du closer ne sont plus montrées");
  assert.doesNotMatch(vue.element("bandeau-sante").textContent, /\+56 added/, "ni ce qu'elle a ajouté");
  // Un badge de #4029 : un bouton dont le texte commence par le nom de l'agent. Son clic ouvre l'onglet Agents.
  const badge = tout(vue).filter((pose) => pose.balise === "button" && pose.textContent.trim().toLowerCase().startsWith("closer"));
  assert.equal(badge.length, 1, "le badge du closer reste");
  badge[0]?.click();
  for (let i = 0; i < 4; i++) await repos();
  assert.ok(calls.some(({ methode, chemin }) => methode === "GET" && chemin === "/api/agents"), "l'onglet Agents lit les agents");
  const texte = texteMontre(vue);
  for (const a of agents) assert.ok(texte.includes(a.name) && texte.includes(a.role), `la carte de ${a.id} est montrée`);
});
