// Test d'acceptation gelé (#4029). La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : les données des agents passent par UN petit module,
// `app/src/vue/autonomy/source.js`, qui exporte l'objet `source` — `source.lire()` rend les enregistrements du ticket (un
// par agent), `source.regler(agent, niveau)` change le niveau d'autonomie, `source.approuver(agent, id)` approuve un geste
// en attente. La vue appelle ces trois méthodes par l'objet, à chaque usage : le test les remplace par un faux. Un badge est
// un `button` dont le texte commence par le nom de l'agent ; un niveau se règle par un `button` qui porte son nom.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE, holdFacts } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { source } from "../../src/vue/autonomy/source.js";
import { jouerLaVue, repos, type Faux, type Jouee } from "../aides/fausse-vue.ts";

const A = "2026-11-23T12:04:12.000Z";
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

type Niveau = "observe" | "propose" | "act";
type Agent = {
  agent: string;
  state: string;
  lastGesture: { line: string; at: string };
  nextRun: { text: string; at: string };
  thread: string;
  autonomy: Niveau;
  counters: { fixedBySelf: number; handedToChef: number };
  gestures: { at: string; line: string; reason: string; outcome: string }[];
  pending: { id: string; line: string }[];
};
const agent = (name: string, plus: Partial<Agent> = {}): Agent => ({
  agent: name,
  state: `state-of-${name}`,
  lastGesture: { line: `last gesture of ${name}`, at: "2026-11-23T09:30:00.000Z" },
  nextRun: { text: `${name}: next pass in 3 h`, at: "2026-11-23T15:00:00.000Z" },
  thread: `thread-${name}`,
  autonomy: "observe",
  counters: { fixedBySelf: 0, handedToChef: 0 },
  gestures: [],
  pending: [],
  ...plus,
});

// Ce que le faux module rend, et les appels qu'il a reçus. Le faux tient son état : après un réglage ou une approbation, une
// relecture rend la même chose que la vue aurait montrée d'elle-même.
function fauxModule(enregistrements: Agent[]) {
  const state = structuredClone(enregistrements);
  const settings: unknown[][] = [];
  const approbations: unknown[][] = [];
  Object.assign(source, {
    lire: async () => structuredClone(state),
    regler: async (name: string, niveau: Niveau) => {
      settings.push([name, niveau]);
      const cible = state.find((enregistrement) => enregistrement.agent === name);
      if (cible !== undefined) cible.autonomy = niveau;
    },
    approuver: async (name: string, id: string) => {
      approbations.push([name, id]);
      const cible = state.find((enregistrement) => enregistrement.agent === name);
      if (cible !== undefined) cible.pending = cible.pending.filter((action) => action.id !== id);
    },
  });
  return { reglages: settings, approbations };
}

let barAvant = -1;
async function ouvrir(): Promise<Jouee> {
  const facts = { etat: "ouverte", lu: "2026-11-23T12:04:11.000Z", dernierTick: "2026-11-23T12:04:11.000Z", compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [] };
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  barAvant = vue.element("projets").children.length;
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  const recue = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...recue, demande: demandes.at(-1)?.args[0] as number });
  await repos();
  return vue;
}

const visible = (noeud: Faux): boolean => {
  for (let pose: Faux | null = noeud; pose !== null; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
// Le texte montré d'un nœud : ce qui est caché dessous n'y est pas.
const montre = (noeud: Faux): string => (noeud.hidden ? "" : [...noeud.descendants()].some((fils) => fils.hidden) ? noeud.children.map(montre).join(" ") : noeud.textContent);
const tout = (vue: Jouee): Faux[] => vue.poses().filter(visible);
const texteMontre = (vue: Jouee): string =>
  vue
    .poses()
    .filter((pose) => pose.parentElement === null && !pose.hidden)
    .map(montre)
    .join("\n");
const badges = (vue: Jouee, name: string): Faux[] => tout(vue).filter((pose) => pose.balise === "button" && pose.textContent.trim().toLowerCase().startsWith(name));
const chemin = (noeud: Faux): number[] => {
  const indices: number[] = [];
  for (let pose = noeud; pose.parentElement !== null; pose = pose.parentElement) indices.unshift(pose.parentElement.children.indexOf(pose));
  return indices;
};
const avant = (a: Faux, b: Faux): boolean => {
  const [x, y] = [chemin(a), chemin(b)];
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return (x[i] as number) < (y[i] as number);
  return x.length < y.length;
};
const badge = (vue: Jouee, name: string): Faux => {
  const trouves = badges(vue, name);
  assert.equal(trouves.length, 1, `un seul badge « ${name} »`);
  return trouves[0] as Faux;
};
const choisi = (button: Faux): boolean => button.ariaPressed === "true" || button.ariaChecked === "true" || button.ariaSelected === "true" || button.ariaCurrent !== "" || /\b(on|actif|active|selected|choisi|current)\b/.test(button.className);
const niveau = (vue: Jouee, name: Niveau): Faux => {
  const trouves = tout(vue).filter((pose) => pose.balise === "button" && pose.textContent.trim().toLowerCase() === name);
  assert.equal(trouves.length, 1, `un seul bouton « ${name} »`);
  return trouves[0] as Faux;
};
const tousLesAgents = (): Agent[] => [
  agent("manager"),
  agent("pass"),
  agent("cook-4001"),
  agent("closer"),
  agent("cook-4002"),
  agent("supervisor"),
];

// #4029, critère 1 : le haut de la vue du projet montre un badge par agent, dans la vue existante ; supervisor et closer d'abord.
test("the top of the project view shows one badge per agent, supervisor and closer first, on no new screen", async () => {
  fauxModule(tousLesAgents());
  const vue = await ouvrir();
  assert.equal(vue.element("projets").children.length, barAvant, "no new bar entry: no new screen");
  assert.equal(vue.element("onglets-du-projet").hidden, false, "la vue du projet est celle qui est montrée");
  const noms = ["supervisor", "closer", "manager", "pass", "cook-4001", "cook-4002"];
  const trouves = noms.map((name) => badge(vue, name));
  assert.ok(avant(trouves[0] as Faux, trouves[1] as Faux), "supervisor avant closer");
  for (const autre of trouves.slice(2)) assert.ok(avant(trouves[1] as Faux, autre), "closer avant les autres");
  assert.ok(trouves.every((pose) => pose.parentElement !== null), "chaque badge est posé dans la page");
});
