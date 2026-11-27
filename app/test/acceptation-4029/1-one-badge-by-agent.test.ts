// Test d'acceptation gelé (#4029). La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : les données des agents passent par UN petit module,
// `app/src/vue/autonomy/source.js`, qui exporte l'objet `source` — `source.lire()` rend les enregistrements du ticket (un
// par agent), `source.regler(agent, niveau)` change le niveau d'autonomie, `source.approuver(agent, id)` approuve un geste
// en attente. La vue appelle ces trois méthodes par l'objet, à chaque usage : le test les remplace par un faux. Un badge est
// un `button` dont le texte commence par le nom de l'agent ; un niveau se règle par un `button` qui porte son nom.
import assert from "node:assert/strict";
import { test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { source } from "../../src/vue/autonomy/source.js";
import { playTheVue, repos, type Fake, type Played } from "../helpers/false-vue.ts";

const A = "2026-11-23T12:04:12.000Z";
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

type Level = "observe" | "propose" | "act";
type Agent = {
  agent: string;
  state: string;
  lastGesture: { line: string; at: string };
  nextRun: { text: string; at: string };
  thread: string;
  autonomy: Level;
  counters: { fixedBySelf: number; handedToChef: number };
  gestures: { at: string; line: string; reason: string; outcome: string }[];
  pending: { id: string; line: string }[];
};
const agent = (name: string, more: Partial<Agent> = {}): Agent => ({
  agent: name,
  state: `state-of-${name}`,
  lastGesture: { line: `last gesture of ${name}`, at: "2026-11-23T09:30:00.000Z" },
  nextRun: { text: `${name}: next pass in 3 h`, at: "2026-11-23T15:00:00.000Z" },
  thread: `thread-${name}`,
  autonomy: "observe",
  counters: { fixedBySelf: 0, handedToChef: 0 },
  gestures: [],
  pending: [],
  ...more,
});

// Ce que le faux module rend, et les appels qu'il a reçus. Le faux tient son état : après un réglage ou une approbation, une
// relecture rend la même chose que la vue aurait montrée d'elle-même.
function fakeModule(enregistrements: Agent[]) {
  const state = structuredClone(enregistrements);
  const settings: unknown[][] = [];
  const approvals: unknown[][] = [];
  Object.assign(source, {
    lire: async () => structuredClone(state),
    regler: async (name: string, level: Level) => {
      settings.push([name, level]);
      const target = state.find((recording) => recording.agent === name);
      if (target !== undefined) target.autonomy = level;
    },
    approuver: async (name: string, id: string) => {
      approvals.push([name, id]);
      const target = state.find((recording) => recording.agent === name);
      if (target !== undefined) target.pending = target.pending.filter((action) => action.id !== id);
    },
  });
  return { reglages: settings, approbations: approvals };
}

let barBefore = -1;
async function open(): Promise<Played> {
  const facts = { etat: "ouverte", lu: "2026-11-23T12:04:11.000Z", dernierTick: "2026-11-23T12:04:11.000Z", compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [] };
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  barBefore = vue.element("projets").children.length;
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  const receivedOne = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...receivedOne, demande: requests.at(-1)?.args[0] as number });
  await repos();
  return vue;
}

const visible = (node: Fake): boolean => {
  for (let pose: Fake | null = node; pose !== null; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
// Le texte montré d'un nœud : ce qui est caché dessous n'y est pas.
const shows = (node: Fake): string => (node.hidden ? "" : [...node.descendants()].some((threads) => threads.hidden) ? node.children.map(shows).join(" ") : node.textContent);
const all = (vue: Played): Fake[] => vue.poses().filter(visible);
const textShows = (vue: Played): string =>
  vue
    .poses()
    .filter((pose) => pose.parentElement === null && !pose.hidden)
    .map(shows)
    .join("\n");
const badges = (vue: Played, name: string): Fake[] => all(vue).filter((pose) => pose.balise === "button" && pose.textContent.trim().toLowerCase().startsWith(name));
const path = (node: Fake): number[] => {
  const hints: number[] = [];
  for (let pose = node; pose.parentElement !== null; pose = pose.parentElement) hints.unshift(pose.parentElement.children.indexOf(pose));
  return hints;
};
const before = (a: Fake, b: Fake): boolean => {
  const [x, y] = [path(a), path(b)];
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return (x[i] as number) < (y[i] as number);
  return x.length < y.length;
};
const badge = (vue: Played, name: string): Fake => {
  const found = badges(vue, name);
  assert.equal(found.length, 1, `un seul badge « ${name} »`);
  return found[0] as Fake;
};
const chosen = (button: Fake): boolean => button.ariaPressed === "true" || button.ariaChecked === "true" || button.ariaSelected === "true" || button.ariaCurrent !== "" || /\b(on|actif|active|selected|choisi|current)\b/.test(button.className);
const level = (vue: Played, name: Level): Fake => {
  const found = all(vue).filter((pose) => pose.balise === "button" && pose.textContent.trim().toLowerCase() === name);
  assert.equal(found.length, 1, `un seul bouton « ${name} »`);
  return found[0] as Fake;
};
const allTheAgents = (): Agent[] => [
  agent("manager"),
  agent("pass"),
  agent("cook-4001"),
  agent("closer"),
  agent("cook-4002"),
  agent("supervisor"),
];

// #4029, critère 1 : le haut de la vue du projet montre un badge par agent, dans la vue existante ; supervisor et closer d'abord.
test("the top of the project view shows one badge per agent, supervisor and closer first, on no new screen", async () => {
  fakeModule(allTheAgents());
  const vue = await open();
  assert.equal(vue.element("projets").children.length, barBefore, "no new bar entry: no new screen");
  assert.equal(vue.element("onglets-du-projet").hidden, false, "la vue du projet est celle qui est montrée");
  const names = ["supervisor", "closer", "manager", "pass", "cook-4001", "cook-4002"];
  const found = names.map((name) => badge(vue, name));
  assert.ok(before(found[0] as Fake, found[1] as Fake), "supervisor avant closer");
  for (const other of found.slice(2)) assert.ok(before(found[1] as Fake, other), "closer avant les autres");
  assert.ok(found.every((pose) => pose.parentElement !== null), "chaque badge est posé dans la page");
});
