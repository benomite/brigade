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
import { jouerLaVue, repos, type Faux, type Jouee, type Answers } from "../aides/fausse-vue.ts";

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

const signes = (racine: Faux): string => [racine, ...racine.descendants()].map((pose) => `${pose.className}/${pose.ariaLabel}/${pose.ariaCurrent}/${pose.ariaSelected}/${pose.dataset.etat ?? ""}`).join("|");

// #4224, critère 4 : « working on #N » avec le numéro de l'issue ; un agent broken se voit autrement qu'un agent idle.
test("an agent in state 'working' shows 'working on #N' with its issue number; a 'broken' agent is visibly different from an idle one", async () => {
  const calme = agent("a1");
  const actif = agent("a2", { state: "working", workingOn: 4101 });
  const casse = agent("a3", { state: "broken" });
  fauxRuntime([calme, actif, casse]);
  const vue = await ouvrir();
  await ouvrirAgents(vue);
  assert.match(card(vue, actif).textContent, /working on #4101/);
  assert.doesNotMatch(card(vue, calme).textContent, /working on #/);
  assert.doesNotMatch(card(vue, casse).textContent, /working on #/);
  assert.match(card(vue, casse).textContent, /broken/i, "un agent cassé le dit");
  assert.doesNotMatch(card(vue, calme).textContent, /broken/i);
  assert.notEqual(signes(card(vue, calme)), signes(card(vue, casse)), "la carte cassée porte une classe ou un signe que l'inactive n'a pas : elle se voit");
});
