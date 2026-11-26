// Test d'acceptation gelé (#4029). La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : les données des agents passent par UN petit module,
// `app/src/vue/autonomie/source.js`, qui exporte l'objet `source` — `source.lire()` rend les enregistrements du ticket (un
// par agent), `source.regler(agent, niveau)` change le niveau d'autonomie, `source.approuver(agent, id)` approuve un geste
// en attente. La vue appelle ces trois méthodes par l'objet, à chaque usage : le test les remplace par un faux. Un badge est
// un `button` dont le texte commence par le nom de l'agent ; un niveau se règle par un `button` qui porte son nom.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { source } from "../../src/vue/autonomie/source.js";
import { jouerLaVue, repos, type Faux, type Jouee } from "../aides/fausse-vue.ts";

const A = "2026-11-23T12:04:12.000Z";
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
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
const agent = (nom: string, plus: Partial<Agent> = {}): Agent => ({
  agent: nom,
  state: `state-of-${nom}`,
  lastGesture: { line: `last gesture of ${nom}`, at: "2026-11-23T09:30:00.000Z" },
  nextRun: { text: `${nom}: next pass in 3 h`, at: "2026-11-23T15:00:00.000Z" },
  thread: `thread-${nom}`,
  autonomy: "observe",
  counters: { fixedBySelf: 0, handedToChef: 0 },
  gestures: [],
  pending: [],
  ...plus,
});

// Ce que le faux module rend, et les appels qu'il a reçus. Le faux tient son état : après un réglage ou une approbation, une
// relecture rend la même chose que la vue aurait montrée d'elle-même.
function fauxModule(enregistrements: Agent[]) {
  const etat = structuredClone(enregistrements);
  const reglages: unknown[][] = [];
  const approbations: unknown[][] = [];
  Object.assign(source, {
    lire: async () => structuredClone(etat),
    regler: async (nom: string, niveau: Niveau) => {
      reglages.push([nom, niveau]);
      const cible = etat.find((enregistrement) => enregistrement.agent === nom);
      if (cible !== undefined) cible.autonomy = niveau;
    },
    approuver: async (nom: string, id: string) => {
      approbations.push([nom, id]);
      const cible = etat.find((enregistrement) => enregistrement.agent === nom);
      if (cible !== undefined) cible.pending = cible.pending.filter((geste) => geste.id !== id);
    },
  });
  return { reglages, approbations };
}

let barreAvant = -1;
async function ouvrir(): Promise<Jouee> {
  const faits = { etat: "ouverte", lu: "2026-11-23T12:04:11.000Z", dernierTick: "2026-11-23T12:04:11.000Z", compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [] };
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  barreAvant = vue.element("projets").children.length;
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
  const recue = tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
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
const badges = (vue: Jouee, nom: string): Faux[] => tout(vue).filter((pose) => pose.balise === "button" && pose.textContent.trim().toLowerCase().startsWith(nom));
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
const badge = (vue: Jouee, nom: string): Faux => {
  const trouves = badges(vue, nom);
  assert.equal(trouves.length, 1, `un seul badge « ${nom} »`);
  return trouves[0] as Faux;
};
const choisi = (bouton: Faux): boolean => bouton.ariaPressed === "true" || bouton.ariaChecked === "true" || bouton.ariaSelected === "true" || bouton.ariaCurrent !== "" || /\b(on|actif|active|selected|choisi|current)\b/.test(bouton.className);
const niveau = (vue: Jouee, nom: Niveau): Faux => {
  const trouves = tout(vue).filter((pose) => pose.balise === "button" && pose.textContent.trim().toLowerCase() === nom);
  assert.equal(trouves.length, 1, `un seul bouton « ${nom} »`);
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
  assert.equal(vue.element("projets").children.length, barreAvant, "no new bar entry: no new screen");
  assert.equal(vue.element("onglets-du-projet").hidden, false, "la vue du projet est celle qui est montrée");
  const noms = ["supervisor", "closer", "manager", "pass", "cook-4001", "cook-4002"];
  const trouves = noms.map((nom) => badge(vue, nom));
  assert.ok(avant(trouves[0] as Faux, trouves[1] as Faux), "supervisor avant closer");
  for (const autre of trouves.slice(2)) assert.ok(avant(trouves[1] as Faux, autre), "closer avant les autres");
  assert.ok(trouves.every((pose) => pose.parentElement !== null), "chaque badge est posé dans la page");
});
