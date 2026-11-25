// Ce que l'onglet Agents (#4224) remplace dans la page d'un projet : les badges de l'équipe (#4029) restent, et un clic sur
// l'un d'eux ouvre cet onglet, sur les gestes de son agent ; les anciens chiffres du closer — ce qu'il a fait, ses passes et
// les lignes que chacune a retirées, dans Settings — ne s'y montrent plus.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import type { LectureDuCloser } from "../../src/closer-sante.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { source } from "../../src/vue/agents/source.js";
import { source as sourceDeLEquipe } from "../../src/vue/autonomie/source.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirLecture, type Reponses, repos } from "../aides/fausse-vue.ts";
import { fausseApi } from "./faux-api.ts";

const A = "2026-11-25T12:04:12.000Z";
const VRAIES = { demander: source.demander, lire: sourceDeLEquipe.lire };
afterEach(() => {
  source.demander = VRAIES.demander;
  sourceDeLEquipe.lire = VRAIES.lire;
});

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
async function ouvrir(plus: Partial<Reponses> = {}): Promise<Jouee> {
  const faits = { etat: "ouverte", lu: "2026-11-25T12:04:11.000Z", dernierTick: "2026-11-25T12:04:11.000Z", compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [] };
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }], ...plus } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
  const recue = tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: demandes.at(-1)?.args[0] as number });
  await repos();
  return vue;
}

// Un enregistrement de l'équipe, tel que le badge de #4029 le lit (autonomie/source.js).
const membre = (agent: string) => ({
  agent,
  state: "idle",
  lastGesture: { line: `last gesture of ${agent}`, at: "2026-11-25T09:30:00.000Z" },
  nextRun: { text: `${agent}: next pass in 3 h`, at: "2026-11-25T15:00:00.000Z" },
  thread: `thread-${agent}`,
  autonomy: "observe",
  counters: { fixedBySelf: 0, handedToChef: 0 },
  gestures: [],
  pending: [],
});

const parClasse = (racine: Faux, classe: string) => [...racine.descendants()].filter(({ className }) => className.split(" ").includes(classe));

test("un clic sur un badge de l'équipe (#4029) ouvre l'onglet Agents, sur les gestes de son agent", async () => {
  const { demandes } = fausseApi();
  Object.assign(sourceDeLEquipe, { lire: async () => [membre("supervisor"), membre("closer"), membre("manager"), membre("cook #14")] });
  const vue = await ouvrir();
  const choisi = () =>
    vue
      .element("onglets-du-projet")
      .children.filter(({ ariaSelected }) => ariaSelected === "true").map(({ textContent }) => textContent);
  assert.deepEqual(choisi(), ["Rail"]);
  const badge = (nom: string) => vue.element("equipe-du-projet").dessous("button").find(({ dataset }) => dataset.agent === nom) ?? assert.fail(`pas de badge ${nom}`);

  badge("manager").click();
  await repos();
  await repos();
  assert.deepEqual(choisi(), ["Agents"]);
  assert.equal(vue.element("rail").dataset.onglet, "agents");
  assert.ok(demandes.some(([demande]) => demande === "GET /api/agents/manager/gestures"));
  const carte = (id: string) => vue.element("rail").dessous("article").find(({ dataset }) => dataset.agent === id) ?? assert.fail(`pas de carte ${id}`);
  assert.match(parClasse(carte("manager"), "gestes-de-l-agent")[0]?.textContent ?? "", /the epic named three screens/);

  // Le badge d'un cook ouvre la carte des cooks.
  badge("cook #14").click();
  await repos();
  badge("cook #14").click();
  await repos();
  await repos();
  assert.ok(demandes.some(([demande]) => demande === "GET /api/agents/cook/gestures"));
  assert.equal(parClasse(carte("cook"), "gestes-de-l-agent").length, 1);
});

test("un badge refermé n'ouvre pas l'onglet : le chef reste où il est", async () => {
  fausseApi();
  Object.assign(sourceDeLEquipe, { lire: async () => [membre("closer")] });
  const vue = await ouvrir();
  const badge = () => vue.element("equipe-du-projet").dessous("button").find(({ dataset }) => dataset.agent === "closer") ?? assert.fail("pas de badge");
  badge().click();
  await repos();
  assert.equal(vue.element("rail").dataset.onglet, "agents", "le badge ouvert ouvre Agents");
  (vue.element("onglets-du-projet").children.find(({ textContent }) => textContent === "Rail") ?? assert.fail("pas de Rail")).click();
  await repos();
  badge().click();
  await repos();
  assert.equal(vue.element("rail").dataset.onglet, "rail", "le badge se referme, Rail reste");
});

// Le closer de Settings, tel que le bandeau de santé le lit (closer-sante.ts) : une passe mergée qui a retiré 1 234 lignes.
const CLOSER: LectureDuCloser = {
  passes: {
    liste: [
      {
        numero: 2477,
        url: "https://github.com/chef/parade/issues/2477",
        ouverte: false,
        ouverteLe: "2026-10-08T08:00:00.000Z",
        sha: "9f3c2a1",
        candidats: [{ id: "M1", quoi: "export `vieux` of `c.ts:12` — referenced nowhere" }],
        restants: 0,
        derive: ["last 20 merges: +3,120 / −840 (3.7:1)"],
        temps: ["Times stable since the previous pass."],
        pr: { numero: 2480, url: "https://github.com/chef/parade/pull/2480", mergee: true, retirees: 1234, ajoutees: 56 },
      },
    ],
  },
  verifications: { liste: [] },
  reglages: { liste: [] },
} as never;

test("les anciens chiffres du closer — ses passes et les lignes retirées — ne se montrent plus dans la page du projet", async () => {
  fausseApi();
  const vue = await ouvrir({ closerDeSante: async () => CLOSER } as Partial<Reponses>);
  await ouvrirLecture(vue, "Settings");
  await repos();
  const closer = vue.element("bandeau-sante").dessous("section").find(({ dataset }) => dataset.bloc === "closer") ?? assert.fail("pas de closer");
  assert.match(closer.textContent, /What it checks first/, "le bloc du closer est lu");
  assert.doesNotMatch(closer.textContent, /What it did/);
  assert.doesNotMatch(closer.textContent, /1,234 lines/);
  assert.equal([...closer.descendants()].filter(({ dataset }) => dataset.partie === "passes").length, 0);
});
