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

// #4117, critère 2 : par agent, sa raison d'être en une phrase, son état et sa prochaine passe, ses chiffres de 7 jours avec leur sens.
test("each agent shows what it is for, its state now, its next run, and its last-7-days figures with their meaning", async () => {
  fauxModule([
    agent("closer", { role: "The closer removes dead code the kitchen left behind.", state: "idle", week: [{ label: "fixed by itself", value: "7", meaning: "problems it repaired without the chef" }, { label: "handed to the chef", value: "2", meaning: "problems it could not decide alone" }, { label: "cost", value: "3.40", meaning: "dollars spent in the last 7 days" }] }),
    agent("cook-4001", { role: "A cook builds one ticket on its own branch.", state: "working on #4001", nextRun: { text: "cook-4001: none, it is cooking", at: "2026-11-25T12:30:00.000Z" } }),
    agent("supervisor", { role: "The supervisor watches the kitchen for stuck work.", state: "broken" }),
  ]);
  const vue = await ouvrirAgents();
  const montre = texte(vue);
  for (const phrase of ["The closer removes dead code the kitchen left behind.", "A cook builds one ticket on its own branch.", "The supervisor watches the kitchen for stuck work."]) assert.ok(montre.includes(phrase), phrase);
  for (const phrase of ["working on #4001", "broken", "closer: next run in 3 h", "supervisor: next run in 3 h"]) assert.ok(montre.includes(phrase), phrase);
  const closer = ligne(vue, "The closer removes dead code");
  for (const chiffre of ["fixed by itself", "problems it repaired without the chef", "handed to the chef", "problems it could not decide alone", "cost", "dollars spent in the last 7 days"]) assert.ok(montre.includes(chiffre), `no figure without its meaning: ${chiffre}`);
  assert.ok(closer !== undefined);
});
