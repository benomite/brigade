// Test d'acceptation gelé (#4117). La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
// Le contrat que ce test fixe, parce que le ticket le laisse ouvert : les données de l'onglet Agents passent par UN petit
// module, `app/src/vue/agents/source.js`, qui exporte l'objet `source` — `source.lire(projet)` rend un enregistrement par
// agent, `source.regler(agent, cle, valeur, projet)` change un réglage, à chaud. La vue les appelle par l'objet, à chaque
// usage : le test les remplace par un faux qui tient son état. Un réglage modifiable propose des `options` ; chacune est un
// `button` de la ligne du réglage, dont le texte est l'option. Un réglage qui ne se change pas porte `editable: false` et
// `livesIn` : la ligne dit où il vit, sans bouton. L'onglet est le bouton « Agents » du menu `onglets-du-projet`.
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
import { source } from "../../src/vue/agents/source.js";
import { jouerLaVue, repos, type Faux, type Jouee } from "../aides/fausse-vue.ts";

const A = "2026-11-25T12:04:12.000Z";
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

type Reglage = { key: string; label: string; value: string; options?: string[]; editable: boolean; livesIn?: string; changedAt?: string; changedBy?: string };
type Agent = {
  agent: string;
  role: string;
  state: string;
  nextRun: { text: string; at: string };
  week: { label: string; value: string; meaning: string }[];
  settings: Reglage[];
  gestures: { at: string; line: string; reason: string; outcome: string }[];
};
const agent = (nom: string, plus: Partial<Agent> = {}): Agent => ({
  agent: nom,
  role: `${nom} exists to do the job of ${nom}.`,
  state: "idle",
  nextRun: { text: `${nom}: next run in 3 h`, at: "2026-11-25T15:00:00.000Z" },
  week: [{ label: `handled-${nom}`, value: "12", meaning: `tickets ${nom} handled this week` }],
  settings: [
    { key: "model", label: "Model", value: "sonnet", options: ["sonnet", "opus"], editable: true },
    { key: "paused", label: "Pause", value: "running", options: ["running", "paused"], editable: true },
  ],
  gestures: [],
  ...plus,
});

function fauxModule(enregistrements: Agent[]) {
  const etat = structuredClone(enregistrements);
  const reglages: unknown[][] = [];
  Object.assign(source, {
    lire: async () => structuredClone(etat),
    regler: async (nom: string, cle: string, valeur: string, projet?: string) => {
      reglages.push([nom, cle, valeur, projet]);
      const reglage = etat.find((e) => e.agent === nom)?.settings.find((r) => r.key === cle);
      if (reglage !== undefined) Object.assign(reglage, { value: valeur, changedAt: "2026-11-25T12:10:00.000Z", changedBy: "the chef (app)" });
    },
  });
  return { reglages };
}

async function ouvrir(): Promise<Jouee> {
  const faits = { etat: "ouverte", lu: "2026-11-25T12:04:11.000Z", dernierTick: "2026-11-25T12:04:11.000Z", compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [] };
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const demandes = vue.appels.filter(({ geste }) => geste === "faits" || geste === "relireBox");
  const recue = tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: demandes.at(-1)?.args[0] as number });
  await repos();
  return vue;
}
async function ouvrirAgents(): Promise<Jouee> {
  const vue = await ouvrir();
  const onglet = vue.element("onglets-du-projet").children.find((c) => c.textContent.trim() === "Agents");
  assert.ok(onglet !== undefined, "the project menu has an Agents tab");
  onglet.click();
  await repos();
  return vue;
}
const visible = (noeud: Faux): boolean => {
  for (let pose: Faux | null = noeud; pose !== null; pose = pose.parentElement) if (pose.hidden) return false;
  return true;
};
const tout = (vue: Jouee): Faux[] => vue.poses().filter(visible);
const texte = (vue: Jouee): string => tout(vue).filter((p) => p.parentElement === null || visible(p)).map((p) => p.textContent).join("\n");
// La plus petite pose visible qui contient ce texte : la ligne qui le porte.
const ligne = (vue: Jouee, extrait: string): Faux => {
  const trouvees = tout(vue).filter((p) => p.textContent.includes(extrait));
  assert.ok(trouvees.length > 0, `« ${extrait} » is shown`);
  return trouvees.reduce((petit, p) => (p.textContent.length < petit.textContent.length ? p : petit));
};
const boutons = (racine: Faux): Faux[] => racine.dessous("button").filter(visible);

// #4117, critère 3 : les réglages de chaque agent se montrent et se changent depuis l'onglet ; un réglage fixe dit où il vit.
test("an agent's settings are changed from the tab, and a setting the app cannot change says where it lives", async () => {
  const { reglages } = fauxModule([
    agent("manager", {
      settings: [
        { key: "model", label: "Model", value: "sonnet", options: ["sonnet", "opus"], editable: true },
        { key: "autonomy", label: "Autonomy", value: "observe", options: ["observe", "propose", "act"], editable: true },
        { key: "paused", label: "Pause", value: "running", options: ["running", "paused"], editable: true },
        { key: "places", label: "Cooks' places", value: "2", options: ["2", "3", "4"], editable: true },
        { key: "clockGuard", label: "Gates clock guard", value: "20 min", editable: false, livesIn: "the BRIGADE_GATES_CLOCK variable on the box" },
      ],
    }),
  ]);
  const vue = await ouvrirAgents();
  const montre = texte(vue);
  for (const etiquette of ["Model", "Autonomy", "Pause", "Cooks' places", "Gates clock guard"]) assert.ok(montre.includes(etiquette), etiquette);
  const modele = ligne(vue, "Model");
  assert.ok(montre.includes("the BRIGADE_GATES_CLOCK variable on the box"), "the fixed setting says where it lives");
  assert.equal(boutons(ligne(vue, "the BRIGADE_GATES_CLOCK variable on the box")).length, 0, "no control on a setting the app cannot change");
  (boutons(modele).find((b) => b.textContent.trim() === "opus") ?? assert.fail("no « opus » button on the Model row")).click();
  await repos();
  (boutons(ligne(vue, "Autonomy")).find((b) => b.textContent.trim() === "propose") ?? assert.fail("no « propose » button")).click();
  await repos();
  (boutons(ligne(vue, "Pause")).find((b) => b.textContent.trim() === "paused") ?? assert.fail("no « paused » button")).click();
  await repos();
  (boutons(ligne(vue, "Cooks' places")).find((b) => b.textContent.trim() === "4") ?? assert.fail("no « 4 » button")).click();
  await repos();
  assert.deepEqual(reglages.map(([nom, cle, valeur]) => [nom, cle, valeur]), [["manager", "model", "opus"], ["manager", "autonomy", "propose"], ["manager", "paused", "paused"], ["manager", "places", "4"]]);
  assert.ok(reglages.every((appel) => appel[3] === "parade"), "the change names the project");
});
